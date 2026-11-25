from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from openai import OpenAI
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional, List
from ..database import get_db, settings
from ..models import Task, User, Course, Enrollment, ChatMessage
from .auth import get_current_user
from .attendance import record_checkin
from ..school_ip import require_school_ip_for_student
import json

router = APIRouter()

HISTORY_LIMIT = 20
DEFAULT_SESSION = "default"

SYSTEM_PROMPT = (
    "You are a friendly academic assistant for VTC-SAS, a student academic system. "
    "Have a normal conversation: answer questions, explain course or assignment topics, "
    "and chat casually when the student just wants to talk. "
    "You also have optional tools to create or join courses, save or list assignments, "
    "and check in attendance. Use a tool only when the user clearly wants that action. "
    "Do not call tools for ordinary questions or small talk. "
    "Teachers can create courses; students can join courses, view assignments, and check in."
)

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None

class ChatResponse(BaseModel):
    reply: str
    session_id: str

tools = [
    {
        "type": "function",
        "function": {
            "name": "save_assignment",
            "description": "Save a new assignment. If course_code is given, it becomes a course assignment.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "due_date": {"type": "string"},
                    "weighting": {"type": "string"},
                    "course_code": {"type": "string"},
                    "category": {"type": "string"},
                },
                "required": ["title"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_assignments",
            "description": "List my assignments (personal + from enrolled courses)",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_course",
            "description": "Create a new course (teacher only)",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string"},
                    "name": {"type": "string"}
                },
                "required": ["code", "name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "join_course",
            "description": "Join/enroll in a course by code",
            "parameters": {
                "type": "object",
                "properties": {
                    "course_code": {"type": "string"}
                },
                "required": ["course_code"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_my_courses",
            "description": "List courses I have joined or that I teach",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "check_in_attendance",
            "description": "Check in attendance",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {"type": "string"},
                    "course_code": {"type": "string"},
                }
            }
        }
    }
]


def _deepseek_client() -> OpenAI:
    key = (getattr(settings, "deepseek_api_key", "") or "").strip()
    if not key:
        raise HTTPException(
            status_code=503,
            detail="Chatbot is not configured. Set DEEPSEEK_API_KEY in backend/.env and restart the server.",
        )
    return OpenAI(api_key=key, base_url="https://api.deepseek.com")


def _session_id(raw: Optional[str]) -> str:
    value = (raw or DEFAULT_SESSION).strip() or DEFAULT_SESSION
    return value[:64]


