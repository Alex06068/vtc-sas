from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from openai import OpenAI
from sqlalchemy.orm import Session
from datetime import datetime, date
from ..database import get_db
from ..models import Task, User, Attendance, Course, Module, Enrollment
from .auth import get_current_user
import json

router = APIRouter()

client = OpenAI(
    api_key="sk-28678f2a04ed4ae586ea44a64d89ce02",
    base_url="https://api.deepseek.com"
)

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    reply: str

tools = [
    {
        "type": "function",
        "function": {
            "name": "save_assignment",
            "description": "Save a new assignment",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "due_date": {"type": "string"},
                    "weighting": {"type": "string"},
                    "course_code": {"type": "string"}
                },
                "required": ["title"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_assignments",
            "description": "List my assignments",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_course",
            "description": "Create a new course",
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
            "description": "List courses I have joined",
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
                    "status": {"type": "string"}
                }
            }
        }
    }
]

def execute_tool(name: str, args: dict, user: User, db: Session):
    if name == "save_assignment":
        due = None
        if args.get("due_date"):
            try:
                due = datetime.fromisoformat(args["due_date"])
            except:
                pass
        course_id = None
        if args.get("course_code"):
            c = db.query(Course).filter(Course.code == args["course_code"]).first()
            if c:
                course_id = c.id
        task = Task(user_id=user.id, title=args["title"], due_date=due, weighting=args.get("weighting"), course_id=course_id, source="ai")
        db.add(task)
        db.commit()
        return f"Saved: {args['title']}"
    elif name == "list_assignments":
        tasks = db.query(Task).filter(Task.user_id == user.id).all()
        if not tasks:
            return "No assignments."
        lines = []
        for t in tasks:
            due = t.due_date.strftime("%Y-%m-%d") if t.due_date else "no due"
            lines.append(f"- {t.title} ({t.weighting or ''}) due {due}")
        return "Assignments:\n" + "\n".join(lines)
    elif name == "create_course":
        existing = db.query(Course).filter(Course.code == args["code"]).first()
        if existing:
            return "Course already exists"
        c = Course(code=args["code"], name=args["name"], teacher_id=user.id)
        db.add(c)
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
        if not ens:
            return "You have not joined any courses."
        ids = [e.course_id for e in ens]
        courses = db.query(Course).filter(Course.id.in_(ids)).all()
        return "My courses:\n" + "\n".join([f"- {c.code}: {c.name}" for c in courses])
    elif name == "check_in_attendance":
        today = date.today().isoformat()
        status = args.get("status", "present")
        existing = db.query(Attendance).filter(Attendance.user_id == user.id, Attendance.date == today).first()
        if existing:
            existing.status = status
            db.commit()
            return f"Updated to {status}"
        db.add(Attendance(user_id=user.id, date=today, status=status))
        db.commit()
        return f"Checked in as {status}"
    return "Unknown"

@router.post("/", response_model=ChatResponse)
def chat(request: ChatRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        messages = [
            {"role": "system", "content": "You are an academic assistant. Use tools to create/join courses, save/list assignments, or check in. When user says join a course, use join_course."},
            {"role": "user", "content": request.message}
        ]
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=messages,
            tools=tools,
            tool_choice="auto",
            max_tokens=500
        )
        msg = response.choices[0].message
        if msg.tool_calls:
            for tc in msg.tool_calls:
                args = json.loads(tc.function.arguments or "{}")
                result = execute_tool(tc.function.name, args, current_user, db)
                messages.append(msg)
                messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})
            final = client.chat.completions.create(model="deepseek-chat", messages=messages, max_tokens=500)
            reply = final.choices[0].message.content
        else:
            reply = msg.content or "Sorry."
        return {"reply": reply}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
