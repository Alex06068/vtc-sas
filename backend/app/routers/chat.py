from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from openai import OpenAI
from .auth import get_current_user
from ..models import User

router = APIRouter()

# DeepSeek client (OpenAI-compatible)
client = OpenAI(
    api_key="sk-28678f2a04ed4ae586ea44a64d89ce02",
    base_url="https://api.deepseek.com"
)

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    reply: str

@router.post("/", response_model=ChatResponse)
def chat(request: ChatRequest, current_user: User = Depends(get_current_user)):
    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "You are a helpful academic assistant for VTC students. Help with schedules, assignments, and deadlines."},
                {"role": "user", "content": request.message}
            ],
            max_tokens=500
        )
        reply = response.choices[0].message.content
        return {"reply": reply}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")
