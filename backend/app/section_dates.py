"""Create or refresh date rows extracted from a week/topic title and description."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from dateutil import parser as date_parser
from sqlalchemy.orm import Session

from .extract import HK, extract_from_section
from .models import FileExtraction


def _parse_due(value) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=HK)
    if not value:
        return None
    try:
        parsed = date_parser.isoparse(str(value))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=HK)
    return parsed


def upsert_section_extractions(
    db: Session,
    course_id: int,
    module_id: int,
    title: str,
    content: str = "",
) -> List[FileExtraction]:
    """Extract dates from section title + description and store pending rows.

    Existing rows for the same title on this module are left alone if a
    teacher has already confirmed or dismissed them. New or still-pending
    rows pick up conflict flags when the text disagrees with itself.
    """
    result = extract_from_section(title or "", content or "")
    saved: List[FileExtraction] = []
    for item in result["items"]:
        due = _parse_due(item.get("due_at"))
        if not due:
            continue
        name = (item.get("title") or title or "Dated item").strip()
        existing = (
            db.query(FileExtraction)
            .filter(
                FileExtraction.course_id == course_id,
                FileExtraction.module_id == module_id,
                FileExtraction.file_id.is_(None),
                FileExtraction.title == name,
            )
            .first()
        )
        if existing is None and due is not None:
            # Treat the same calendar moment as the same item even if the title drifted.
            candidates = (
                db.query(FileExtraction)
                .filter(
                    FileExtraction.course_id == course_id,
                    FileExtraction.module_id == module_id,
                    FileExtraction.file_id.is_(None),
                )
                .all()
            )
            for row in candidates:
                if row.due_at and row.due_at.replace(microsecond=0) == due.replace(microsecond=0):
                    existing = row
                    break
        if existing:
            if existing.status in {"confirmed", "dismissed"}:
                saved.append(existing)
                continue
            existing.kind = item.get("kind") or existing.kind
            existing.due_at = due
            existing.location = item.get("location") or existing.location
            existing.snippet = item.get("snippet") or existing.snippet
            existing.source = item.get("source") or existing.source or "section_title"
            if item.get("conflict_type"):
                existing.conflict_type = item.get("conflict_type")
                existing.conflict_note = item.get("conflict_note")
                existing.alternate_value = item.get("alternate_value")
            saved.append(existing)
            continue
        row = FileExtraction(
            file_id=None,
            course_id=course_id,
            module_id=module_id,
            kind=item.get("kind") or "assignment",
            title=name,
            due_at=due,
            location=item.get("location") or None,
            snippet=item.get("snippet"),
            status="pending",
            source=item.get("source") or "section_title",
            conflict_type=item.get("conflict_type"),
            conflict_note=item.get("conflict_note"),
            alternate_value=item.get("alternate_value"),
        )
        db.add(row)
        saved.append(row)
    return saved
