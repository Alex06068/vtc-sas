from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from ..database import get_db
from ..models import Task, User
from ..schemas import TaskCreate, TaskResponse
from .auth import oauth2_scheme
from jose import jwt, JWTError

router = APIRouter()
SECRET_KEY = "your-super-secret-key-change-this-in-production"
ALGORITHM = "HS256"

async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user

@router.post("/", response_model=TaskResponse)
async def create_task(task: TaskCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    db_task = Task(user_id=current_user.id, title=task.title, due_date=task.due_date, weighting=task.weighting, source="manual")
    db.add(db_task)
    await db.commit()
    await db.refresh(db_task)
    return db_task

@router.get("/", response_model=List[TaskResponse])
async def get_tasks(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Task).where(Task.user_id == current_user.id))
    return result.scalars().all()
