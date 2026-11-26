"""Week file uploads, date extraction, and teacher confirmation."""
import os
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..extract import (
    CLASS_LABELS,
    analyse_file,
    extension,
    is_allowed_filename,
    legacy_format_message,
)
from ..models import FileExtraction, Module, Task, User, WeekFile
from ..storage import (
    MAX_FILE_BYTES,
    MAX_FILES_PER_BATCH,
    absolute_path,
    delete_module_files,
    delete_stored,
    store_file,
)
from .auth import get_current_user, require_teacher
from .courses import _get_course_or_404, _require_course_teacher, _require_visible_course
from ..section_dates import upsert_section_extractions

router = APIRouter()


class ExtractionEdit(BaseModel):
    id: int
    action: str = "confirm"  # confirm | dismiss
    title: Optional[str] = None
    kind: Optional[str] = None
    due_at: Optional[datetime] = None
    location: Optional[str] = None
    classified_type: Optional[str] = None


class ConfirmPayload(BaseModel):
    items: List[ExtractionEdit]


def _file_out(row: WeekFile, extractions: list, include_pending: bool) -> dict:
    visible = []
    for item in extractions:
        if item.status == "confirmed" or (include_pending and item.status == "pending"):
            visible.append(_extraction_out(item, row))
    return {
        "id": row.id,
        "course_id": row.course_id,
        "module_id": row.module_id,
        "original_name": row.original_name,
        "extension": row.extension,
        "size_bytes": row.size_bytes,
        "classified_type": row.classified_type,
        "classified_label": CLASS_LABELS.get(row.classified_type or "", row.classified_type),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "download_url": f"/api/courses/{row.course_id}/files/{row.id}/download",
        "extractions": visible,
    }


def _extraction_out(item: FileExtraction, week_file: Optional[WeekFile] = None) -> dict:
    return {
        "id": item.id,
        "file_id": item.file_id,
        "module_id": item.module_id,
        "course_id": item.course_id,
        "kind": item.kind,
        "title": item.title,
        "due_at": item.due_at.isoformat() if item.due_at else None,
        "location": item.location or "",
        "snippet": item.snippet or "",
        "status": item.status,
        "filename": week_file.original_name if week_file else None,
        "classified_type": week_file.classified_type if week_file else None,
        "published_task_id": item.published_task_id,
        "source": item.source or ("file" if item.file_id else "section_title"),
        "conflict_type": item.conflict_type or "",
        "conflict_note": item.conflict_note or "",
        "alternate_value": item.alternate_value or "",
    }


