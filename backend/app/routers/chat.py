from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from openai import OpenAI
from sqlalchemy.orm import Session
from datetime import datetime, date
from ..database import get_db
from ..models import Task, User, Attendance
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
            "description": "Save a new assignment/deadline extracted from user message",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "due_date": {"type": "string", "description": "YYYY-MM-DD"},
                    "weighting": {"type": "string"}
                },
                "required": ["title"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_assignments",
            "description": "List all assignments for the current user",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "check_in_attendance",
            "description": "Check in today's attendance for the user",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {"type": "string", "enum": ["present", "absent", "late"], "description": "Attendance status"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_attendance",
            "description": "List the user's attendance records",
            "parameters": {"type": "object", "properties": {}}
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
        task = Task(user_id=user.id, title=args["title"], due_date=due, weighting=args.get("weighting"), source="ai")
        db.add(task)
        db.commit()
        return f"Saved: {args['title']}"
    elif name == "list_assignments":
        tasks = db.query(Task).filter(Task.user_id == user.id).all()
        if not tasks:
            return "No assignments yet."
        lines = []
        for t in tasks:
            due = t.due_date.strftime("%Y-%m-%d") if t.due_date else "no due date"
            w = f" ({t.weighting})" if t.weighting else ""
            lines.append(f"- {t.title}{w} due {due}")
        return "Assignments:\n" + "\n".join(lines)
    elif name == "check_in_attendance":
        today = date.today().isoformat()
        status = args.get("status", "present")
        existing = db.query(Attendance).filter(Attendance.user_id == user.id, Attendance.date == today).first()
        if existing:
            existing.status = status
            db.commit()
            return f"Updated today to {status}"
        db.add(Attendance(user_id=user.id, date=today, status=status))
        db.commit()
        return f"Checked in as {status}"
    elif name == "list_attendance":
        records = db.query(Attendance).filter(Attendance.user_id == user.id).order_by(Attendance.date.desc()).limit(10).all()
        if not records:
            return "No attendance records yet."
        lines = [f"- {r.date}: {r.status}" for r in records]
        return "Recent attendance:\n" + "\n".join(lines)
    return "Unknown tool"

@router.post("/", response_model=ChatResponse)
def chat(request: ChatRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        messages = [
            {
                "role": "system",
                "content": "You are a helpful academic assistant. Use tools when the user wants to save/list assignments or check in/list attendance. Be concise."
            },
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
            for tool_call in msg.tool_calls:
                name = tool_call.function.name
                args = json.loads(tool_call.function.arguments or "{}")
                result = execute_tool(name, args, current_user, db)
                messages.append(msg)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": result
                })

            final = client.chat.completions.create(
                model="deepseek-chat",
                messages=messages,
                max_tokens=500
            )
            reply = final.choices[0].message.content
        else:
            reply = msg.content or "Sorry, I couldn't process that."

        return {"reply": reply}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")
