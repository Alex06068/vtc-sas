from datetime import datetime, date, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import CalendarEvent, Holiday, Course, Enrollment, User
from .auth import get_current_user, require_teacher

router = APIRouter()

ALLOWED_TYPES = {"event", "exam", "project", "assignment", "holiday"}


class EventCreate(BaseModel):
    title: str = Field(..., min_length=1)
    start_at: datetime
    end_at: Optional[datetime] = None
    type: str = "event"
    course_id: Optional[int] = None


class EventUpdate(BaseModel):
    title: Optional[str] = None
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    type: Optional[str] = None
    course_id: Optional[int] = None


def _event_payload(row: CalendarEvent) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "start_at": row.start_at.isoformat() if row.start_at else None,
        "end_at": row.end_at.isoformat() if row.end_at else None,
        "type": row.type,
        "course_id": row.course_id,
        "created_by": row.created_by,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def _visible_course_ids(db: Session, user: User) -> set:
    enrollments = db.query(Enrollment).filter(Enrollment.user_id == user.id).all()
    ids = {e.course_id for e in enrollments}
    taught = db.query(Course.id).filter(Course.teacher_id == user.id).all()
    ids.update(row[0] for row in taught)
    return ids


def _normalize_type(value: str) -> str:
    kind = (value or "event").strip().lower()
    if kind not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Invalid event type")
    return kind


@router.get("/events")
def list_events(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    course_ids = _visible_course_ids(db, current_user)
    rows = db.query(CalendarEvent).order_by(CalendarEvent.start_at.asc()).all()
    visible: List[CalendarEvent] = []
    for row in rows:
        if row.course_id is None or row.course_id in course_ids or current_user.role == "teacher":
            visible.append(row)
    return [_event_payload(row) for row in visible]


@router.post("/events")
def create_event(
    body: EventCreate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    kind = _normalize_type(body.type)
    if body.course_id is not None:
        course = db.query(Course).filter(Course.id == body.course_id).first()
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
    row = CalendarEvent(
        title=body.title.strip(),
        start_at=body.start_at,
        end_at=body.end_at,
        type=kind,
        course_id=body.course_id,
        created_by=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _event_payload(row)


@router.put("/events/{event_id}")
def update_event(
    event_id: int,
    body: EventUpdate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    row = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Event not found")
    if body.title is not None:
        title = body.title.strip()
        if not title:
            raise HTTPException(status_code=400, detail="Title is required")
        row.title = title
    if body.start_at is not None:
        row.start_at = body.start_at
    if "end_at" in body.model_fields_set:
        row.end_at = body.end_at
    if body.type is not None:
        row.type = _normalize_type(body.type)
    if "course_id" in body.model_fields_set:
        if body.course_id is not None:
            course = db.query(Course).filter(Course.id == body.course_id).first()
            if not course:
                raise HTTPException(status_code=404, detail="Course not found")
        row.course_id = body.course_id
    db.commit()
    db.refresh(row)
    return _event_payload(row)


@router.delete("/events/{event_id}")
def delete_event(
    event_id: int,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    row = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Event not found")
    db.delete(row)
    db.commit()
    return {"message": "Event deleted"}


@router.get("/holidays")
def list_holidays(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(Holiday).order_by(Holiday.date.asc()).all()
    return [
        {
            "id": row.id,
            "date": row.date.isoformat() if isinstance(row.date, date) else str(row.date),
            "name": row.name,
            "region": row.region,
        }
        for row in rows
    ]
