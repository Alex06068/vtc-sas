from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    role: str = "student"

class Token(BaseModel):
    access_token: str
    token_type: str

class TaskCreate(BaseModel):
    title: str
    due_date: Optional[datetime] = None
    weighting: Optional[str] = None
    course_id: Optional[int] = None
    category: Optional[str] = None

class TaskResponse(BaseModel):
    id: int
    title: str
    due_date: Optional[datetime]
    weighting: Optional[str]
    course_id: Optional[int]
    category: Optional[str] = None
    is_completed: bool
    source: Optional[str]
    location: Optional[str] = None

    class Config:
        from_attributes = True