def _load_history(db: Session, user_id: int, session_id: str) -> List[dict]:
    rows = (
        db.query(ChatMessage)
        .filter(ChatMessage.user_id == user_id, ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
        .all()
    )
    if len(rows) > HISTORY_LIMIT:
        rows = rows[-HISTORY_LIMIT:]
    messages = []
    for row in rows:
        if row.role in ("user", "assistant") and row.content:
            messages.append({"role": row.role, "content": row.content})
    return messages


def _save_message(db: Session, user_id: int, session_id: str, role: str, content: str) -> None:
    db.add(ChatMessage(user_id=user_id, session_id=session_id, role=role, content=content))
    db.commit()


def execute_tool(name: str, args: dict, user: User, db: Session, request: Request):
    if name == "save_assignment":
        due = None
        if args.get("due_date"):
            try:
                due = datetime.fromisoformat(args["due_date"])
            except Exception:
                pass
        course_id = None
        if args.get("course_code"):
            c = db.query(Course).filter(Course.code == args["course_code"]).first()
            if c:
                course_id = c.id
        task = Task(
            user_id=user.id,
            title=args["title"],
            due_date=due,
            weighting=args.get("weighting"),
            course_id=course_id,
            category=args.get("category"),
            source="ai",
        )
        db.add(task)
        db.commit()
        return "Saved: " + args["title"] + (f" (linked to {args.get('course_code')})" if course_id else "")
    elif name == "list_assignments":
        personal = db.query(Task).filter(Task.user_id == user.id).all()
        ens = db.query(Enrollment).filter(Enrollment.user_id == user.id).all()
        course_ids = {e.course_id for e in ens}
        taught = db.query(Course.id).filter(Course.teacher_id == user.id).all()
        course_ids.update(row[0] for row in taught)
        course_tasks = db.query(Task).filter(Task.course_id.in_(course_ids)).all() if course_ids else []
        all_tasks = {t.id: t for t in personal + course_tasks}
        if not all_tasks:
            return "No assignments."
        lines = []
        for t in all_tasks.values():
            due = t.due_date.strftime("%Y-%m-%d") if t.due_date else "no due"
            course_info = ""
            if t.course_id:
                c = db.query(Course).filter(Course.id == t.course_id).first()
                if c:
                    course_info = f" [{c.code}]"
            lines.append(f"- {t.title}{course_info} ({t.weighting or ''}) due {due}")
        return "Assignments:\n" + "\n".join(lines)
    elif name == "create_course":
        if user.role != "teacher":
            return "Only teachers can create courses."
        existing = db.query(Course).filter(Course.code == args["code"]).first()
        if existing:
            return "Course already exists"
        c = Course(code=args["code"], name=args["name"], teacher_id=user.id)
        db.add(c)
        db.commit()
        db.refresh(c)
        if not db.query(Enrollment).filter(Enrollment.user_id == user.id, Enrollment.course_id == c.id).first():
            db.add(Enrollment(user_id=user.id, course_id=c.id))
            db.commit()
        return f"Created course {args['code']}: {args['name']}"
    elif name == "join_course":
        course = db.query(Course).filter(Course.code == args["course_code"]).first()
        if not course:
            return "Course not found"
        existing = db.query(Enrollment).filter(Enrollment.user_id == user.id, Enrollment.course_id == course.id).first()
        if existing:
            return "Already joined"
        db.add(Enrollment(user_id=user.id, course_id=course.id))
        db.commit()
        return f"Joined {course.code}"
    elif name == "list_my_courses":
        ens = db.query(Enrollment).filter(Enrollment.user_id == user.id).all()
        ids = {e.course_id for e in ens}
        taught = db.query(Course.id).filter(Course.teacher_id == user.id).all()
        ids.update(row[0] for row in taught)
        if not ids:
            return "You have not joined any courses."
        courses = db.query(Course).filter(Course.id.in_(ids)).all()
        return "My courses:\n" + "\n".join([f"- {c.code}: {c.name}" for c in courses])
    elif name == "check_in_attendance":
        status = args.get("status", "present")
        course_id = None
        if args.get("course_code"):
            course = db.query(Course).filter(Course.code == args["course_code"]).first()
            if course:
                course_id = course.id
        try:
            client_ip = require_school_ip_for_student(request, db, user)
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, str) else "Attendance can only be marked from a school computer."
            return detail
        result = record_checkin(db, user, status, client_ip, course_id=course_id)
        return result["message"]
    return "Unknown"


@router.get("/history")
def chat_history(
    session_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sid = _session_id(session_id)
    rows = (
        db.query(ChatMessage)
        .filter(ChatMessage.user_id == current_user.id, ChatMessage.session_id == sid)
        .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
        .all()
    )
    return {
        "session_id": sid,
        "messages": [
            {
                "id": row.id,
                "role": row.role,
                "content": row.content,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ],
    }


@router.post("/", response_model=ChatResponse)
def chat(
    request_body: ChatRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    text = (request_body.message or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message is required")
    sid = _session_id(request_body.session_id)
    client = _deepseek_client()

    history = _load_history(db, current_user.id, sid)
    _save_message(db, current_user.id, sid, "user", text)

    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + history + [{"role": "user", "content": text}]
    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=messages,
            tools=tools,
            tool_choice="auto",
            max_tokens=500,
        )
        msg = response.choices[0].message

        if msg.tool_calls:
            messages.append(msg)
            for tc in msg.tool_calls:
                args = json.loads(tc.function.arguments or "{}")
                result = execute_tool(tc.function.name, args, current_user, db, request)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result,
                })
            final = client.chat.completions.create(
                model="deepseek-chat",
                messages=messages,
                max_tokens=500,
            )
            reply = final.choices[0].message.content or "Sorry, I could not produce a reply."
        else:
            reply = msg.content or "Sorry, I could not produce a reply."
    except HTTPException:
        raise
    except Exception as exc:
        # Do not include configuration secrets in the error text.
        raise HTTPException(status_code=500, detail=f"Chatbot request failed: {exc.__class__.__name__}") from exc

    _save_message(db, current_user.id, sid, "assistant", reply)
    return {"reply": reply, "session_id": sid}
