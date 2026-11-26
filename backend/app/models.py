from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text, UniqueConstraint, Date
from sqlalchemy.sql import func
from .database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="student")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Course(Base):
    __tablename__ = "courses"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    teacher_id = Column(Integer, ForeignKey("users.id"))
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    # "weeks" (numbered Week 01–11) or "topics" (named topic / deliverable blocks)
    organization = Column(String, default="weeks")
    # Display names only — not login accounts.
    teachers_text = Column(Text, nullable=True)
    # Class group, weekday, time, room (plain text).
    class_info = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Enrollment(Base):
    __tablename__ = "enrollments"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    course_id = Column(Integer, ForeignKey("courses.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint('user_id', 'course_id', name='uq_enrollment'),)

class Module(Base):
    """A week or topic on a course page. Reuses the existing modules table."""
    __tablename__ = "modules"
    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"))
    title = Column(String, nullable=False)
    order = Column(Integer, default=0)
    week_number = Column(Integer, nullable=True)
    start_date = Column(Date, nullable=True)
    content = Column(Text, nullable=True)  # free-text materials
    links = Column(Text, nullable=True)  # JSON list of {title, url}
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Task(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))  # creator or personal
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=True)
    title = Column(String, nullable=False)
    due_date = Column(DateTime(timezone=True))
    weighting = Column(String)
    category = Column(String, nullable=True)  # assignment / exam / project
    is_completed = Column(Boolean, default=False)
    source = Column(String)
    location = Column(String, nullable=True)  # exam venue or submission place
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Attendance(Base):
    __tablename__ = "attendance"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=True)
    date = Column(String, nullable=False)
    status = Column(String, default="present")
    # Client IP recorded on each self check-in. Added via startup ALTER on existing DBs.
    client_ip = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class SchoolNetwork(Base):
    """Allowed school computer addresses for student attendance check-in.

    cidr may be a single IPv4/IPv6 address (e.g. 10.1.3.40) or a CIDR range
    (e.g. 10.0.0.0/16). Leave this table empty to keep the IP check off while
    testing. Enforcement turns on automatically once at least one enabled row
    exists (or SCHOOL_NETWORKS is set in the environment).
    """
    __tablename__ = "school_networks"
    id = Column(Integer, primary_key=True, index=True)
    cidr = Column(String, nullable=False, unique=True)
    label = Column(String, nullable=True)
    enabled = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class CalendarEvent(Base):
    __tablename__ = "calendar_events"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    start_at = Column(DateTime(timezone=True), nullable=False)
    end_at = Column(DateTime(timezone=True), nullable=True)
    type = Column(String, default="event")  # event / exam / project / assignment / holiday
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class Holiday(Base):
    """Public holidays stored in the database (not only in frontend JS)."""
    __tablename__ = "holidays"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, unique=True)
    name = Column(String, nullable=False)
    region = Column(String, default="HK")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    session_id = Column(String, default="default", nullable=False, index=True)
    role = Column(String, nullable=False)  # user / assistant
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class WeekFile(Base):
    """A file uploaded into a course week. Stored on disk, metadata in the DB."""
    __tablename__ = "week_files"
    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    module_id = Column(Integer, ForeignKey("modules.id"), nullable=False, index=True)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    original_name = Column(String, nullable=False)
    stored_name = Column(String, nullable=False, unique=True)
    extension = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=True)
    classified_type = Column(String, default="notes")  # notes / assignment_brief / exam_schedule
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class FileExtraction(Base):
    """A date or item pulled from a week file. Hidden from students until confirmed."""
    __tablename__ = "file_extractions"
    id = Column(Integer, primary_key=True, index=True)
    file_id = Column(Integer, ForeignKey("week_files.id"), nullable=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    module_id = Column(Integer, ForeignKey("modules.id"), nullable=False, index=True)
    kind = Column(String, nullable=False, default="assignment")  # assignment / exam
    title = Column(String, nullable=False)
    due_at = Column(DateTime(timezone=True), nullable=True)
    location = Column(String, nullable=True)
    snippet = Column(Text, nullable=True)
    status = Column(String, default="pending", nullable=False, index=True)  # pending / confirmed / dismissed
    published_task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    # file / section_title / description / seed
    source = Column(String, default="file")
    # year / time, when the source text disagrees; official due_at is the preferred value
    conflict_type = Column(String, nullable=True)
    conflict_note = Column(Text, nullable=True)
    alternate_value = Column(String, nullable=True)
    confirmed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
