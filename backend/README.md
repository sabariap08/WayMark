# WayMark Backend (Flask + Supabase)

Flask API that powers the WayMark prototype frontend. On startup it connects to
Supabase Postgres, creates + seeds the demo data when the database is empty, and
also serves the static frontend from `../frontend`.

## Quickstart

```powershell
cd backend
pip install -r requirements.txt
python app.py
```

Open http://localhost:5000 — the frontend loads and every page talks to the API
on the same origin (`/api/...`).

## Configuration

All values are optional; working defaults ship in `config.py`. Override with a
`backend/.env` file (see `.env.example`).

| Variable | Default | Purpose |
| --- | --- | --- |
| `SUPABASE_DB_URL` | Supabase direct connection (built in) | Full SQLAlchemy URL. Overrides the `DB_*` parts. |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | Supabase project values | Connection parts (password is URL-encoded automatically). |
| `SQLITE_FALLBACK` | `1` | If Supabase is unreachable, fall back to `backend/waymark-local.db` so the app still runs. Set `0` to fail hard. |
| `PORT` | `5000` | HTTP port. |
| `SECRET_KEY` | dev key | JWT signing key — change for any real deployment. |
| `OTP_LENGTH` | `6` | Verification code length. |
| `OTP_EXP_MINUTES` | `15` | Code validity window. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | unset | Real email delivery. When unset, mail is stored in-app instead. |
| `DEMO_USER_EMAIL` | `admin@waymark.dev` | User used when a request has no token (frontend demo browsing). |
| `FRONTEND_DIR` | `../frontend` | Static file root. |

## Database behaviour

- Supabase is the primary database. Tables are created automatically; if the
  `wm_users` table is empty, the full demo dataset is seeded (10 users, 8 events,
  18 registrations, scores, certificates, jobs, mails, audit logs...).
- The Supabase direct host resolves to IPv6. On networks without IPv6 the
  connection times out and the app transparently falls back to the bundled
  SQLite file (freshly seeded), so demos never break. Both paths are covered by
  the endpoint test pass.

## Demo logins

Password for all seeded accounts: `waymark123`

| Email | Role |
| --- | --- |
| `admin@waymark.dev` | Admin |
| `host@waymark.dev` | Host |
| `jury@waymark.dev` | Jury |
| `member@waymark.dev` | Participant |
| `rhea@waymark.dev`, `tomas@waymark.dev`, `alba@waymark.dev`, `jin@waymark.dev`, `noor@waymark.dev`, `meera.jury@waymark.dev` | Mixed demo users |

Guest jury tokens (no login): `demo-jury`, `jury-design-9f2a`, `jury-robotics-4c1b`.

## Email & OTP

- Every email — OTP codes, receipts, results announcements, certificates — is
  persisted to `wm_mail_messages` and readable via `GET /api/messages` (the
  "Mail outbox" panel on the Messages page).
- When SMTP is not configured, no email is sent and the API returns
  `otpFallback` (a code of zeros, e.g. `000000`). The password reset UI shows
  this code directly, and the same mail body is visible in the outbox.

## API map (all under `/api`)

- `auth`: signup, login, logout, me, password-reset + OTP request/verify/confirm
- `users`, `profile`: user directory and profile updates
- `events`: CRUD, submit/approve/request-changes, workspace payload, jobs,
  results, leaderboard, certificates generate/list, reports per format
- `registrations`: register, cancel, waitlist accept/decline, host override
- `attendance`: checkin (scanner), undo, exceptions
- `jury`, `rubrics`, `submissions`, `scores`: judging pipeline
- `feedback`, `certificates` (+ public `verify/<code>`), `notifications`
- `dashboard`: role-aware payloads, `audit`, `leaderboard`
- `reports`: `GET /events/<id>/reports/<kind>?format=csv|pdf|xlsx`
  (kinds: registrations, attendance, results, feedback, certificates, submissions)
- `messages`: in-app outbox, event send to audiences, resend
- `admin`: jobs (retry), ai-logs, users, events, mail, settings
- `ai`: draft-event, draft-message, summarise-feedback, ask (deterministic local)
- `guest`: jury guest activation

Errors are always `{ "message": "..." }` with a matching HTTP status; frontend
`api.js` surfaces that text in toasts.