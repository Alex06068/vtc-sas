from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from .routers import auth, tasks, chat, attendance, courses, calendar
from .db_setup import init_database
from . import models  # noqa: F401
import os

app = FastAPI(title="VTC-SAS API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(attendance.router, prefix="/api/attendance", tags=["attendance"])
app.include_router(courses.router, prefix="/api/courses", tags=["courses"])
app.include_router(calendar.router, prefix="/api/calendar", tags=["calendar"])

APP_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.abspath(os.path.join(APP_DIR, ".."))
FRONTEND_DIR = os.path.abspath(os.path.join(BACKEND_DIR, "..", "frontend"))
LEGACY_STATIC = os.path.join(BACKEND_DIR, "static")


def serve_page(directory: str, filename: str):
    directory = os.path.abspath(directory)
    path = os.path.abspath(os.path.join(directory, filename))
    if path != directory and not path.startswith(directory + os.sep):
        return {"detail": "Page not found"}
    if os.path.isfile(path):
        return FileResponse(path)
    return {"detail": "Page not found"}


def serve_frontend(filename: str):
    return serve_page(FRONTEND_DIR, filename)


@app.get("/")
def root():
    return serve_frontend("index.html")


@app.get("/index.html")
def index_page():
    return serve_frontend("index.html")


@app.get("/login.html")
def login_page():
    return serve_frontend("login.html")


@app.get("/course.html")
def course_page():
    return serve_frontend("course.html")


@app.get("/assignments.html")
def assignments_page():
    return serve_frontend("assignments.html")


@app.get("/attendance.html")
def attendance_page():
    return serve_frontend("attendance.html")


@app.get("/calendar.html")
def calendar_page():
    return serve_frontend("calendar.html")


@app.get("/chat.html")
def chat_page():
    frontend_chat = os.path.join(FRONTEND_DIR, "chat.html")
    if os.path.isfile(frontend_chat):
        return serve_frontend("chat.html")
    return serve_page(LEGACY_STATIC, "chat.html")


@app.get("/courses.html")
def courses_legacy():
    return RedirectResponse(url="/index.html", status_code=307)


css_dir = os.path.join(FRONTEND_DIR, "css")
js_dir = os.path.join(FRONTEND_DIR, "js")
if os.path.isdir(css_dir):
    app.mount("/css", StaticFiles(directory=css_dir), name="css")
if os.path.isdir(js_dir):
    app.mount("/js", StaticFiles(directory=js_dir), name="js")


@app.on_event("startup")
def startup():
    init_database()
    if not os.path.isdir(FRONTEND_DIR):
        print(f"Warning: frontend directory not found at {FRONTEND_DIR}")
