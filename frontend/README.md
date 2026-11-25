# VTC-SAS Front End

A Moodle-style academic front end. Every page reads real data from the FastAPI
backend — nothing is hard-coded.

Pages:

| File | Purpose |
| --- | --- |
| `login.html` | Sign in / register |
| `index.html` | My Courses dashboard (card layout) |
| `course.html` | Single course: summary, modules, assignments |
| `assignments.html` | Assignment list with search, course filter and status |
| `attendance.html` | Attendance history plus today's check-in |
| `calendar.html` | Month calendar: assignment dues, stored events, holidays |
| `chat.html` | Moodle chatbot with stored conversation history |

Plain HTML + CSS + JavaScript. No build step, no third-party runtime dependency.

## Layout

```
frontend/
├── index.html            # My Courses dashboard
├── course.html           # Course page (course content, modules, assignments)
├── assignments.html      # Assignment list
├── attendance.html       # Attendance records
├── login.html            # Sign in / register
├── css/
│   └── app.css           # Design system: gold rail, Roboto, cards, tables
├── js/
│   ├── config.js         # API_BASE resolution (usually untouched)
│   ├── api.js            # fetch wrapper: token handling, 401 handling, endpoints
│   ├── normalize.js      # Field normalisation + date / weighting / status formatting
│   ├── ui.js             # Shared UI: toasts, state boxes, navbar, auth guard, sections
│   ├── dashboard.js      # My Courses logic
│   ├── course.js         # Course page logic
│   ├── assignments.js    # Assignment list logic
│   ├── attendance.js     # Attendance logic
│   └── login.js          # Sign in / register logic
└── README.md
```

## Running it

### 1. Start the backend

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API listens on `http://127.0.0.1:8000`.

### 2. Start the front end

```powershell
cd frontend
python -m http.server 5500
```

The recommended path is to start uvicorn from `backend/` and open
`http://127.0.0.1:8000/login.html` (FastAPI serves this `frontend/` folder).
You can still use a separate static server on port 5500:

Open `http://127.0.0.1:5500/login.html`.

`js/config.js` resolves the API base automatically:

- served from port 5500 → requests go to `http://127.0.0.1:8000`;
- served from the backend origin (port 8000) → relative `/api/...`;
- opened as `file://` → `http://127.0.0.1:8000`.

### 3. First run

For a ready-made demo, run `python seed.py` from `backend/` and sign in as
`teacher1` / `teacher1` or `student1` / `student1`. You can also register first:

- username, email and password are required;
- pick the role: **student** or **teacher**;
- a successful registration signs you in and lands on the dashboard.

Suggested walkthrough:

1. Register a **teacher** account, then create a course (or join one);
2. Register a **student** account and join with the course code;
3. Assignments appear once the course has some (created through
   `POST /api/tasks/` or by the chatbot);
4. On the attendance page, press **Check in** to write today's record.

## Page → endpoint map

| Page | Endpoint | Notes |
| --- | --- | --- |
| `login.html` | `POST /api/auth/login` | form-encoded `username` + `password`, returns `access_token` |
| `login.html` | `POST /api/auth/register` | JSON: `username` + `email` + `password` + `role` |
| navbar | `GET /api/auth/me` | shows username and role; teachers also get "Create a course" |
| `index.html` | `GET /api/courses/my` | enrolled courses |
| `index.html` | `POST /api/courses/join/{course_code}` | join by code |
| `index.html` | `POST /api/courses/` | create a course (teachers only) |
| `course.html` | `GET /api/courses/my` | resolve the course from `?id=` |
| `course.html` | `GET /api/courses/{id}/modules` | module list |
| `course.html` | `GET /api/tasks/` | filtered to this course |
| `assignments.html` | `GET /api/tasks/` | assignment list |
| `assignments.html` | `GET /api/courses/my` | course column and filter dropdown |
| `attendance.html` | `GET /api/attendance/my` | history (`date` + `status`) |
| `attendance.html` | `POST /api/attendance/checkin` | `{"status": "present"}` |

Every business call sends `Authorization: Bearer <token>`; the token lives in
`localStorage` under `vtcsas_token`. A `401` clears the session and redirects to
the login page.

## Field reference (aligned with `backend/app/models.py`)

- **Course**: `id / code / name / description`.
- **Assignment**: `title / due_date / weighting / course_id / is_completed`.
  - `due_date` renders as `YYYY-MM-DD HH:mm` in local time;
  - `weighting` may be `30`, `30%` or free text; bare numbers get a `%`;
  - status: Completed / Overdue / Due soon (within 7 days) / In progress / No due date.
- **Attendance**: `date` (`YYYY-MM-DD`) + `status`
  (`present / late / absent` → Present / Late / Absent).

Field normalisation lives in `js/normalize.js`; if the backend renames a field,
that is the only file to touch.

## Deployment notes

- If a page reports "Could not reach the backend", check that the API is running
  and that `API_BASE` in `js/config.js` is correct.
- Backend CORS allows every origin, so serving the front end from port 5500 and
  calling port 8000 works out of the box.
- "Create a course" is only rendered for the teacher role; the API also rejects
  students with `403`.
- To serve these pages from the backend itself, add `StaticFiles` mounts for
  `css/` and `js/` (or `FileResponse` routes) in `backend/app/main.py`.
