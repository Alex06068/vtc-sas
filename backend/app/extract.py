"""Read Office/PDF week files and pull out assignment and exam dates.

Heuristic only: filename and text keywords, plus nearby dates, times and venues.
Teachers always confirm before anything is shown to students as a due item.
"""
from __future__ import annotations

import re
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from typing import List, Optional

from dateutil import parser as date_parser

HK = timezone(timedelta(hours=8))

ALLOWED_EXTENSIONS = {".docx", ".xlsx", ".pptx", ".pdf"}
LEGACY_EXTENSIONS = {".doc", ".xls", ".ppt"}

CLASS_NOTES = "notes"
CLASS_ASSIGNMENT = "assignment_brief"
CLASS_EXAM = "exam_schedule"
CLASS_LABELS = {
    CLASS_NOTES: "Notes",
    CLASS_ASSIGNMENT: "Assignment brief",
    CLASS_EXAM: "Exam schedule",
}

_MONTHS = (
    "january february march april may june july august september october november december "
    "jan feb mar apr jun jul aug sep sept oct nov dec"
)
_DATE_TOKEN = re.compile(
    r"(?:"
    r"\d{4}-\d{1,2}-\d{1,2}"
    r"|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}"
    r"|\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日"
    r"|\d{1,2}\s+(?:" + _MONTHS.replace(" ", "|") + r")\.?\s+\d{4}"
    r"|(?:" + _MONTHS.replace(" ", "|") + r")\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}"
    r")",
    re.I,
)
_TIME_TOKEN = re.compile(
    r"\b(?:[01]?\d|2[0-3])[:.h][0-5]\d(?:\s*(?:a\.?m\.?|p\.?m\.?))?"
    r"|\b(?:[1-9]|1[0-2])\s*(?:a\.?m\.?|p\.?m\.?)\b",
    re.I,
)
_TIME_RANGE = re.compile(
    r"(" + _TIME_TOKEN.pattern + r")\s*(?:-|–|to|至)\s*(" + _TIME_TOKEN.pattern + r")",
    re.I,
)
_VENUE = re.compile(
    r"(?:venue|location|place|room|hall|教室|地點|场[地館]|場地)\s*[:：#]?\s*"
    r"([A-Za-z0-9][A-Za-z0-9\-/. ]{0,40})",
    re.I,
)
_TITLE_LINE = re.compile(
    r"^(?:assignment|lab(?:\s+report)?|coursework|homework|project|exam|examination|mid[ -]?term|final|quiz|test"
    r"|作業|功课|實驗|考試|測驗|期考)\s*[:：#\-–]+\s*(.+)$",
    re.I,
)
_TITLE_STANDALONE = re.compile(
    r"^(?:assignment|lab(?:\s+report)?|coursework|homework|project|exam|examination|mid[ -]?term|final"
    r"|作業|功课|實驗|考試|測驗|期考)\b(.*)$",
    re.I,
)
_DUE_WORD = re.compile(r"(due(?:\s+date)?|deadline|submit(?:ted)?(?:\s+by)?|hand\s*in|截止|到期|遞交|交卷)", re.I)
_EXAM_WORD = re.compile(r"(exam|examination|mid[-\s]?term|final|測驗|考試|期考|考試時間)", re.I)
_ASSIGN_WORD = re.compile(
    r"(assignment|brief|coursework|homework|lab\s+report|submit|deadline|作業|功课|實驗報告)",
    re.I,
)
_NOTES_WORD = re.compile(r"(lecture|notes|slides|handout|reading|筆記|講義|課堂)", re.I)

_ASSIGN_SCORE = (
    "assignment", "brief", "coursework", "homework", "lab report", "deadline",
    "due date", "submit", "作業", "功课", "實驗",
)
_EXAM_SCORE = (
    "exam", "examination", "midterm", "mid-term", "final exam", "timetable",
    "schedule", "測驗", "考試", "期考", "考場",
)
_NOTES_SCORE = (
    "lecture", "notes", "slides", "handout", "reading", "筆記", "講義", "課堂",
)


def extension(name: str) -> str:
    return Path(name or "").suffix.lower()


def is_allowed_filename(name: str) -> bool:
    return extension(name) in ALLOWED_EXTENSIONS