def _get_module(db: Session, course_id: int, module_id: int) -> Module:
    module = db.query(Module).filter(Module.id == module_id, Module.course_id == course_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Week not found")
    return module


def cleanup_module_uploads(db: Session, course_id: int, module_id: int) -> None:
    files = db.query(WeekFile).filter(WeekFile.course_id == course_id, WeekFile.module_id == module_id).all()
    file_ids = [row.id for row in files]
    db.query(FileExtraction).filter(FileExtraction.module_id == module_id).delete(synchronize_session=False)
    if file_ids:
        db.query(WeekFile).filter(WeekFile.id.in_(file_ids)).delete(synchronize_session=False)
    delete_module_files(course_id, module_id)


def _publish_task(db: Session, item: FileExtraction, teacher: User) -> Task:
    category = "exam" if item.kind == "exam" else "assignment"
    if item.published_task_id:
        task = db.query(Task).filter(Task.id == item.published_task_id).first()
        if task:
            task.title = item.title
            task.due_date = item.due_at
            task.category = category
            task.location = item.location
            return task
    task = Task(
        user_id=teacher.id,
        course_id=item.course_id,
        title=item.title,
        due_date=item.due_at,
        category=category,
        source="file_extract",
        location=item.location,
        is_completed=False,
    )
    db.add(task)
    db.flush()
    item.published_task_id = task.id
    return task


@router.post("/{course_id}/modules/{module_id}/files")
async def upload_week_files(
    course_id: int,
    module_id: int,
    files: List[UploadFile] = File(...),
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    course = _get_course_or_404(db, course_id)
    _require_course_teacher(current_user, course)
    _get_module(db, course_id, module_id)

    if not files:
        raise HTTPException(status_code=400, detail="Please choose one or more files to upload.")
    if len(files) > MAX_FILES_PER_BATCH:
        raise HTTPException(status_code=400, detail=f"Please upload at most {MAX_FILES_PER_BATCH} files at a time.")

    saved = []
    pending = []
    errors = []
    for upload in files:
        name = upload.filename or "file"
        legacy = legacy_format_message(name)
        if legacy:
            errors.append(legacy)
            continue
        if not is_allowed_filename(name):
            errors.append(f"{name} is not a supported type. Please use Word (.docx), Excel (.xlsx), PowerPoint (.pptx) or PDF.")
            continue
        data = await upload.read()
        if not data:
            errors.append(f"{name} is empty.")
            continue
        if len(data) > MAX_FILE_BYTES:
            errors.append(f"{name} is larger than 15 MB.")
            continue
        stored = store_file(course_id, module_id, name, data)
        path = absolute_path(course_id, module_id, stored)
        analysis = analyse_file(path, name)
        row = WeekFile(
            course_id=course_id,
            module_id=module_id,
            uploaded_by=current_user.id,
            original_name=name,
            stored_name=stored,
            extension=extension(name),
            size_bytes=len(data),
            classified_type=analysis["classified_type"],
        )
        db.add(row)
        db.flush()
        file_items = []
        for extracted in analysis["items"]:
            item = FileExtraction(
                file_id=row.id,
                course_id=course_id,
                module_id=module_id,
                kind=extracted["kind"],
                title=extracted["title"],
                due_at=datetime.fromisoformat(extracted["due_at"]) if extracted.get("due_at") else None,
                location=extracted.get("location") or "",
                snippet=extracted.get("snippet") or "",
                status="pending",
                source="file",
                conflict_type=extracted.get("conflict_type"),
                conflict_note=extracted.get("conflict_note"),
                alternate_value=extracted.get("alternate_value"),
            )
            db.add(item)
            db.flush()
            file_items.append(item)
            pending.append(_extraction_out(item, row))
        saved.append(_file_out(row, file_items, include_pending=True))

    db.commit()
    return {"files": saved, "extractions": pending, "errors": errors}


@router.get("/{course_id}/files")
def list_course_files(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    course = _require_visible_course(db, current_user, course_id)
    include_pending = current_user.role == "teacher" and course.teacher_id == current_user.id
    rows = (
        db.query(WeekFile)
        .filter(WeekFile.course_id == course_id)
        .order_by(WeekFile.created_at.asc(), WeekFile.id.asc())
        .all()
    )
    extra_by_file = {}
    if rows:
        items = db.query(FileExtraction).filter(FileExtraction.file_id.in_([row.id for row in rows])).all()
        for item in items:
            extra_by_file.setdefault(item.file_id, []).append(item)
    return [_file_out(row, extra_by_file.get(row.id, []), include_pending) for row in rows]


@router.get("/{course_id}/extractions")
def list_extractions(
    course_id: int,
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    course = _require_visible_course(db, current_user, course_id)
    is_teacher = current_user.role == "teacher" and current_user.id == course.teacher_id
    query = db.query(FileExtraction).filter(FileExtraction.course_id == course_id)
    if not is_teacher:
        query = query.filter(FileExtraction.status == "confirmed")
    elif status:
        query = query.filter(FileExtraction.status == status)
    items = query.order_by(FileExtraction.id.asc()).all()
    files = {row.id: row for row in db.query(WeekFile).filter(WeekFile.course_id == course_id).all()}
    return [_extraction_out(item, files.get(item.file_id)) for item in items]


@router.post("/{course_id}/modules/{module_id}/extract-text")
def extract_module_text(
    course_id: int,
    module_id: int,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """Re-run date extraction on a week or topic title and description."""
    course = _get_course_or_404(db, course_id)
    _require_course_teacher(current_user, course)
    module = _get_module(db, course_id, module_id)
    rows = upsert_section_extractions(db, course_id, module.id, module.title, module.content or "")
    db.commit()
    pending = [row for row in rows if row.status == "pending"]
    return {
        "module_id": module.id,
        "extractions": [_extraction_out(row) for row in rows],
        "pending": [_extraction_out(row) for row in pending],
    }


@router.post("/{course_id}/extractions/confirm")
def confirm_extractions(
    course_id: int,
    payload: ConfirmPayload,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    course = _get_course_or_404(db, course_id)
    _require_course_teacher(current_user, course)
    if not payload.items:
        raise HTTPException(status_code=400, detail="Nothing to confirm.")

    now = datetime.now(timezone.utc)
    confirmed = []
    dismissed = []
    for edit in payload.items:
        item = db.query(FileExtraction).filter(
            FileExtraction.id == edit.id,
            FileExtraction.course_id == course_id,
        ).first()
        if not item:
            raise HTTPException(status_code=404, detail=f"Extraction {edit.id} was not found")
        action = (edit.action or "confirm").strip().lower()
        if edit.title is not None:
            title = edit.title.strip()
            if title:
                item.title = title
        if edit.kind in {"assignment", "exam"}:
            item.kind = edit.kind
        if edit.due_at is not None:
            item.due_at = edit.due_at
        if edit.location is not None:
            item.location = edit.location.strip()
        if edit.classified_type in {"notes", "assignment_brief", "exam_schedule"}:
            week_file = db.query(WeekFile).filter(WeekFile.id == item.file_id).first()
            if week_file:
                week_file.classified_type = edit.classified_type

        if action == "dismiss":
            item.status = "dismissed"
            item.confirmed_by = current_user.id
            item.confirmed_at = now
            dismissed.append(item.id)
            continue
        if action != "confirm":
            raise HTTPException(status_code=400, detail="Action must be confirm or dismiss")
        if not item.due_at:
            raise HTTPException(status_code=400, detail=f'"{item.title}" needs a date before it can be confirmed.')
        if not (item.title or "").strip():
            raise HTTPException(status_code=400, detail="Each confirmed item needs a name.")
        item.status = "confirmed"
        item.confirmed_by = current_user.id
        item.confirmed_at = now
        _publish_task(db, item, current_user)
        confirmed.append(item.id)

    db.commit()
    return {"confirmed": confirmed, "dismissed": dismissed}


@router.get("/{course_id}/files/{file_id}/download")
def download_week_file(
    course_id: int,
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_visible_course(db, current_user, course_id)
    row = db.query(WeekFile).filter(WeekFile.id == file_id, WeekFile.course_id == course_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    path = absolute_path(row.course_id, row.module_id, row.stored_name)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="The file is no longer on the server.")
    return FileResponse(path, filename=row.original_name, media_type="application/octet-stream")


@router.delete("/{course_id}/files/{file_id}")
def delete_week_file(
    course_id: int,
    file_id: int,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    course = _get_course_or_404(db, course_id)
    _require_course_teacher(current_user, course)
    row = db.query(WeekFile).filter(WeekFile.id == file_id, WeekFile.course_id == course_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    pending = db.query(FileExtraction).filter(
        FileExtraction.file_id == row.id,
        FileExtraction.status == "pending",
    ).all()
    for item in pending:
        db.delete(item)
    delete_stored(row.course_id, row.module_id, row.stored_name)
    db.delete(row)
    db.commit()
    return {"message": "File deleted"}
