from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from .routers import auth, tasks, chat
from . import models  # ensure models are imported so tables are created

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

@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    print("Database tables created/verified")

@app.get("/")
def root():
    return {"message": "VTC Smart Academic Scheduler API is running"}