def legacy_format_message(name: str) -> Optional[str]:
    ext = extension(name)
    if ext in LEGACY_EXTENSIONS:
        modern = {".doc": ".docx", ".xls": ".xlsx", ".ppt": ".pptx"}[ext]
        return f"{name} is an older Office format. Please save it as {modern} and upload again."
    return None


def extract_text(path: str, filename: str | None = None) -> str:
    ext = extension(filename or path)
    try:
        if ext == ".docx":
            return _text_docx(path)
        if ext == ".xlsx":
            return _text_xlsx(path)
        if ext == ".pptx":
            return _text_pptx(path)
        if ext == ".pdf":
            return _text_pdf(path)
    except Exception as exc:
        return f"[Could not read file: {exc}]"
    return ""


def _text_docx(path: str) -> str:
    from docx import Document

    doc = Document(path)
    parts: List[str] = []
    for para in doc.paragraphs:
        if para.text and para.text.strip():
            parts.append(para.text.strip())
    for table in doc.tables:
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells if cell.text and cell.text.strip()]
            if cells:
                parts.append(" | ".join(cells))
    return "\n".join(parts)


def _text_xlsx(path: str) -> str:
    from openpyxl import load_workbook

    wb = load_workbook(path, data_only=True, read_only=True)
    parts: List[str] = []
    try:
        for sheet in wb.worksheets:
            parts.append(sheet.title)
            for row in sheet.iter_rows(values_only=True):
                cells = []
                for value in row:
                    if value is None or value == "":
                        continue
                    if isinstance(value, datetime):
                        cells.append(value.strftime("%Y-%m-%d %H:%M") if value.hour or value.minute else value.strftime("%Y-%m-%d"))
                    else:
                        cells.append(str(value).strip())
                if cells:
                    parts.append(" | ".join(cells))
    finally:
        wb.close()
    return "\n".join(parts)


def _text_pptx(path: str) -> str:
    from pptx import Presentation

    pres = Presentation(path)
    parts: List[str] = []
    for slide in pres.slides:
        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text and shape.text.strip():
                parts.append(shape.text.strip())
            if shape.has_table:
                table = shape.table
                for row in table.rows:
                    cells = [cell.text.strip() for cell in row.cells if cell.text and cell.text.strip()]
                    if cells:
                        parts.append(" | ".join(cells))
    return "\n".join(parts)


def _text_pdf(path: str) -> str:
    from pypdf import PdfReader

    reader = PdfReader(path)
    parts: List[str] = []
    for page in reader.pages:
        text = page.extract_text() or ""
        if text.strip():
            parts.append(text.strip())
    return "\n".join(parts)


def classify(filename: str, text: str) -> str:
    blob = f"{filename}\n{text[:4000]}".lower()
    exam = sum(1 for word in _EXAM_SCORE if word in blob)
    assign = sum(1 for word in _ASSIGN_SCORE if word in blob)
    notes = sum(1 for word in _NOTES_SCORE if word in blob)
    if exam > assign and exam >= notes and exam > 0:
        return CLASS_EXAM
    if assign > exam and assign >= notes and assign > 0:
        return CLASS_ASSIGNMENT
    if notes > 0 and notes >= exam and notes >= assign:
        return CLASS_NOTES
    if exam > 0:
        return CLASS_EXAM
    if assign > 0:
        return CLASS_ASSIGNMENT
    return CLASS_NOTES


def _parse_date(token: str) -> Optional[datetime]:
    raw = re.sub(r"年|月", "-", token)
    raw = raw.replace("日", " ").replace(".", "-")
    raw = re.sub(r"\s+", " ", raw).strip()
    if re.fullmatch(r"\d{4}", raw):
        return None
    try:
        # Hong Kong and VTC materials usually write day first (10/12/2026 = 10 Dec).
        parsed = date_parser.parse(raw, dayfirst=True, yearfirst=False, fuzzy=False)
    except (ValueError, OverflowError, TypeError):
        try:
            parsed = date_parser.parse(raw, dayfirst=True, fuzzy=True)
        except (ValueError, OverflowError, TypeError):
            return None
    if parsed.year < 2000 or parsed.year > 2100:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=HK)
    return parsed


