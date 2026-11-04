from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Course, Module, User
from .auth import get_current_user

router = APIRouter()

class CourseCreate(BaseModel):
    code: str
    name: str
    description: Optional[str] = None

class ModuleCreate(BaseModel):
    title: str
    order: int = 0

@router.post("/")
def create_course(course: CourseCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    existing = db.query(Course).filter(Course.code == course.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Course code already exists")
    db_course = Course(code=course.code, name=course.name, description=course.description, teacher_id=current_user.id)
    db.add(db_course)
    db.commit()
    db.refresh(db_course)
    return db_course

@router.get("/")
def list_courses(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Course).all()

@router.post("/{course_id}/modules")
def add_module(course_id: int, module: ModuleCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    db_mod = Module(course_id=course_id, title=module.title, order=module.order)
    db.add(db_mod)
    db.commit()
    db.refresh(db_mod)
    return db_mod

@router.get("/{course_id}/modules")
def list_modules(course_id: int, db: Session = Depends(get_db)):
    return db.query(Module).filter(Module.course_id == course_id).order_by(Module.order).all()
