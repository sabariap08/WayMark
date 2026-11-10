# WayMark Backend (Flask + SQL Server/Postgres)

Flask API that powers the WayMark prototype frontend. On startup it connects to
the configured database (local SQL Server, Supabase/Postgres, or SQLite),
creates + seeds the demo data when the database is empty, and also serves the
static frontend from `../frontend`. With no database configured it uses a local
SQLite file, so the quickstart below works out of the box.

## Quickstart

```powershell
cd backend
pip install -r requirements.txt
python app.py
```

Open http://localhost:5000 — the frontend loads and every page talks to the API
on the same origin (`/api/...`).

## Local SQL Server

Use SQL Server Management Studio to run `backend/database.sql` once against a
local instance. It creates the `WayMarkLocal` database and all tables/indexes
using the Windows-authenticated connection configured in `.env`.

```powershell
sqlcmd -S localhost -E -C -I -i database.sql
python app.py
```

Set `LOCAL_DB_ENABLED=1` in `.env` to use it. The default `.env` values use
`localhost`, database `WayMarkLocal`, ODBC Driver 18, Windows authentication and
`TrustServerCertificate=yes`. For SQL authentication, set
`LOCAL_DB_TRUSTED_CONNECTION=no` and fill `LOCAL_DB_USER` / `LOCAL_DB_PASSWORD`.
The script is intended for a fresh `WayMarkLocal` database; drop and recreate it
before re-running.

## Configuration

Copy `.env.example` to `backend/.env` and fill in your own values. No secrets
are stored in the repository. With no database settings the app uses local
SQLite; set `LOCAL_DB_ENABLED=1` for SQL Server or `DATABASE_URL` / the `DB_*`
parts for Postgres.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | empty | Full SQLAlchemy URL. Overrides `LOCAL_DB_*` and `DB_*`. |
| `LOCAL_DB_ENABLED` | `0` | Use local SQL Server. |
| `LOCAL_DB_SERVER` / `LOCAL_DB_NAME` / `LOCAL_DB_DRIVER` | `localhost` / `WayMarkLocal` / `ODBC Driver 18 for SQL Server` | Local SQL Server target. |
| `LOCAL_DB_TRUSTED_CONNECTION` | `yes` | Windows authentication. Set `no` to use `LOCAL_DB_USER` / `LOCAL_DB_PASSWORD`. |
| `LOCAL_DB_TRUST_SERVER_CERTIFICATE` | `yes` | Accept the local server certificate (ODBC Driver 18 encrypts by default). |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | empty / `5432` / `postgres` / `postgres` / empty | Postgres parts (password is URL-encoded automatically). No database settings means local SQLite. |
| `SQLITE_FALLBACK` | `1` | If the configured database is unreachable, fall back to `backend/waymark-local.db` so the app still runs. Set `0` to fail hard. |
| `PORT` | `5000` | HTTP port. |
| `SECRET_KEY` | random per process | JWT signing key. Set a stable value for any real deployment; without it a new random key is generated at each start and sessions reset on restart. |
| `OTP_LENGTH` | `6` | Verification code length. |
| `OTP_EXP_MINUTES` | `15` | Code validity window. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | unset | Real email delivery. When unset, mail is stored in-app instead. |
| `DEMO_USER_EMAIL` | `user@baymark.com` | User used when a request has no token (frontend demo browsing). Never an admin. |
| `WM_DEMO_AUTH` | `1` | When `1`, an unauthenticated request resolves to `DEMO_USER_EMAIL`. Set `0` to require a real JWT. |
| `AI_PROVIDER` / `AI_API_KEY` / `AI_MODEL` | `local` / empty | AI co-pilot. `local` is a deterministic offline generator (no key, no network). Remote providers are used only when a key is supplied. Plans are always proposals requiring human approval. |
| `PAYMENT_PROVIDER` / `PAYMENT_MODE` / `PAYMENT_SECRET` | empty / `test` / empty | Empty provider disables payments (checkout returns 409, no Payment row). `sandbox` enables the HMAC-SHA256 signature-verified sandbox flow. `paypal` enables the real PayPal Orders v2 checkout. Card data is never accepted or stored. |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | empty | PayPal REST app credentials (developer.paypal.com). Required when `PAYMENT_PROVIDER=paypal`; only the client id is sent to the browser. |
| `PAYPAL_MODE` / `PAYPAL_CURRENCY` | `sandbox` / `USD` | PayPal environment and settlement currency (PayPal does not settle in INR). |
| `PAYPAL_WEBHOOK_ID` | empty | Webhook id used to verify signatures at `/api/payments/paypal/webhook`. Without it webhooks are rejected. |
| `PAYPAL_INR_PER_USD` | `83.0` | FX rate used to convert INR event fees to the PayPal charge; no rate configured for a pair means checkout refuses rather than guessing. |
| `PAYPAL_RETURN_URL` / `PAYPAL_CANCEL_URL` | empty | Optional PayPal return/cancel URLs (used by the redirect fallback). |
| `FRONTEND_DIR` | `../frontend` | Static file root. |

Never commit `backend/.env`. If a credential was ever committed, rotate it in the
provider's dashboard immediately and scrub it from git history; deleting it from
the current file does not invalidate the leaked value.

## Migrations

`backend/migrations/` holds ordered, **non-destructive** schema steps recorded in
`wm_schema_migrations`. On boot the order is: `db.create_all()` → `run_migrations()`
→ `seed_all()` → `ensure_accounts()` → `ensure_event_types()`. `add_column` /
`add_index` are dialect-aware and guarded, so re-running is safe. Inspect with
`migration_status()`.