def _parse_time(token: str) -> Optional[time]:
    raw = token.strip().lower().replace("h", ":").replace(".", ":")
    raw = raw.replace(" ", "")
    meridiem = None
    if "pm" in raw or "p.m" in raw:
        meridiem = "pm"
    elif "am" in raw or "a.m" in raw:
        meridiem = "am"
    raw = re.sub(r"[ap]\.?m\.?", "", raw)
    parts = raw.split(":")
    try:
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 and parts[1] != "" else 0
    except (ValueError, IndexError):
        return None
    if meridiem == "pm" and hour < 12:
        hour += 12
    if meridiem == "am" and hour == 12:
        hour = 0
    if hour > 23 or minute > 59:
        return None
    return time(hour, minute)


def _combine(date_dt: datetime, clock: Optional[time], default: time) -> datetime:
    use = clock or default
    return datetime(
        date_dt.year, date_dt.month, date_dt.day,
        use.hour, use.minute, tzinfo=HK,
    )


def _clean_title(value: str, fallback: str) -> str:
    text = re.sub(r"\s+", " ", (value or "").strip())
    text = re.sub(r"[\-–:：|]+$", "", text).strip()
    if len(text) < 2:
        return fallback
    return text[:120]


def _filename_title(filename: str) -> str:
    stem = Path(filename or "Item").stem
    stem = re.sub(r"[_\-]+", " ", stem).strip()
    return stem or "Item"


def _window(lines: List[str], index: int, radius: int = 1) -> str:
    start = max(0, index - radius)
    end = min(len(lines), index + radius + 1)
    return " ".join(lines[start:end])


def _row_cells(line: str):
    if " | " not in line:
        return None
    cells = [part.strip() for part in line.split("|") if part.strip()]
    return cells or None


def _looks_like_header(cells) -> bool:
    blob = " ".join(cells).lower()
    return "date" in blob and any(word in blob for word in ("exam", "venue", "time", "assignment", "due"))


def _venue_from_cells(cells) -> str:
    for cell in cells:
        if re.search(r"\b(room|hall|lt[\- ]?\d+)\b", cell, re.I):
            return cell.strip()
        match = _VENUE.search(cell)
        if match:
            return re.sub(r"\s+", " ", match.group(1)).strip(" -–,;.")
    return ""


def _title_near(lines: List[str], index: int, fallback: str) -> str:
    candidates = []
    for j in range(max(0, index - 3), min(len(lines), index + 1)):
        line = lines[j]
        if _DATE_TOKEN.search(line) and _DUE_WORD.search(line) and not _TITLE_LINE.match(line):
            continue
        match = _TITLE_LINE.match(line) or (
            _TITLE_STANDALONE.match(line) if not _DATE_TOKEN.search(line) else None
        )
        if not match:
            continue
        raw = (match.group(1) or "").strip(" -–:：")
        if not raw or raw.lower() in {"exam", "test", "lab", "assignment", "project", "quiz"}:
            raw = line
        raw = _DUE_WORD.split(raw, maxsplit=1)[0]
        raw = _DATE_TOKEN.split(raw, maxsplit=1)[0]
        title = _clean_title(raw, "")
        if title and title.lower() not in {"examination timetable", "timetable", "schedule"}:
            candidates.append(title)
    return candidates[-1] if candidates else fallback


