from datetime import date
import json
from typing import Any, List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Course, Enrollment, Module, User
from .auth import get_current_user, require_teacher

router = APIRouter()


class CourseCreate(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class CourseUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class ModuleLink(BaseModel):
    title: Optional[str] = None
    url: str


class ModuleCreate(BaseModel):
    title: str
    week_number: Optional[int] = Field(default=None, ge=1)
    start_date: Optional[date] = None
    content: Optional[str] = None
    links: Optional[List[Union[str, ModuleLink]]] = None
    order: Optional[int] = None


class ModuleUpdate(BaseModel):
    title: Optional[str] = None
    week_number: Optional[int] = Field(default=None, ge=1)
    start_date: Optional[date] = None
    content: Optional[str] = None
    links: Optional[List[Union[str, ModuleLink]]] = None
    order: Optional[int] = None


def _dump(model: BaseModel) -> dict:
    if hasattr(model, "model_dump"):
        return model.model_dump(exclude_unset=True)
    return model.dict(exclude_unset=True)


def _validate_term(start: Optional[date], end: Optional[date]) -> None:
    if start and end and end < start:
        raise HTTPException(status_code=400, detail="End date must be on or after the start date")


def _normalize_links(raw: Optional[List[Any]]) -> List[dict]:
    if not raw:
        return []
    out = []
    for item in raw:
        if isinstance(item, ModuleLink):
            url = (item.url or "").strip()
            title = (item.title or "").strip() or url
        elif isinstance(item, dict):
            url = str(item.get("url") or "").strip()
            title = str(item.get("title") or "").strip() or url
        else:
            url = str(item or "").strip()
            title = url
        if not url:
            continue
        out.append({"title": title, "url": url})
    return out


def _parse_stored_links(raw: Optional[str]) -> List[dict]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        return []
    if not isinstance(data, list):
        return []
    return _normalize_links(data)


def _course_out(course: Course) -> dict:
    return {
        "id": course.id,
        "code": course.code,
        "name": course.name,
        "description": course.description,
        "teacher_id": course.teacher_id,
        "start_date": course.start_date.isoformat() if course.start_date else None,
        "end_date": course.end_date.isoformat() if course.end_date else None,
        "created_at": course.created_at.isoformat() if course.created_at else None,
    }


def _module_out(module: Module) -> dict:
    return {
        "id": module.id,
        "course_id": module.course_id,
        "title": module.title,
        "order": module.order,
        "week_number": module.week_number,
        "start_date": module.start_date.isoformat() if module.start_date else None,
        "content": module.content or "",
        "links": _parse_stored_links(module.links),
        "created_at": module.created_at.isoformat() if module.created_at else None,
    }


def _enroll(db: Session, user_id: int, course_id: int) -> None:
    existing = db.query(Enrollment).filter(
        Enrollment.user_id == user_id,
        Enrollment.course_id == course_id,
    ).first()
    if existing:
        return
    db.add(Enrollment(user_id=user_id, course_id=course_id))
    db.commit()


def _is_enrolled(db: Session, user_id: int, course_id: int) -> bool:
    return db.query(Enrollment).filter(
        Enrollment.user_id == user_id,
        Enrollment.course_id == course_id,
    ).first() is not None


def _can_access_course(db: Session, user: User, course: Course) -> bool:
    if course.teacher_id == user.id:
        return True
    return _is_enrolled(db, user.id, course.id)


def _get_course_or_404(db: Session, course_id: int) -> Course:
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


def _require_visible_course(db: Session, user: User, course_id: int) -> Course:
    course = _get_course_or_404(db, course_id)
    if not _can_access_course(db, user, course):
        raise HTTPException(status_code=403, detail="You do not have access to this course")
    return course


def _require_course_teacher(user: User, course: Course) -> None:
    if course.teacher_id != user.id:
        raise HTTPException(status_code=403, detail="Only the course teacher can edit this course")


@router.post("/")
def create_course(course: CourseCreate, current_user: User = Depends(require_teacher), db: Session = Depends(get_db)):
    existing = db.query(Course).filter(Course.code == course.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Course code already exists")
    _validate_term(course.start_date, course.end_date)
    db_course = Course(
        code=course.code.strip(),
        name=course.name.strip(),
        description=course.description,
        teacher_id=current_user.id,
        start_date=course.start_date,
        end_date=course.end_date,
    )
    db.add(db_course)
    db.commit()
    db.refresh(db_course)
    # So the new course appears in GET /api/courses/my without a separate join call.
    _enroll(db, current_user.id, db_course.id)
    return _course_out(db_course)


@router.get("/")
def list_courses(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [_course_out(c) for c in db.query(Course).all()]


@router.post("/join/{course_code}")
def join_course(course_code: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    course = db.query(Course).filter(Course.code == course_code).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    existing = db.query(Enrollment).filter(
        Enrollment.user_id == current_user.id,
        Enrollment.course_id == course.id,
    ).first()
    if existing:
        return {"message": "Already enrolled"}
    db.add(Enrollment(user_id=current_user.id, course_id=course.id))
    db.commit()
    return {"message": f"Joined {course.code}"}


@router.get("/my")
def my_courses(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Students: courses they joined. Teachers: also courses they created,
    # even if they were never enrolled (e.g. created earlier via the chatbot).
    enrollments = db.query(Enrollment).filter(Enrollment.user_id == current_user.id).all()
    course_ids = {e.course_id for e in enrollments}
    taught = db.query(Course.id).filter(Course.teacher_id == current_user.id).all()
    course_ids.update(row[0] for row in taught)
    if not course_ids:
        return []
    courses = db.query(Course).filter(Course.id.in_(course_ids)).order_by(Course.code).all()
    return [_course_out(c) for c in courses]


@router.get("/{course_id}")
def get_course(course_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    course = _require_visible_course(db, current_user, course_id)
    return _course_out(course)


@router.put("/{course_id}")
def update_course(course_id: int, payload: CourseUpdate, current_user: User = Depends(require_teacher), db: Session = Depends(get_db)):
    course = _get_course_or_404(db, course_id)
    _require_course_teacher(current_user, course)
    data = _dump(payload)
    if "code" in data and data["code"] is not None:
        code = str(data["code"]).strip()
        if not code:
            raise HTTPException(status_code=400, detail="Course code is required")
        clash = db.query(Course).filter(Course.code == code, Course.id != course.id).first()
        if clash:
            raise HTTPException(status_code=400, detail="Course code already exists")
        course.code = code
    if "name" in data and data["name"] is not None:
        name = str(data["name"]).strip()
        if not name:
            raise HTTPException(status_code=400, detail="Course name is required")
        course.name = name
    if "description" in data:
        course.description = data["description"]
    if "start_date" in data:
        course.start_date = data["start_date"]
    if "end_date" in data:
        course.end_date = data["end_date"]
    _validate_term(course.start_date, course.end_date)
    db.commit()
    db.refresh(course)
    return _course_out(course)


def _next_module_order(db: Session, course_id: int) -> int:
    current = db.query(Module.order).filter(Module.course_id == course_id).order_by(Module.order.desc()).first()
    if not current or current[0] is None:
        return 1
    return int(current[0]) + 1


def _apply_module_fields(module: Module, data: dict) -> None:
    if "title" in data and data["title"] is not None:
        title = str(data["title"]).strip()
        if not title:
            raise HTTPException(status_code=400, detail="Week title is required")
        module.title = title
    if "week_number" in data:
        module.week_number = data["week_number"]
    if "start_date" in data:
        module.start_date = data["start_date"]
    if "content" in data:
        module.content = data["content"]
    if "links" in data:
        links = _normalize_links(data["links"])
        module.links = json.dumps(links)
    if "order" in data and data["order"] is not None:
        module.order = data["order"]


@router.post("/{course_id}/modules")
def add_module(course_id: int, module: ModuleCreate, current_user: User = Depends(require_teacher), db: Session = Depends(get_db)):
    course = _get_course_or_404(db, course_id)
    _require_course_teacher(current_user, course)
    data = _dump(module)
    order = data.get("order")
    if order is None:
        order = _next_module_order(db, course_id)
    db_mod = Module(
        course_id=course_id,
        title=module.title.strip(),
        order=order,
    )
    _apply_module_fields(db_mod, data)
    db.add(db_mod)
    db.commit()
    db.refresh(db_mod)
    return _module_out(db_mod)


@router.get("/{course_id}/modules")
def list_modules(course_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_visible_course(db, current_user, course_id)
    modules = (
        db.query(Module)
        .filter(Module.course_id == course_id)
        .order_by(
            Module.week_number.is_(None),
            Module.week_number,
            Module.order,
            Module.id,
        )
        .all()
    )
    return [_module_out(m) for m in modules]


@router.put("/{course_id}/modules/{module_id}")
def update_module(course_id: int, module_id: int, payload: ModuleUpdate, current_user: User = Depends(require_teacher), db: Session = Depends(get_db)):
    course = _get_course_or_404(db, course_id)
    _require_course_teacher(current_user, course)
    module = db.query(Module).filter(Module.id == module_id, Module.course_id == course_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Week not found")
    _apply_module_fields(module, _dump(payload))
    db.commit()
    db.refresh(module)
    return _module_out(module)


@router.delete("/{course_id}/modules/{module_id}")
def delete_module(course_id: int, module_id: int, current_user: User = Depends(require_teacher), db: Session = Depends(get_db)):
    course = _get_course_or_404(db, course_id)
    _require_course_teacher(current_user, course)
    module = db.query(Module).filter(Module.id == module_id, Module.course_id == course_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Week not found")
    db.delete(module)
    db.commit()
    return {"message": "Week deleted"}
