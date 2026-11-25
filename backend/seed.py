"""Idempotent demo seed for VTC-SAS.

Run from the backend/ directory (same cwd as uvicorn, so vtcsas.db is found):

    python seed.py

Demo accounts (passwords are obvious and for local demo only):
    teacher1 / teacher1
    student1 / student1

The script is safe to run more than once: it creates missing rows and leaves
existing demo data in place.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import sys

from passlib.context import CryptContext
from sqlalchemy import inspect

# Allow `python seed.py` from backend/
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.database import SessionLocal, engine, Base  # noqa: E402
from app.db_setup import init_database  # noqa: E402
from app.models import (  # noqa: E402
    User,
    Course,
    Enrollment,
    Module,
    Task,
    Attendance,
    SchoolNetwork,
    CalendarEvent,
    Holiday,
    ChatMessage,
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

HK_HOLIDAYS_2026 = [
    (date(2026, 1, 1), "New Year's Day"),
    (date(2026, 2, 17), "Lunar New Year's Day"),
    (date(2026, 2, 18), "The second day of Lunar New Year"),
    (date(2026, 2, 19), "The third day of Lunar New Year"),
    (date(2026, 4, 3), "Good Friday"),
    (date(2026, 4, 4), "The day following Good Friday"),
    (date(2026, 4, 6), "The day following Ching Ming Festival"),
    (date(2026, 4, 7), "The day following Easter Monday"),
    (date(2026, 5, 1), "Labour Day"),
    (date(2026, 5, 25), "The day following the Birthday of the Buddha"),
    (date(2026, 6, 19), "Tuen Ng Festival"),
    (date(2026, 7, 1), "Hong Kong SAR Establishment Day"),
    (date(2026, 9, 26), "The day following the Chinese Mid-Autumn Festival"),
    (date(2026, 10, 1), "National Day"),
    (date(2026, 10, 19), "The day following Chung Yeung Festival"),
    (date(2026, 12, 25), "Christmas Day"),
    (date(2026, 12, 26), "The first weekday after Christmas Day"),
]

SCHOOL_CIDR = "172.30.82.0/23"
SCHOOL_LABEL = "school LAN"


def _hash(password: str) -> str:
    return pwd_context.hash(password[:72])


def get_or_create_user(db, username: str, email: str, password: str, role: str) -> User:
    user = db.query(User).filter(User.username == username).first()
    if user:
        return user
    user = User(
        username=username,
        email=email,
        hashed_password=_hash(password),
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    print(f"  created user {username} ({role})")
    return user


def get_or_create_course(db, code: str, name: str, description: str, teacher: User) -> Course:
    course = db.query(Course).filter(Course.code == code).first()
    if course:
        return course
    course = Course(code=code, name=name, description=description, teacher_id=teacher.id)
    db.add(course)
    db.commit()
    db.refresh(course)
    print(f"  created course {code}")
    return course


def ensure_enrollment(db, user: User, course: Course) -> None:
    existing = db.query(Enrollment).filter(
        Enrollment.user_id == user.id, Enrollment.course_id == course.id
    ).first()
    if existing:
        return
    db.add(Enrollment(user_id=user.id, course_id=course.id))
    db.commit()


def ensure_module(db, course: Course, title: str, order: int) -> None:
    existing = db.query(Module).filter(Module.course_id == course.id, Module.title == title).first()
    if existing:
        return
    db.add(Module(course_id=course.id, title=title, order=order))
    db.commit()


def ensure_task(db, teacher: User, course: Course, title: str, due: datetime, weighting: str, category: str) -> Task:
    existing = db.query(Task).filter(Task.course_id == course.id, Task.title == title).first()
    if existing:
        if not existing.category:
            existing.category = category
            db.commit()
        return existing
    task = Task(
        user_id=teacher.id,
        course_id=course.id,
        title=title,
        due_date=due,
        weighting=weighting,
        category=category,
        is_completed=False,
        source="seed",
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def ensure_attendance(db, user: User, course: Course, day: str, status: str) -> None:
    existing = db.query(Attendance).filter(
        Attendance.user_id == user.id,
        Attendance.course_id == course.id,
        Attendance.date == day,
    ).first()
    if existing:
        return
    db.add(Attendance(
        user_id=user.id,
        course_id=course.id,
        date=day,
        status=status,
        client_ip="172.30.82.10",
    ))
    db.commit()


def ensure_event(db, title: str, start_at: datetime, type_: str, course: Course | None, teacher: User) -> None:
    existing = db.query(CalendarEvent).filter(
        CalendarEvent.title == title,
        CalendarEvent.start_at == start_at,
    ).first()
    if existing:
        return
    db.add(CalendarEvent(
        title=title,
        start_at=start_at,
        end_at=None,
        type=type_,
        course_id=course.id if course else None,
        created_by=teacher.id,
    ))
    db.commit()


def ensure_holidays(db) -> int:
    added = 0
    for day, name in HK_HOLIDAYS_2026:
        existing = db.query(Holiday).filter(Holiday.date == day).first()
        if existing:
            continue
        db.add(Holiday(date=day, name=name, region="HK"))
        added += 1
    if added:
        db.commit()
    return added


def ensure_school_network(db) -> None:
    existing = db.query(SchoolNetwork).filter(SchoolNetwork.cidr == SCHOOL_CIDR).first()
    if existing:
        return
    db.add(SchoolNetwork(cidr=SCHOOL_CIDR, label=SCHOOL_LABEL, enabled=True))
    db.commit()
    print(f"  created school network {SCHOOL_CIDR} ({SCHOOL_LABEL})")


def ensure_chat_history(db, student: User) -> None:
    existing = db.query(ChatMessage).filter(
        ChatMessage.user_id == student.id, ChatMessage.session_id == "default"
    ).first()
    if existing:
        return
    turns = [
        ("user", "Hi, can you remind me what this system is for?"),
        ("assistant", "Of course. VTC-SAS is your student academic system — courses, assignments, attendance, and a calendar. You can also just chat with me if you have a question."),
        ("user", "When is the Cloud Computing assignment due?"),
        ("assistant", "The Cloud Computing lab report is in your assignments list. Open the Assignments or Calendar page to see the due date and weighting."),
    ]
    for role, content in turns:
        db.add(ChatMessage(user_id=student.id, session_id="default", role=role, content=content))
    db.commit()
    print("  created short chat history for student1")


def seed() -> None:
    init_database()
    db = SessionLocal()
    try:
        print("Seeding demo data…")
        teacher = get_or_create_user(db, "teacher1", "teacher1@example.com", "teacher1", "teacher")
        student = get_or_create_user(db, "student1", "student1@example.com", "student1", "student")

        cloud = get_or_create_course(
            db, "IT114115", "Cloud Computing",
            "Introductory cloud computing course for the demo.", teacher,
        )
        web = get_or_create_course(
            db, "IT114116", "Web Applications",
            "Building web applications with a shared backend.", teacher,
        )
        for course in (cloud, web):
            ensure_enrollment(db, teacher, course)
            ensure_enrollment(db, student, course)

        ensure_module(db, cloud, "Week 1 — Cloud concepts", 1)
        ensure_module(db, cloud, "Week 2 — Virtual machines", 2)
        ensure_module(db, web, "Week 1 — HTTP and REST", 1)
        ensure_module(db, web, "Week 2 — Frontend and APIs", 2)

        today = datetime.now(timezone.utc).replace(hour=12, minute=0, second=0, microsecond=0)
        ensure_task(db, teacher, cloud, "Lab report 1", today + timedelta(days=7), "20%", "assignment")
        ensure_task(db, teacher, cloud, "Midterm exam", today + timedelta(days=21), "30%", "exam")
        ensure_task(db, teacher, web, "Project proposal", today + timedelta(days=14), "25%", "project")
        ensure_task(db, teacher, web, "Weekly exercise 3", today + timedelta(days=3), "10%", "assignment")

        ensure_attendance(db, student, cloud, (date.today() - timedelta(days=7)).isoformat(), "present")
        ensure_attendance(db, student, cloud, (date.today() - timedelta(days=6)).isoformat(), "late")
        ensure_attendance(db, student, web, (date.today() - timedelta(days=5)).isoformat(), "present")
        ensure_attendance(db, student, web, (date.today() - timedelta(days=2)).isoformat(), "absent")

        ensure_event(db, "IT briefing", today + timedelta(days=4), "event", cloud, teacher)
        ensure_event(db, "Project workshop", today + timedelta(days=10), "project", web, teacher)

        added = ensure_holidays(db)
        if added:
            print(f"  added {added} Hong Kong public holidays for 2026")
        ensure_school_network(db)
        ensure_chat_history(db, student)

        tables = inspect(engine).get_table_names()
        print("Tables now in the database:", ", ".join(sorted(tables)))
        print("Done. Demo logins: teacher1 / teacher1  and  student1 / student1")
        print("Note: school_networks has 172.30.82.0/23 enabled, so student self check-in")
        print("from a non-school IP will return HTTP 403. Teachers are not gated.")
        print("To test check-in off the school LAN, disable that row as a teacher")
        print("(PATCH /api/attendance/school-networks/{id} with {\"enabled\": false}).")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