def extract_items(filename: str, text: str, classified: Optional[str] = None) -> List[dict]:
    """Return pending extraction dicts (no database ids)."""
    classified = classified or classify(filename, text)
    fallback = _filename_title(filename)
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    if not lines and text:
        lines = [text.strip()]
    items: List[dict] = []
    seen = set()

    def add_item(kind: str, title: str, when: datetime, location: str, snippet: str) -> None:
        key = (kind, title.lower(), when.isoformat(), location.lower())
        if key in seen:
            return
        seen.add(key)
        items.append({
            "kind": kind,
            "title": title,
            "due_at": when.isoformat(),
            "location": location or "",
            "snippet": (snippet or "")[:240],
            "classified_type": classified,
        })

    for index, line in enumerate(lines):
        dates = list(_DATE_TOKEN.finditer(line))
        if not dates:
            continue
        context = _window(lines, index, 2)
        cells = _row_cells(line)
        if cells and _looks_like_header(cells):
            continue
        venue_match = _VENUE.search(line) or (None if cells else _VENUE.search(context))
        location = _venue_from_cells(cells) if cells else (venue_match.group(1).strip() if venue_match else "")
        location = re.sub(r"\s+", " ", location).strip(" -–,;.")
        if cells:
            text_cells = [cell for cell in cells if not _DATE_TOKEN.search(cell) and not _TIME_TOKEN.fullmatch(cell)]
            if location:
                text_cells = [cell for cell in text_cells if cell.lower() not in location.lower() and location.lower() not in cell.lower()]
            title = _clean_title(text_cells[0] if text_cells else "", fallback)
        else:
            title = _title_near(lines, index, fallback)
        is_exam = bool(_EXAM_WORD.search(context)) or classified == CLASS_EXAM
        is_due = bool(_DUE_WORD.search(context)) or classified == CLASS_ASSIGNMENT
        if is_exam and not is_due:
            kind = "exam"
            default_time = time(9, 0)
        else:
            kind = "assignment" if (is_due or classified != CLASS_EXAM) else "exam"
            default_time = time(23, 59) if kind == "assignment" else time(9, 0)

        for match in dates:
            when = _parse_date(match.group(0))
            if not when:
                continue
            after = line[match.end():match.end() + 80]
            around = context
            clock = None
            end_clock = None
            range_match = _TIME_RANGE.search(after) or _TIME_RANGE.search(around)
            if range_match:
                clock = _parse_time(range_match.group(1))
                end_clock = _parse_time(range_match.group(2))
            else:
                time_match = _TIME_TOKEN.search(after) or _TIME_TOKEN.search(around)
                if time_match:
                    clock = _parse_time(time_match.group(0))
            due = _combine(when, clock, default_time)
            item_title = title
            if kind == "exam" and item_title.lower() == fallback.lower():
                item_title = _clean_title(f"{fallback}", fallback)
            add_item(kind, item_title, due, location, context)
            if end_clock and kind == "exam":
                # Keep a single item; end time is informational only for this slice.
                items[-1]["snippet"] = context[:240]

    # If the file looks like an assignment/exam but the date was only in the filename.
    if not items:
        for match in _DATE_TOKEN.finditer(filename):
            when = _parse_date(match.group(0))
            if not when:
                continue
            kind = "exam" if classified == CLASS_EXAM else "assignment"
            default_time = time(9, 0) if kind == "exam" else time(23, 59)
            add_item(kind, fallback, _combine(when, None, default_time), "", filename)

    annotate_conflicts(text or "", items)
    return items


def analyse_file(path: str, filename: str) -> dict:
    text = extract_text(path, filename)
    classified = classify(filename, text)
    return {
        "filename": filename,
        "classified_type": classified,
        "classified_label": CLASS_LABELS.get(classified, classified),
        "text_preview": (text or "")[:400],
        "items": extract_items(filename, text, classified),
        "readable": bool(text) and not text.startswith("[Could not read file:"),
    }


def _item_due(item: dict) -> Optional[datetime]:
    raw = item.get("due_at")
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=HK)
    if not raw:
        return None
    try:
        parsed = date_parser.isoparse(str(raw))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=HK)
    return parsed


def _preferred_time(clocks: List[time]) -> time:
    unique = sorted({c.replace(second=0, microsecond=0) for c in clocks if c})
    if not unique:
        return time(23, 59)
    non_eod = [c for c in unique if not (c.hour == 23 and c.minute >= 59)]
    if len(non_eod) == 1:
        return non_eod[0]
    if non_eod:
        return non_eod[0]
    return unique[0]


def _format_clock(value: time) -> str:
    return f"{value.hour:02d}:{value.minute:02d}"


