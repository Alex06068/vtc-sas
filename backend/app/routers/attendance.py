from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import date
from ..database import get_db
from ..models import Attendance, User
from .auth import get_current_user

router = APIRouter()

class CheckInRequest(BaseModel):
    status: str = "present"  # present / absent / late

@router.post("/checkin")
def checkin(req: CheckInRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today = date.today().isoformat()
    existing = db.query(Attendance).filter(
        Attendance.user_id == current_user.id,
        Attendance.date == today
    ).first()
    if existing:
        existing.status = req.status
        db.commit()
        return {"message": f"Updated today's attendance to {req.status}"}
    
    att = Attendance(user_id=current_user.id, date=today, status=req.status)
    db.add(att)
    db.commit()
    return {"message": f"Checked in as {req.status}"}

@router.get("/my")
def my_attendance(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    records = db.query(Attendance).filter(Attendance.user_id == current_user.id).order_by(Attendance.date.desc()).all()
    return [{"date": r.date, "status": r.status} for r in records]
