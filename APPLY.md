# How to run this VTC-SAS update

This working tree adds a complete demo database, a Moodle-style chatbot with
stored conversation history, a teacher-edit / student-view calendar, school-IP
attendance gating, and serves the Moodle `frontend/` from FastAPI.

It has a **local commit only**. It was **not pushed**. Commit and push from
your own machine when you are ready.

## Run the server

Start from the `backend/` folder so SQLite (`vtcsas.db`) and `backend/.env`
resolve correctly:

```bash
cd backend
python -m venv venv

# Windows:
venv\Scripts\activate

# macOS / Linux:
source venv/bin/activate

pip install -r requirements.txt
python seed.py
py -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

On Windows, `py -m uvicorn ...` is the usual command. On macOS/Linux,
`python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000` is the same.

Then open:

- http://127.0.0.1:8000/login.html — Moodle sign-in (not the old `/courses.html`)
- http://127.0.0.1:8000/docs — API docs

`/` and `/index.html` are the Moodle dashboard. `/css` and `/js` are served
from `frontend/`. The older pages under `backend/static/` remain as a fallback
for `/chat.html` only if `frontend/chat.html` is missing (it is present now).

## Seed the database

```bash
cd backend
python seed.py
```

The script is idempotent: running it again fills in missing demo rows and
leaves existing ones alone. After seeding, open `backend/vtcsas.db` in DB
Browser for SQLite (or `sqlite3 vtcsas.db`) and you should see data in:

- `users`, `courses`, `enrollments`, `modules`, `tasks`, `attendance`
- `calendar_events`, `chat_messages`, `holidays`, `school_networks`

## Demo accounts

These passwords are obvious and for local demonstration only:

| Username  | Password  | Role    |
|-----------|-----------|---------|
| teacher1  | teacher1  | teacher |
| student1  | student1  | student |

Teacher: can create courses, add calendar events, and manage school networks.
Student: can view the calendar, chat, join courses, and check in — but only
from a school IP once `school_networks` has an enabled row.

## Chatbot key

Copy `backend/.env.example` to `backend/.env` and set `DEEPSEEK_API_KEY`.
Do not commit `.env`. Without the key, the API starts normally but
`POST /api/chat/` returns HTTP 503 until the key is set.

## School IP attendance

The seed inserts `172.30.82.0/23` (school LAN) as an enabled row. That
**turns enforcement on**: a student check-in from any other IP returns
HTTP 403 (`Attendance can only be marked from a school computer.`).
Teachers are not gated.

To try student check-in on a home/Codespaces machine, sign in as `teacher1`
and disable that row:

```bash
# After logging in as teacher1, paste the token:
curl -X PATCH http://127.0.0.1:8000/api/attendance/school-networks/1   -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json"   -d "{"enabled": false}"
```

An empty `school_networks` table (and empty `SCHOOL_NETWORKS` env) turns the
check off again. Optional env flags are documented in `backend/.env.example`
(`SCHOOL_NETWORKS`, `TRUST_PROXY_HEADERS`, default false).

## Calendar permissions

- Any signed-in user can `GET /api/calendar/events` and `/api/calendar/holidays`.
- Only teachers can `POST` / `PUT` / `DELETE` events (students get 403).
- The Calendar page hides the editor for students. Assignment due dates and
  stored events both appear on the month grid.

## Commit and push yourself

This branch was created locally from `main` and was not pushed. From the
repository root on your machine:

```bash
git status
git log -1 --oneline
# If this folder is already the repo with the new commit:
git push -u origin HEAD
```

If you are copying these files onto another clone of
https://github.com/Alex06068/vtc-sas :

```bash
git checkout main
git pull
# copy this working tree over that clone, or add this remote and merge the branch
git checkout -b feat/demo-complete-db-calendar-chat
git add -A
git status
# confirm backend/.env is NOT staged (it is gitignored)
git commit -m "feat: complete demo DB, Moodle chatbot, teacher calendar, and school IP attendance"
git push -u origin HEAD
```

Do not commit `backend/.env`, `backend/vtcsas.db`, or `venv/`.
