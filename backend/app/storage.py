"""Store week upload files on disk under backend/uploads/weeks/."""
from __future__ import annotations

import os
import re
import uuid
from pathlib import Path

APP_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.abspath(os.path.join(APP_DIR, ".."))
UPLOAD_ROOT = os.path.join(BACKEND_DIR, "uploads", "weeks")

MAX_FILE_BYTES = 15 * 1024 * 1024
MAX_FILES_PER_BATCH = 12


def ensure_upload_root() -> str:
    os.makedirs(UPLOAD_ROOT, exist_ok=True)
    return UPLOAD_ROOT


def safe_filename(name: str) -> str:
    base = os.path.basename(name or "file")
    base = re.sub(r"[^\w.\- ()\u4e00-\u9fff]+", "_", base).strip("._")
    if not base:
        base = "file"
    return base[:120]


def store_file(course_id: int, module_id: int, filename: str, data: bytes) -> str:
    """Write bytes and return the stored relative name (uuid + safe name)."""
    ensure_upload_root()
    folder = os.path.join(UPLOAD_ROOT, str(int(course_id)), str(int(module_id)))
    os.makedirs(folder, exist_ok=True)
    stored = f"{uuid.uuid4().hex}_{safe_filename(filename)}"
    path = os.path.join(folder, stored)
    with open(path, "wb") as handle:
        handle.write(data)
    return stored


def absolute_path(course_id: int, module_id: int, stored_name: str) -> str:
    name = os.path.basename(stored_name)
    return os.path.join(UPLOAD_ROOT, str(int(course_id)), str(int(module_id)), name)


def delete_stored(course_id: int, module_id: int, stored_name: str) -> None:
    path = absolute_path(course_id, module_id, stored_name)
    try:
        if os.path.isfile(path):
            os.remove(path)
    except OSError:
        pass


def delete_module_files(course_id: int, module_id: int) -> None:
    folder = os.path.join(UPLOAD_ROOT, str(int(course_id)), str(int(module_id)))
    if not os.path.isdir(folder):
        return
    for name in os.listdir(folder):
        path = os.path.join(folder, name)
        if os.path.isfile(path):
            try:
                os.remove(path)
            except OSError:
                pass
    try:
        os.rmdir(folder)
    except OSError:
        pass