## Event engine & operating platform (this build)

Beyond the original auth/event/registration core, the API now covers:

- `event-types` — configurable type engine (workflow, fields, participation,
  evaluation, certificate rules). Admin CRUD + validation; seeded system types.
- `scheduling` — sessions, venues, resources, bookings, persisted schedule
  **conflict detection** (room/speaker/volunteer/resource overlap, capacity,
  availability, missing resource, impossible deadline) with stable fingerprints,
  auto-resolution and computed suggestions.
- `operations` — live ops metrics, incidents (legal status transitions),
  schedule-change propagation, notification jobs.
- `tasks` — task board, dependencies (cycle-checked), volunteer recommendations
  (skills/availability/hour-caps) and hour logging.
- `finance` — budget categories/lines/summary/scenarios and sponsors with
  deliverables + sponsor report. All money is integer **minor units** + ISO
  currency (`utils/money.py`).
- `plans` — AI co-pilot: brief → validated plan draft → `preview` → human
  `approve` creates the event/sessions/tasks/budget (idempotent). AI never
  publishes anything by itself.
- `achievements` — certificate eligibility, bulk issue, achievement sync/share.
- `analytics` — per-event metrics, A/B comparison, natural-language query,
  AI insights.
- `integrations` — webhooks (+ deliveries/retry/test, HMAC signatures),
  calendar `.ics`, CSV/XLSX registration import (validate→commit), exports,
  and a public read-only API (`X-WayMark-Key`).
- `organizations` — orgs, members/roles/permissions, org-scoped events.
- `payments` — PayPal Orders v2 checkout (server-side create/capture + verified
  webhooks) or the HMAC-signed sandbox flow; all verification is server-side and idempotent.
- `offline` — offline check-in sync, status and a limited PII-free manifest.

## API map (all under `/api`)

- Supabase/Postgres is the hosted database; local SQL Server and SQLite are also
  supported. Tables are created automatically; if the `wm_users` table is empty,
  the full demo dataset is seeded (8 users, 8 events, 18 registrations, hosting
  requests, volunteers, scores, certificates, jobs, mails, audit logs...).
- The Supabase direct host resolves to IPv6. On networks without IPv6 the
  connection times out and the app transparently falls back to the bundled
  SQLite file (freshly seeded) when `SQLITE_FALLBACK=1`.

## Roles

Exactly two application roles exist: **Admin** and **Normal User**. Any signed-in
user may submit a *hosting request* ("Host an Event"); an Admin approves it into
a live event owned by that user. Jury members and volunteers are **event-scoped
guests** reached through scoped invite links — they are never a role and never
create a user account.

## Demo logins

| Username | Email | Password | Role |
| --- | --- | --- | --- |
| `admin` | `admin@baymark.com` | `admin@123` | Admin |
| `user` | `user@baymark.com` | `user@123` | Normal User |

Other seeded users (`devi`, `rhea`, `tomas`, `alba`, `jin`, `noor` @ `baymark.com`)
share the password `demo@1234`. Login accepts an email **or** a username. The
two exact accounts above are re-applied on every boot by `ensure_accounts()`.

Guest links (no login): jury tokens `demo-jury`, `jury-design-9f2a`,
`jury-design-4b7c`, `jury-robotics-4c1b`; volunteer tokens `vol-zero-11aa`,
`vol-zero-22bb`, `vol-rr-33cc` (open `judge.html?token=…` / `volunteer.html?token=…`).

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
- `hosting-requests`: submit, list, get, update, resubmit, cancel, admin
  approve / reject / request-changes (approval creates the owned event)
- `volunteers`: event-scoped volunteer CRUD + invite link (`?token=`)
- `attendance`: checkin (scanner), undo, exceptions
- `jury`, `rubrics`, `submissions`, `scores`: judging pipeline (jury = guests)
- `feedback`, `certificates` (+ public `verify/<code>`), `notifications`
- `dashboard`: role-aware payloads, `audit`, `leaderboard`
- `reports`: `GET /events/<id>/reports/<kind>?format=csv|pdf|xlsx`
  (kinds: registrations, attendance, results, feedback, certificates, submissions)
- `messages`: in-app outbox, event send to audiences, resend
- `admin`: jobs (retry), ai-logs, users, events, mail, settings
- `ai`: draft-event, draft-message, summarise-feedback, ask (deterministic local)
- `plans` / `ai`: `/ai/status`, `/plans/generate|preview|approve|reject`,
  draft-schedule / draft-tasks / draft-communication, `/ai/insights`
- `scheduling`: sessions, venues, resources, schedule, `schedule/validate`,
  conflicts, bookings
- `operations`: `/events/<id>/operations`, incidents, `sessions/<id>/changes`
- `tasks`: tasks CRUD, assign, dependencies, volunteer recommendations + hours
- `finance`: budget categories/lines/summary/scenarios, sponsors, sponsor-report
- `event-types` (config CRUD), `achievements`, `analytics`, `organizations`
- `integrations`: webhooks (+ deliveries/retry), `calendar.ics`, `import/registrations`,
  `exports/<kind>`, `v1/*` public API, `integrations/keys`
- `payments`: config, checkout, verify, provider webhook
- `attendance` (offline): `sync`, `sync-status`, `offline-manifest`
- `guest`: jury **and** volunteer guest-link activation (scoped tokens)

Errors are always `{ "message": "..." }` with a matching HTTP status; frontend
`api.js` surfaces that text in toasts.