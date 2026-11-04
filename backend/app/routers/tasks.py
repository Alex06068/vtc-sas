from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import Task, User, Enrollment, Course
from ..schemas import TaskCreate, TaskResponse
from .auth import get_current_user

router = APIRouter()

@router.post("/", response_model=TaskResponse)
def create_task(task: TaskCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # If course_id is provided, only teacher of that course or admin can create
    db_task = Task(
        user_id=current_user.id,
        title=task.title,
        due_date=task.due_date,
        weighting=task.weighting,
        course_id=getattr(task, 'course_id', None),
        source="manual"
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task

@router.get("/", response_model=List[TaskResponse])
def get_tasks(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Get personal tasks + tasks from enrolled courses
    personal = db.query(Task).filter(Task.user_id == current_user.id).all()

    # Get course IDs the user is enrolled in
    enrollments = db.query(Enrollment).filter(Enrollment.user_id == current_user.id).all()
    course_ids = [e.course_id for e in enrollments]

    course_tasks = []
    if course_ids:
        course_tasks = db.query(Task).filter(Task.course_id.in_(course_ids)).all()

    # Merge and remove duplicates
    all_tasks = {t.id: t for t in personal + course_tasks}
    return list(all_tasks.values())
