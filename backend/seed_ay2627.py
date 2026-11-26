"""Idempotent AY 2026/27 real-course seed.

Only the eight courses supplied by the user are added. Existing demo
IT114115 / IT114116 rows are left alone. No lecture files, classmate
rosters, or extra teacher login accounts are created. Teacher names are
stored as text on the course. student1 is enrolled so the student view
can be demonstrated.

Known dates that do not conflict are entered as confirmed tasks (visible
in Due this week and the calendar). Date conflicts are stored with the
preferred official value and left pending for the teacher to confirm.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.models import Course, FileExtraction, Module, Task

HK = timezone(timedelta(hours=8))


def hk(year, month, day, hour=23, minute=59) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=HK)


def get_or_create_course(
    db,
    teacher,
    code: str,
    name: str,
    description: str,
    *,
    organization: str = "topics",
    teachers_text: str | None = None,
    class_info: str | None = None,
) -> Course:
    course = db.query(Course).filter(Course.code == code).first()
    if course:
        changed = False
        if course.name != name:
            course.name = name
            changed = True
        if description and course.description != description:
            course.description = description
            changed = True
        if organization and (course.organization or "weeks") != organization:
            course.organization = organization
            changed = True
        if teachers_text is not None and (course.teachers_text or "") != teachers_text:
            course.teachers_text = teachers_text or None
            changed = True
        if class_info is not None and (course.class_info or "") != class_info:
            course.class_info = class_info or None
            changed = True
        if course.teacher_id is None:
            course.teacher_id = teacher.id
            changed = True
        if changed:
            db.commit()
        return course
    course = Course(
        code=code,
        name=name,
        description=description,
        teacher_id=teacher.id,
        organization=organization,
        teachers_text=teachers_text or None,
        class_info=class_info or None,
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    print(f"  created course {code}")
    return course


def ensure_module(db, course: Course, title: str, order: int, *, week_number=None, content=None) -> Module:
    existing = db.query(Module).filter(Module.course_id == course.id, Module.title == title).first()
    if existing:
        changed = False
        if week_number is not None and existing.week_number != week_number:
            existing.week_number = week_number
            changed = True
        if content and not (existing.content or "").strip():
            existing.content = content
            changed = True
        if existing.order != order:
            existing.order = order
            changed = True
        if changed:
            db.commit()
        return existing
    module = Module(
        course_id=course.id,
        title=title,
        order=order,
        week_number=week_number,
        content=content,
    )
    db.add(module)
    db.commit()
    db.refresh(module)
    return module


def ensure_dated_item(
    db,
    teacher,
    course: Course,
    module: Module,
    *,
    title: str,
    due: datetime,
    kind: str = "assignment",
    location: str | None = None,
    weighting: str | None = None,
    source: str = "section_title",
    snippet: str | None = None,
    status: str = "confirmed",
    conflict_type: str | None = None,
    conflict_note: str | None = None,
    alternate_value: str | None = None,
) -> FileExtraction:
    existing = (
        db.query(FileExtraction)
        .filter(
            FileExtraction.course_id == course.id,
            FileExtraction.module_id == module.id,
            FileExtraction.title == title,
        )
        .first()
    )
    if existing:
        changed = False
        if existing.file_id is None and existing.source != source:
            existing.source = source
            changed = True
        if conflict_type and not existing.conflict_type:
            existing.conflict_type = conflict_type
            existing.conflict_note = conflict_note
            existing.alternate_value = alternate_value
            changed = True
        if existing.due_at is None:
            existing.due_at = due
            changed = True
        if location and not existing.location:
            existing.location = location
            changed = True
        if changed:
            db.commit()
        if existing.status == "confirmed" and not existing.published_task_id:
            _publish(db, teacher, course, existing, kind, weighting)
        return existing

    row = FileExtraction(
        file_id=None,
        course_id=course.id,
        module_id=module.id,
        kind=kind,
        title=title,
        due_at=due,
        location=location,
        snippet=snippet,
        status=status,
        source=source,
        conflict_type=conflict_type,
        conflict_note=conflict_note,
        alternate_value=alternate_value,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    if status == "confirmed":
        _publish(db, teacher, course, row, kind, weighting)
    return row


def _publish(db, teacher, course, extraction: FileExtraction, kind: str, weighting: str | None) -> Task:
    category = "exam" if kind == "exam" else "assignment"
    task = None
    if extraction.published_task_id:
        task = db.query(Task).filter(Task.id == extraction.published_task_id).first()
    if task is None:
        task = (
            db.query(Task)
            .filter(Task.course_id == course.id, Task.title == extraction.title)
            .first()
        )
    if task is None:
        task = Task(
            user_id=teacher.id,
            course_id=course.id,
            title=extraction.title,
            due_date=extraction.due_at,
            weighting=weighting,
            category=category,
            is_completed=False,
            source="section_extract",
            location=extraction.location,
        )
        db.add(task)
        db.commit()
        db.refresh(task)
    else:
        if not task.location and extraction.location:
            task.location = extraction.location
        if not task.category:
            task.category = category
        if weighting and not task.weighting:
            task.weighting = weighting
        if task.due_date is None:
            task.due_date = extraction.due_at
        db.commit()
    extraction.published_task_id = task.id
    extraction.status = "confirmed"
    db.commit()
    return task


def seed_ay2627(db, teacher, student, ensure_enrollment) -> None:
    print("Seeding AY2627 real courses…")

    # 1. ITP4120 — topic-based
    itp4120 = get_or_create_course(
        db, teacher,
        "ITP4120",
        "Data Centre and Private Cloud Technologies",
        "AY 2026/27. This course is organised by topic. Many due dates live in section text rather than Moodle assignment items.",
        organization="topics",
        teachers_text="LI KA KIT / Harry Li",
    )
    labs = ensure_module(
        db, itp4120, "Labs", 1,
        content=(
            "Lab batch deadlines are listed in the section text. "
            "Individual batch dates were not provided here, so none have been invented. "
            "Add the dates when you confirm them."
        ),
    )
    quiz = ensure_module(
        db, itp4120, "Quiz", 2,
        content="Quiz due 26 Nov 2026. The due date was taken from the section text.",
    )
    ea = ensure_module(
        db, itp4120, "EA Project Submission", 3,
        content=(
            "EA Project Submission due 14 Dec 2026.\n"
            "Note: the Moodle assignment due was wrongly set to 14 Dec 2025; "
            "the course text says 14 Dec 2026. The date stored here is 14 Dec 2026, "
            "flagged as a year conflict for the teacher to confirm."
        ),
    )
    ensure_dated_item(
        db, teacher, itp4120, quiz,
        title="Quiz",
        due=hk(2026, 11, 26, 23, 59),
        kind="assignment",
        source="description",
        snippet="Quiz due 26 Nov 2026",
        status="confirmed",
    )
    ensure_dated_item(
        db, teacher, itp4120, ea,
        title="EA Project Submission",
        due=hk(2026, 12, 14, 23, 59),
        kind="assignment",
        source="description",
        snippet="Course text: 14 Dec 2026. Moodle due was wrongly 14 Dec 2025.",
        status="pending",
        conflict_type="year",
        alternate_value="14 Dec 2025",
        conflict_note=(
            "Moodle due was wrongly 14 Dec 2025; the course text says 14 Dec 2026. "
            "The date stored here is 14 Dec 2026. Please confirm the year before "
            "students see this as a due item."
        ),
    )
    # labs module is a placeholder only — no invented batch dates

    # 2. ITE4116M — deliverable topics
    fyp = get_or_create_course(
        db, teacher,
        "ITE4116M",
        "Final Year Project",
        "AY 2026/27. Organised by deliverable topics. Guide, template and the dated assignment belong in the same topic block. The files themselves are not stored here — upload them when you have them.",
        organization="topics",
        teachers_text="CHEUNG WAI KIT (responsible); also CHAN KIU LAP, LEUNG KA KA, LI KA KIT, WONG CHUN YIN",
    )
    initial = ensure_module(
        db, fyp, "Initial Report", 1,
        content=(
            "This topic holds the Guide, the Template, and the dated assignment together. "
            "Do not expect the files to be present until the teacher uploads them.\n"
            "Initial Report due: 10 Dec 2026 08:30."
        ),
    )
    interim = ensure_module(
        db, fyp, "Interim Report", 2,
        content=(
            "This topic holds the Guide, the Template, and the dated assignment together. "
            "Do not expect the files to be present until the teacher uploads them.\n"
            "Interim Report due: 12 Jan 2027 08:30.\n"
            "Note: one place in the schedule HTML says 11:59pm. The time stored here is 08:30, "
            "flagged as a time conflict for the teacher to confirm."
        ),
    )
    final = ensure_module(
        db, fyp, "Final Report", 3,
        content=(
            "This topic holds the Guide, the Template, and the dated assignment together. "
            "Do not expect the files to be present until the teacher uploads them.\n"
            "Final Report due: 29 Apr 2027 08:30."
        ),
    )
    ensure_dated_item(
        db, teacher, fyp, initial,
        title="Initial Report",
        due=hk(2026, 12, 10, 8, 30),
        kind="assignment",
        source="description",
        snippet="Initial Report: 10 Dec 2026 08:30",
        status="confirmed",
    )
    ensure_dated_item(
        db, teacher, fyp, interim,
        title="Interim Report",
        due=hk(2027, 1, 12, 8, 30),
        kind="assignment",
        source="description",
        snippet="Assignment due 12 Jan 2027 08:30; schedule HTML also says 11:59pm.",
        status="pending",
        conflict_type="time",
        alternate_value="23:59",
        conflict_note=(
            "The assignment due is 12 Jan 2027 08:30; one place in the schedule HTML says 11:59pm. "
            "The time stored here is 08:30. Please confirm the time before students see this as a due item."
        ),
    )
    ensure_dated_item(
        db, teacher, fyp, final,
        title="Final Report",
        due=hk(2027, 4, 29, 8, 30),
        kind="assignment",
        source="description",
        snippet="Final Report: 29 Apr 2027 08:30",
        status="confirmed",
    )

    # 3. ITP4124 — topic-based; skip empty ACD Slides / New section / 2024 eSFQ
    devops = get_or_create_course(
        db, teacher,
        "ITP4124",
        "DevOps in Cloud",
        "AY 2026/27. Organised by topic. Almost no Moodle assignment items; known dates were taken from notes. Empty ACD Slides, empty New sections, and an expired 2024 eSFQ assignment are not current required work and were not added.",
        organization="topics",
        teachers_text="CHEUNG WAI KIT / Kitson Cheung, WONG CHUN YIN / Cyrus Wong",
    )
    ca_exam = ensure_module(
        db, devops, "CA written exam", 1,
        content="CA written exam: 4 Dec 2026 14:30, 45 minutes, room A536.",
    )
    lab_ca = ensure_module(
        db, devops, "Lab CA marks", 2,
        content="Lab CA marks due 7 Dec 2026 09:00.",
    )
    project = ensure_module(
        db, devops, "Project", 3,
        content=(
            "Project due 31 Oct 2026. This date was recorded from notes and a Google Doc. "
            "The document itself is not stored here."
        ),
    )
    ensure_dated_item(
        db, teacher, devops, ca_exam,
        title="CA written exam",
        due=hk(2026, 12, 4, 14, 30),
        kind="exam",
        location="A536",
        source="description",
        snippet="CA written exam 4 Dec 2026 14:30, 45 minutes, room A536",
        status="confirmed",
    )
    ensure_dated_item(
        db, teacher, devops, lab_ca,
        title="Lab CA marks",
        due=hk(2026, 12, 7, 9, 0),
        kind="assignment",
        source="description",
        snippet="Lab CA marks due 7 Dec 2026 09:00",
        status="confirmed",
    )
    ensure_dated_item(
        db, teacher, devops, project,
        title="Project",
        due=hk(2026, 10, 31, 23, 59),
        kind="assignment",
        source="description",
        snippet="Project due 31 Oct 2026 (from notes / a Google Doc; the doc is not stored here)",
        status="confirmed",
    )

    # 4. ITP4125 — the only credit course organised by week
    linux = get_or_create_course(
        db, teacher,
        "ITP4125",
        "Advanced Linux and Container Technologies",
        "AY 2026/27. Organised by week (Week 01–11, with 07 and 08 merged). Typical week materials are lecture notes, a lab brief, and a submission — upload the files when you have them.",
        organization="weeks",
        teachers_text="CHEUNG WAI KIT, LEUNG KA KA / Elka Leung",
    )
    week_content = (
        "Typical materials for this week: lecture notes, a lab brief, and a submission. "
        "Files are not stored here — upload them when you have them."
    )
    week_specs = [
        (1, "Week 01", 1),
        (2, "Week 02", 2),
        (3, "Week 03", 3),
        (4, "Week 04", 4),
        (5, "Week 05", 5),
        (6, "Week 06", 6),
        (7, "Week 07–08", 7),
        (8, "Week 09", 9),
        (9, "Week 10", 10),
        (10, "Week 11", 11),
    ]
    for order, title, number in week_specs:
        ensure_module(db, linux, title, order, week_number=number, content=week_content)
    ea_due = ensure_module(
        db, linux, "EA Due Date 27 Nov 2026 23:59", 11,
        content=(
            "This date appeared in a section title (it was a URL, not a Moodle assignment). "
            "Entered so it can show in Due this week and the calendar once confirmed."
        ),
    )
    k8s = ensure_module(
        db, linux, "Kubernetes CA 4 Dec 2026 23:59", 12,
        content=(
            "This date appeared in a section title (it was a URL, not a Moodle assignment). "
            "Entered so it can show in Due this week and the calendar once confirmed."
        ),
    )
    ensure_dated_item(
        db, teacher, linux, ea_due,
        title="EA Due Date",
        due=hk(2026, 11, 27, 23, 59),
        kind="assignment",
        source="section_title",
        snippet="EA Due Date 27 Nov 2026 23:59",
        status="confirmed",
    )
    ensure_dated_item(
        db, teacher, linux, k8s,
        title="Kubernetes CA",
        due=hk(2026, 12, 4, 23, 59),
        kind="assignment",
        source="section_title",
        snippet="Kubernetes CA 4 Dec 2026 23:59",
        status="confirmed",
    )

    # 5. LAN4103
    lan = get_or_create_course(
        db, teacher,
        "LAN4103",
        "Professional Workplace Communication: Proposal and Report Writing",
        "AY 2026/27. Organised by topic. This course has the most files; they are not stored here — leave upload to the teacher.",
        organization="topics",
        teachers_text="JALALI ALLEN",
        class_info="Class IT114115-2B, Friday 12:30",
    )
    ensure_module(
        db, lan, "Course materials", 1,
        content=(
            "Materials for this course include a file pack (PDF/DOCX/PPTX). "
            "The files have not been invented or uploaded here. Upload them when you have them."
        ),
    )
    eaii = ensure_module(
        db, lan, "EAII exam", 2,
        content=(
            "EAII exam: 27 Nov 2026 12:30, room LW6M73. "
            "Materials are a file pack (PDF/DOCX/PPTX), not a quiz or assignment. "
            "Upload the pack when you have the files."
        ),
    )
    ensure_dated_item(
        db, teacher, lan, eaii,
        title="EAII exam",
        due=hk(2026, 11, 27, 12, 30),
        kind="exam",
        location="LW6M73",
        source="description",
        snippet="EAII exam: 27 Nov 2026 12:30, room LW6M73",
        status="confirmed",
    )

    # 6–7. Two shared LD0001 language courses, distinguishable codes
    yue = get_or_create_course(
        db, teacher,
        "LD0001-YUE",
        "「悅」語同行",
        "AY 2026/27. Shared language self-study / reward course. The official code is LD0001; LD0001-YUE is used here so it stays distinct from Keep On Learning! / 自在學.",
        organization="topics",
        teachers_text="",
    )
    ensure_module(
        db, yue, "About this course", 1,
        content="A shared language self-study / reward course. Facilitators are not listed on the course card.",
    )
    kol = get_or_create_course(
        db, teacher,
        "LD0001-KOL",
        "Keep On Learning! / 自在學",
        "AY 2026/27. Shared language self-study / reward course. The official code is LD0001; LD0001-KOL is used here so it stays distinct from 「悅」語同行.",
        organization="topics",
        teachers_text="",
    )
    ensure_module(
        db, kol, "About this course", 1,
        content="A shared language self-study / reward course. Facilitators are not listed on the course card.",
    )

    # 8. SDD4007
    sdd = get_or_create_course(
        db, teacher,
        "SDD4007",
        "Enhancing Competencies in the 21st Century Workplace",
        "AY 2026/27. Organised by topic. Workshops are mainly PowerPoint decks — upload them when you have the files.",
        organization="topics",
        teachers_text="SUEN CHING / Ray Suen",
        class_info="Class 3.4 IT114115 2B, Wednesday 15:30, room LW217",
    )
    ensure_module(
        db, sdd, "Workshops", 1,
        content="Workshops are mainly PowerPoint (PPTX) decks. The files have not been invented or uploaded here. Upload them when you have them.",
    )
    ca3 = ensure_module(
        db, sdd, "CA3 (4%)", 2,
        content="CA3 (4%) due 31 Dec 2026 23:59.",
    )
    ensure_module(
        db, sdd, "Mock interview", 3,
        content="Mock interview assignment. No due date was provided, so none has been entered.",
    )
    ensure_dated_item(
        db, teacher, sdd, ca3,
        title="CA3 (4%)",
        due=hk(2026, 12, 31, 23, 59),
        kind="assignment",
        weighting="4%",
        source="description",
        snippet="CA3 (4%) due 31 Dec 2026 23:59",
        status="confirmed",
    )

    for course in (itp4120, fyp, devops, linux, lan, yue, kol, sdd):
        ensure_enrollment(db, teacher, course)
        ensure_enrollment(db, student, course)

    print("  AY2627 courses ready (8 real courses; demo IT114115/IT114116 left as-is)")
