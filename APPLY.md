# How to run this VTC-SAS update

This working tree simplifies the Moodle-style front end and lets teachers
create and edit real courses, then add weeks on the same course page.

It sits on top of the earlier demo-database / calendar / chatbot / school-IP
attendance work, which is already on `main`. This branch has a **local commit
only**. It was **not pushed**. Commit and push from your own machine when you
are ready.

## What is new

- The gold icon rail is gone. Every page uses one thin white top bar and text
  links. The page background is `--surface-alt` (`#fbfaf8`); cards stay white.
  Gold is only a small accent (brand badge, primary buttons, the Course tab).
- Home still lists your courses (no new dashboard). A "Due this week" list
  (next 3–5 assignments, phrased like "Due in 2 days") sits above the course
  cards. Each card shows the course name, code, the next piece of work, and a
  thin progress bar (based on completed assignments for now).
- Empty states are one sentence plus a button that opens the existing
  create/join dialog, or asks the teacher to add week 1.
- The course page keeps breadcrumbs and only the Course tab. Unfinished tabs
  (Participants, Grades, Activities, Competencies, More) are hidden, and the
  sidebar icon grid / second navigation is gone. Teachers and students share
  the same layout; teachers get text actions: Edit course and Add a week.
- Teachers can create a course (code, name, description, optional term dates)
  and are taken straight to the course page. They can edit those fields later,
  and add or edit weeks (title, week number or date, materials as text and
  links). File uploads are not in this pass. The existing `modules` table is
  reused; new columns are added on startup.
- Assignment and attendance tables are tighter; existing status tags remain.
- CSV/Excel course import is **not** included (planned for Interim, 12 Jan 2027).
- Student "mark week complete", progress from those checks, a teacher
  "student view" toggle, and per-student due-date extensions are **not** in
  this pass (Interim).

Demo seed data (`teacher1` / `student1` and their two demo courses) is
unchanged except that existing week titles now also store a week number.
No fake real-world course catalogue was added.

## Run the server

Start from the `backend/` folder so SQLite (`vtcsas.db`) and `backend/.env`
resolve correctly:

```bash
cd backend
python -m venv venv

# Windows (if script policy blocks Activate.ps1, use activate.bat):
venv\Scripts\activate.bat

# macOS / Linux:
source venv/bin/activate

pip install -r requirements.txt
python seed.py
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

On Windows, `py -m uvicorn ...` also works if `python` is not on PATH.

Then open:

- http://127.0.0.1:8000/login.html — sign-in (do not use `http://0.0.0.0:8000`)
- http://127.0.0.1:8000/docs — API docs

`/` and `/index.html` are the course home. `/css` and `/js` are served from
`frontend/`.

## Seed the database

```bash
cd backend
python seed.py
```

The script is idempotent. After seeding, open `backend/vtcsas.db` and you
should see data in:

- `users`, `courses`, `enrollments`, `modules`, `tasks`, `attendance`
- `calendar_events`, `chat_messages`, `holidays`, `school_networks`

New optional columns on existing databases are added at startup:
`courses.start_date`, `courses.end_date`, and on `modules`: `week_number`,
`start_date`, `content`, `links`.

## Demo accounts

These passwords are obvious and for local demonstration only:

| Username  | Password  | Role    |
|-----------|-----------|---------|
| teacher1  | teacher1  | teacher |
| student1  | student1  | student |

Teacher: can create and edit their courses, add weeks, add calendar events,
and manage school networks. Student: can view courses and the calendar, chat,
join courses, and check in — but only from a school IP once `school_networks`
has an enabled row.

## Chatbot key

Copy `backend/.env.example` to `backend/.env` and set `DEEPSEEK_API_KEY`.
Do not commit `.env`. Without the key, the API starts normally but
`POST /api/chat/` returns HTTP 503 until the key is set.

## School IP attendance

The seed inserts `172.30.82.0/23` (school LAN) as an enabled row. That
**turns enforcement on**: a student check-in from any other IP returns
HTTP 403 (`Attendance can only be marked from a school computer.`).
Teachers are not gated.

To try student check-in off the school LAN, sign in as `teacher1` and
disable that row:

```bash
# After logging in as teacher1, paste the token:
curl -X PATCH http://127.0.0.1:8000/api/attendance/school-networks/1 \
  -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

## Commit and push yourself

This branch was created locally from updated `main` and was not pushed.
From the repository root on your machine:

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
git checkout -b feat/simplify-ui-course-weeks
# copy this working tree over that clone, then:
git add -A
git status
# confirm backend/.env is NOT staged (it is gitignored)
git commit -m "feat: simplify Moodle UI and add teacher course week editing"
git push -u origin HEAD
```

Do not commit `backend/.env`, `backend/vtcsas.db`, or `venv/`.
