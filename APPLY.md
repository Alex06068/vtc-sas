# How to run this VTC-SAS update

This working tree simplifies the Moodle-style front end, lets teachers
create and edit real courses by week, and lets them upload Office/PDF files
into a week or topic so assignment and exam dates can be extracted and confirmed,
and seeds the eight real AY 2026/27 courses with known dates and conflict flags.

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
  the same layout; teachers get text actions: Edit course and Add a week or topic.
- Teachers can create a course (code, name, description, teacher names as
  text, optional class/time, optional term dates, and whether the course is
  organised by week or by topic) and are taken straight to the course page.
  They can edit those fields later, and add or edit weeks or named topic /
  deliverable blocks (title, optional week number or date, materials as text
  and links). The existing `modules` table is reused; new columns are added
  on startup. Topic-based courses are not forced into Week 01–11.
- Teachers can drop or browse a batch of Word (.docx), Excel (.xlsx),
  PowerPoint (.pptx) or PDF files into a week or topic. The server reads the files,
  classifies them (notes / assignment brief / exam schedule), and extracts
  assignment names, due dates, and exam times or places where it can.
  Extraction also covers section titles and description text, not only
  uploaded Office/PDF files. Teachers get a short confirm list they can
  edit. Year or time conflicts in the source (for example a Moodle year typo,
  or 08:30 vs 11:59pm) are flagged; the preferred official date is stored,
  and the item stays unconfirmed until the teacher accepts it. Unconfirmed
  dates are not shown to students as due items. After confirmation, the
  items appear in "Due this week" and on the calendar. On the week card, everyone sees
  the file type and any dates they are allowed to see before opening the
  file. Teachers also have a compact Student view (what students will see;
  unconfirmed dates are hidden). Uploaded files are stored under
  `backend/uploads/weeks/` (gitignored). Extraction rows live in
  `week_files` and `file_extractions`.
- Assignment and attendance tables are tighter; existing status tags remain.
- CSV/Excel course import is **not** included (planned for Interim, 12 Jan 2027).
- Student "mark week complete", progress from those checks, and per-student
  due-date extensions are **not** in this pass (Interim).
- Full-text search of file contents, chatbot answers that cite the source
  file, and copying a previous-term course with shifted dates are **not**
  in this pass.

Demo seed data still includes `teacher1` / `student1` and the two demo
courses IT114115 / IT114116 (for accounts and development). The eight real
AY 2026/27 courses listed below are also seeded. No extra catalogue padding
and no extra teacher login accounts (names are stored as text on the course).
No lecture files, classmate rosters, or invented due dates were added.

## AY 2026/27 real courses

Re-run `python seed.py` from `backend/` (idempotent). The eight courses are:

1. **ITP4120** Data Centre and Private Cloud Technologies — topics. Teacher
   text: LI KA KIT / Harry Li. Quiz 26 Nov 2026 (confirmed). EA Project
   Submission is stored as **14 Dec 2026**, with a year-conflict flag
   (Moodle had 14 Dec 2025). Lab batch deadlines are mentioned but no
   individual batch dates were invented.
2. **ITE4116M** Final Year Project — deliverable topics (Initial / Interim /
   Final Report), each grouping Guide, Template and the dated assignment
   without inventing those files. Responsible teacher CHEUNG WAI KIT, plus
   the other named teachers as text. Initial Report 10 Dec 2026 08:30 and
   Final Report 29 Apr 2027 08:30 are confirmed. Interim Report is stored
   as **12 Jan 2027 08:30**, with a time-conflict flag (schedule HTML also
   said 11:59pm).
3. **ITP4124** DevOps in Cloud — topics. Teachers: CHEUNG WAI KIT / Kitson
   Cheung, WONG CHUN YIN / Cyrus Wong. CA written exam 4 Dec 2026 14:30
   room A536, lab CA marks 7 Dec 2026 09:00, project 31 Oct 2026 (date
   only; the Google Doc is not stored). Empty ACD Slides, empty New
   sections, and the expired 2024 eSFQ item were not added.
4. **ITP4125** Advanced Linux and Container Technologies — weeks 01–11,
   with 07 and 08 merged. Teachers: CHEUNG WAI KIT, LEUNG KA KA / Elka
   Leung. Week materials are labels only (no fake PDFs). EA Due Date
   27 Nov 2026 23:59 and Kubernetes CA 4 Dec 2026 23:59 are confirmed
   from the section titles.
5. **LAN4103** Professional Workplace Communication: Proposal and Report
   Writing — topics. Teacher: JALALI ALLEN. Class IT114115-2B, Friday
   12:30. EAII exam 27 Nov 2026 12:30, room LW6M73. File pack left for
   the teacher to upload.
6. **LD0001-YUE** 「悅」語同行 — shared language self-study / reward
   course. The official code is LD0001; the suffix keeps it distinct in
   the database. Facilitators are not listed on the course card.
7. **LD0001-KOL** Keep On Learning! / 自在學 — same kind of course, with
   a distinct code for the same reason.
8. **SDD4007** Enhancing Competencies in the 21st Century Workplace —
   topics. Teacher: SUEN CHING / Ray Suen. Class 3.4 IT114115 2B,
   Wednesday 15:30, room LW217. CA3 (4%) 31 Dec 2026 23:59 is confirmed.
   The mock interview has no due date (none was invented). Workshop PPTX
   files are not stored.

`teacher1` is the demo editor for these courses; `student1` is enrolled
so both views work. Confirmed dates (including 27 Nov and 4 Dec items)
show under "Due this week" and on the calendar after seed. The two
conflict items stay in the teacher's confirm list until accepted; they
are not published as student due items until then.

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

## Try week or topic file uploads

Sign in as `teacher1`, open a course, and add a week or topic if needed. On the week or topic
card, drop (or browse) one or more `.docx`, `.xlsx`, `.pptx` or `.pdf` files.
If the files mention a due date or exam, a confirm list opens. Edit the name,
date or place if needed, then confirm. Those items then show up for
`student1` under "Due this week" and on the Calendar page. Use **Student
view** on the course page to preview what students will see (unconfirmed
dates stay hidden).

Older `.doc` / `.xls` / `.ppt` files are not accepted; save them in the
newer Office format first. Do not commit files under `backend/uploads/`.

## Seed the database

```bash
cd backend
python seed.py
```

The script is idempotent. After seeding, open `backend/vtcsas.db` and you
should see data in:

- `users`, `courses`, `enrollments`, `modules`, `tasks`, `attendance`
- `calendar_events`, `chat_messages`, `holidays`, `school_networks`

New optional columns and tables on existing databases are added at startup:
`courses.start_date`, `courses.end_date`, `courses.organization`,
`courses.teachers_text`, `courses.class_info`, `tasks.location`, and on
`modules`: `week_number`, `start_date`, `content`, `links`, plus the
`week_files` and `file_extractions` tables (section-title dates may have
no file; conflict fields live on the extraction row).

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
