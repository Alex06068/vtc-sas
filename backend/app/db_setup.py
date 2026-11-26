"""Create tables, add new SQLite columns, and seed school networks from env.

Called from the FastAPI startup hook. Isolated here so the same helpers can be
wired into a customized main.py without replacing frontend-serving routes.
"""
from sqlalchemy import inspect, text

from .database import engine, Base, SessionLocal, settings
from .models import SchoolNetwork
from .school_ip import parse_cidr, normalize_cidr_input


def _sqlite_add_column(table: str, column: str, ddl: str):
    """create_all will not add columns to an existing SQLite table."""
    inspector = inspect(engine)
    if table not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns(table)}
    if column in columns:
        return
    with engine.begin() as conn:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))
    print(f"Added {table}.{column} column")



def _sqlite_allow_null_file_id():
    """Section-title dates are stored as extractions without a week file."""
    inspector = inspect(engine)
    if "file_extractions" not in inspector.get_table_names():
        return
    cols = {col["name"]: col for col in inspector.get_columns("file_extractions")}
    if "file_id" not in cols:
        return
    if cols["file_id"].get("nullable", True):
        return
    col_names = [col["name"] for col in inspector.get_columns("file_extractions")]
    select_list = ", ".join(col_names)
    create_sql = """
        CREATE TABLE file_extractions_new (
            id INTEGER NOT NULL PRIMARY KEY,
            file_id INTEGER,
            course_id INTEGER NOT NULL,
            module_id INTEGER NOT NULL,
            kind VARCHAR NOT NULL,
            title VARCHAR NOT NULL,
            due_at DATETIME,
            location VARCHAR,
            snippet TEXT,
            status VARCHAR NOT NULL,
            published_task_id INTEGER,
            confirmed_by INTEGER,
            confirmed_at DATETIME,
            created_at DATETIME,
            source VARCHAR,
            conflict_type VARCHAR,
            conflict_note TEXT,
            alternate_value VARCHAR,
            FOREIGN KEY(file_id) REFERENCES week_files (id),
            FOREIGN KEY(course_id) REFERENCES courses (id),
            FOREIGN KEY(module_id) REFERENCES modules (id),
            FOREIGN KEY(published_task_id) REFERENCES tasks (id),
            FOREIGN KEY(confirmed_by) REFERENCES users (id)
        )
    """
    with engine.begin() as conn:
        conn.execute(text(create_sql))
        # Copy whatever columns already exist; fill new ones with defaults.
        present = set(col_names)
        dest = [
            "id", "file_id", "course_id", "module_id", "kind", "title", "due_at",
            "location", "snippet", "status", "published_task_id", "confirmed_by",
            "confirmed_at", "created_at", "source", "conflict_type",
            "conflict_note", "alternate_value",
        ]
        parts = []
        for name in dest:
            if name in present:
                parts.append(name)
            elif name == "source":
                parts.append("'file' AS source")
            else:
                parts.append("NULL AS " + name)
        conn.execute(text(
            "INSERT INTO file_extractions_new (" + ", ".join(dest) + ") "
            "SELECT " + ", ".join(parts) + " FROM file_extractions"
        ))
        conn.execute(text("DROP TABLE file_extractions"))
        conn.execute(text("ALTER TABLE file_extractions_new RENAME TO file_extractions"))
    print("Updated file_extractions.file_id to allow section-title dates")


def ensure_new_columns():
    _sqlite_add_column("attendance", "client_ip", "client_ip VARCHAR")
    _sqlite_add_column("attendance", "course_id", "course_id INTEGER")
    _sqlite_add_column("tasks", "category", "category VARCHAR")
    _sqlite_add_column("courses", "start_date", "start_date DATE")
    _sqlite_add_column("courses", "end_date", "end_date DATE")
    _sqlite_add_column("modules", "week_number", "week_number INTEGER")
    _sqlite_add_column("modules", "start_date", "start_date DATE")
    _sqlite_add_column("modules", "content", "content TEXT")
    _sqlite_add_column("modules", "links", "links TEXT")
    _sqlite_add_column("tasks", "location", "location VARCHAR")
    _sqlite_add_column("courses", "organization", "organization VARCHAR DEFAULT 'weeks'")
    _sqlite_add_column("courses", "teachers_text", "teachers_text TEXT")
    _sqlite_add_column("courses", "class_info", "class_info VARCHAR")
    _sqlite_add_column("file_extractions", "source", "source VARCHAR")
    _sqlite_add_column("file_extractions", "conflict_type", "conflict_type VARCHAR")
    _sqlite_add_column("file_extractions", "conflict_note", "conflict_note TEXT")
    _sqlite_add_column("file_extractions", "alternate_value", "alternate_value VARCHAR")
    _sqlite_allow_null_file_id()


def seed_school_networks_from_env():
    raw = (getattr(settings, "school_networks", "") or "").strip()
    if not raw:
        return
    db = SessionLocal()
    try:
        added = 0
        for part in raw.split(","):
            value = part.strip()
            if not value or parse_cidr(value) is None:
                if value:
                    print(f"Skipping invalid SCHOOL_NETWORKS entry: {value!r}")
                continue
            cidr = normalize_cidr_input(value)
            existing = db.query(SchoolNetwork).filter(SchoolNetwork.cidr == cidr).first()
            if existing:
                continue
            db.add(SchoolNetwork(cidr=cidr, label="from SCHOOL_NETWORKS env", enabled=True))
            added += 1
        if added:
            db.commit()
            print(f"Seeded {added} school network(s) from SCHOOL_NETWORKS")
    finally:
        db.close()


def init_database():
    # Import models so metadata includes every table.
    from . import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    ensure_new_columns()
    seed_school_networks_from_env()
    print("Database tables created/verified")
