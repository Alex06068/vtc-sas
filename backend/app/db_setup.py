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


def ensure_new_columns():
    _sqlite_add_column("attendance", "client_ip", "client_ip VARCHAR")
    _sqlite_add_column("attendance", "course_id", "course_id INTEGER")
    _sqlite_add_column("tasks", "category", "category VARCHAR")


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
