from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from .database import engine, Base
from .routers import auth, tasks, chat, attendance, courses
from . import models
import os

app = FastAPI(title="VTC-SAS API", version="0.1.0")

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

static_dir = os.path.join(os.path.dirname(__file__), "..", "static")

def serve_page(filename: str):
    path = os.path.join(static_dir, filename)
    if os.path.exists(path):
        return FileResponse(path)
    return {"detail": "Page not found"}

@app.get("/")
def root():
    return serve_page("index.html")

@app.get("/courses.html")
def courses_page():
    return serve_page("courses.html")

@app.get("/assignments.html")
def assignments_page():
    return serve_page("assignments.html")

@app.get("/attendance.html")
def attendance_page():
    return serve_page("attendance.html")

@app.get("/chat.html")
def chat_page():
    return serve_page("chat.html")

@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    print("Database tables created/verified")
