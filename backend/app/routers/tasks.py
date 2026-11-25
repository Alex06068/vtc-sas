from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import Task, User, Enrollment, Course
from ..schemas import TaskCreate, TaskResponse
from .auth import get_current_user

router = APIRouter()

@router.post("/", response_model=TaskResponse)
def create_task(task: TaskCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_task = Task(
        user_id=current_user.id,
        title=task.title,
        due_date=task.due_date,
        weighting=task.weighting,
        course_id=getattr(task, "course_id", None),
        category=getattr(task, "category", None),
        source="manual",
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task

@router.get("/", response_model=List[TaskResponse])
def get_tasks(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    personal = db.query(Task).filter(Task.user_id == current_user.id).all()

    enrollments = db.query(Enrollment).filter(Enrollment.user_id == current_user.id).all()
    course_ids = {e.course_id for e in enrollments}
    taught = db.query(Course.id).filter(Course.teacher_id == current_user.id).all()
    course_ids.update(row[0] for row in taught)

    course_tasks = []
    if course_ids:
        course_tasks = db.query(Task).filter(Task.course_id.in_(course_ids)).all()

    all_tasks = {t.id: t for t in personal + course_tasks}
    return list(all_tasks.values())
