from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class UserCreate(BaseModel):
    username: str
    email: Optional[str] = None
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TaskCreate(BaseModel):
    title: str
    due_date: Optional[datetime] = None
    weighting: Optional[str] = None

class TaskResponse(BaseModel):
    id: int
    title: str
    due_date: Optional[datetime]
    weighting: Optional[str]
    is_completed: bool
    source: Optional[str]
    
    class Config:
        from_attributes = True
