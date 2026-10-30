from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import Task, User
from ..schemas import TaskCreate, TaskResponse
from .auth import oauth2_scheme
from jose import jwt, JWTError

router = APIRouter()
SECRET_KEY = "your-super-secret-key-change-this-in-production"
ALGORITHM = "HS256"

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user

@router.post("/", response_model=TaskResponse)
def create_task(task: TaskCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_task = Task(user_id=current_user.id, title=task.title, due_date=task.due_date, weighting=task.weighting, source="manual")
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task

@router.get("/", response_model=List[TaskResponse])
def get_tasks(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Task).filter(Task.user_id == current_user.id).all()
