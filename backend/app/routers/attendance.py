from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from datetime import date
from typing import Optional
from ..database import get_db
from ..models import Attendance, User, SchoolNetwork, Course, Enrollment
from .auth import get_current_user, require_teacher
from ..school_ip import (
    require_school_ip_for_student,
    normalize_cidr_input,
    enforcement_active,
    env_networks,
)

router = APIRouter()

class CheckInRequest(BaseModel):
    status: str = "present"  # present / absent / late
    course_id: Optional[int] = None

class SchoolNetworkCreate(BaseModel):
    cidr: str = Field(..., min_length=1)
    label: Optional[str] = None

class SchoolNetworkUpdate(BaseModel):
    enabled: Optional[bool] = None
    label: Optional[str] = None

def _network_payload(row: SchoolNetwork) -> dict:
    return {
        "id": row.id,
        "cidr": row.cidr,
        "label": row.label,
        "enabled": row.enabled,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }

def record_checkin(
    db: Session,
    user: User,
    status: str,
    client_ip: Optional[str],
    course_id: Optional[int] = None,
) -> dict:
    today = date.today().isoformat()
    query = db.query(Attendance).filter(
        Attendance.user_id == user.id,
        Attendance.date == today,
    )
    if course_id is None:
        query = query.filter(Attendance.course_id.is_(None))
    else:
        query = query.filter(Attendance.course_id == course_id)
    existing = query.first()
    if existing:
        existing.status = status
        existing.client_ip = client_ip
        if course_id is not None:
            existing.course_id = course_id
        db.commit()
        return {
            "message": f"Updated today's attendance to {status}",
            "course_id": existing.course_id,
        }

    att = Attendance(
        user_id=user.id,
        date=today,
        status=status,
        client_ip=client_ip,
        course_id=course_id,
    )
    db.add(att)
    db.commit()
    return {"message": f"Checked in as {status}", "course_id": course_id}

@router.post("/checkin")
def checkin(
    req: CheckInRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    course_id = req.course_id
    if course_id is not None:
        course = db.query(Course).filter(Course.id == course_id).first()
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
    client_ip = require_school_ip_for_student(request, db, current_user)
    return record_checkin(db, current_user, req.status, client_ip, course_id=course_id)

@router.get("/my")
def my_attendance(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    records = db.query(Attendance).filter(Attendance.user_id == current_user.id).order_by(Attendance.date.desc()).all()
    return [
        {"date": r.date, "status": r.status, "course_id": r.course_id}
        for r in records
    ]

@router.get("/school-networks")
def list_school_networks(
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    rows = db.query(SchoolNetwork).order_by(SchoolNetwork.id.asc()).all()
    return {
        "items": [_network_payload(row) for row in rows],
        "env_networks": [str(net) for net in env_networks()],
        "enforcement_active": enforcement_active(db),
    }

@router.post("/school-networks")
def add_school_network(
    body: SchoolNetworkCreate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    try:
        cidr = normalize_cidr_input(body.cidr)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid IP or CIDR")

    existing = db.query(SchoolNetwork).filter(SchoolNetwork.cidr == cidr).first()
    if existing:
        raise HTTPException(status_code=400, detail="That school network is already configured")

    row = SchoolNetwork(cidr=cidr, label=(body.label or "").strip() or None, enabled=True)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _network_payload(row)

@router.patch("/school-networks/{network_id}")
def update_school_network(
    network_id: int,
    body: SchoolNetworkUpdate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    row = db.query(SchoolNetwork).filter(SchoolNetwork.id == network_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="School network not found")
    if body.enabled is None and body.label is None:
        raise HTTPException(status_code=400, detail="Provide enabled and/or label")
    if body.enabled is not None:
        row.enabled = body.enabled
    if body.label is not None:
        row.label = body.label.strip() or None
    db.commit()
    db.refresh(row)
    return _network_payload(row)
