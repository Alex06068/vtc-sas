# VTC-SAS Starter (No Docker)

## Prerequisites
- Python 3.11 or 3.12 installed
- Git

## Setup Steps

1. Clone this repository:
```bash
git clone https://github.com/Alex06068/vtc-sas.git
cd vtc-sas
```

2. Open terminal in the `backend` folder:

```bash
cd backend
python -m venv venv

# Windows:
venv\Scripts\activate

# Mac/Linux:
source venv/bin/activate

pip install -r requirements.txt
```

3. Run the server:
```bash
uvicorn app.main:app --reload
```

4. Open http://127.0.0.1:8000/docs

## Test
- Register a user via `/api/auth/register`
- Login via `/api/auth/login`
- Use the token to create and list tasks

Next: We will add PDF parsing endpoint.