def annotate_conflicts(text: str, items: List[dict]) -> List[dict]:
    """Flag year or time disagreements in the source text and keep the preferred value.

    Year: same month and day with two years — keep the later year (e.g. 2026 not 2025).
    Time: same calendar date with two times — prefer a specific time over 23:59.
    The official due_at on the item is the preferred value, never the discarded one.
    """
    years_by_md = {}
    times_by_ymd = {}

    def add_year(month, day, year):
        years_by_md.setdefault((month, day), set()).add(year)

    def add_time(year, month, day, clock):
        if clock is None:
            return
        times_by_ymd.setdefault((year, month, day), set()).add(clock.replace(second=0, microsecond=0))

    for match in _DATE_TOKEN.finditer(text or ""):
        when = _parse_date(match.group(0))
        if not when:
            continue
        add_year(when.month, when.day, when.year)
        window = (text or "")[max(0, match.start() - 40): match.end() + 90]
        clock = None
        time_match = _TIME_TOKEN.search(window)
        if time_match:
            clock = _parse_time(time_match.group(0))
        add_time(when.year, when.month, when.day, clock)

    for item in items:
        due = _item_due(item)
        if not due:
            continue
        add_year(due.month, due.day, due.year)
        add_time(due.year, due.month, due.day, due.timetz().replace(tzinfo=None) if False else due.time().replace(second=0, microsecond=0))

    for item in items:
        due = _item_due(item)
        if not due:
            continue
        years = years_by_md.get((due.month, due.day), set())
        preferred_year = max(years) if years else due.year
        if len(years) > 1 and due.year != preferred_year:
            dropped = due.year
            due = due.replace(year=preferred_year)
            item["due_at"] = due.isoformat()
            item["conflict_type"] = "year"
            item["alternate_value"] = f"{due.day} {due.strftime('%b')} {dropped}"
            item["conflict_note"] = (
                f"The source text also has {due.day} {due.strftime('%b')} {dropped}. "
                f"The date stored here is {due.day} {due.strftime('%b')} {preferred_year}. "
                "Please confirm the year before this is shown to students as a due item."
            )
        # Re-read after a possible year fix so times are grouped on the preferred date.
        times = set(times_by_ymd.get((due.year, due.month, due.day), set()))
        # Times recorded against the discarded year should still count.
        for year in years:
            times.update(times_by_ymd.get((year, due.month, due.day), set()))
        if len(times) > 1:
            preferred = _preferred_time(list(times))
            others = sorted(t for t in times if t != preferred)
            due = due.replace(hour=preferred.hour, minute=preferred.minute, second=0, microsecond=0)
            item["due_at"] = due.isoformat()
            # Year conflict takes naming priority if both appear; still mention the time.
            if item.get("conflict_type") == "year":
                item["conflict_note"] = (
                    item.get("conflict_note") or ""
                ) + f" The source also lists more than one time; { _format_clock(preferred) } was kept."
            else:
                item["conflict_type"] = "time"
                item["alternate_value"] = ", ".join(_format_clock(t) for t in others)
                item["conflict_note"] = (
                    f"The source text also lists {item['alternate_value']} on the same date. "
                    f"The time stored here is {_format_clock(preferred)}. "
                    "Please confirm the time before this is shown to students as a due item."
                )

    # Collapse items that became the same official date after a conflict fix.
    merged: List[dict] = []
    seen = set()
    for item in items:
        due = _item_due(item)
        key = (
            (item.get("kind") or ""),
            (item.get("title") or "").strip().lower(),
            due.isoformat() if due else "",
            (item.get("location") or "").strip().lower(),
        )
        if key in seen:
            continue
        seen.add(key)
        merged.append(item)
    items[:] = merged
    return items


def extract_from_section(title: str, content: str = "") -> dict:
    """Pull dates from a section title and description text (no uploaded file)."""
    combined = "\n".join(part.strip() for part in (title or "", content or "") if part and part.strip())
    classified = classify("section.txt", combined)
    items = extract_items(title or "section", combined, classified)
    for item in items:
        item["source"] = "section_title" if title and title.strip() in combined else "description"
        if title and title.strip() and title.strip() in (item.get("snippet") or combined):
            # Prefer section_title when the date is in the heading, else description.
            if _DATE_TOKEN.search(title or ""):
                item["source"] = "section_title"
            elif _DATE_TOKEN.search(content or ""):
                item["source"] = "description"
            else:
                item["source"] = "section_title"
    return {
        "classified_type": classified,
        "classified_label": CLASS_LABELS.get(classified, classified),
        "items": items,
        "text_preview": combined[:400],
    }
