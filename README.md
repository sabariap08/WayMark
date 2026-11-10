# WayMark

WayMark is an event operations platform prototype. It covers the full event
lifecycle: hosting requests and approvals, event setup, registration and
waitlists, scheduling, volunteers, judging and results, certificates, finance,
analytics, integrations, and check-in.

The project is a Flask API with a React/Vite single-page app. Flask serves the
built frontend from the same origin, with client-side routing handled by an SPA
fallback.

## Features

- Authentication with email or username, password reset, and email verification
- Events, hosting requests, approvals, and event workspaces
- Event-type engine with configurable workflows, fields, and certificate rules
- Registrations, waitlists, attendance, and offline check-in sync
- Sessions, venues, resources, schedule conflict detection, and suggestions
- Volunteer tasks, dependencies, recommendations, and hour tracking
- Jury assignments, rubrics, submissions, scoring, results, and leaderboards
- Certificate eligibility, batch issue, public verification, and achievement sync
- Budgets, sponsors, sponsor reports, and money handling in integer minor units
- Organizations, members, roles, permissions, and org-scoped events
- Webhooks, calendar export, CSV/XLSX import, exports, and a read-only public API
- Payments through PayPal Orders v2 or an HMAC-signed sandbox flow
- Notifications, in-app mail outbox, audit logs, analytics, and an offline AI planner

## Tech stack

- **Backend:** Python 3, Flask 3, SQLAlchemy 2, Flask-SQLAlchemy
- **Database:** SQL Server (local), PostgreSQL/Supabase, or SQLite
- **Frontend:** React 18, React Router, Vite 6, Lucide icons, custom CSS

## Repository layout

```text
.
|-- backend/
|   |-- app.py              Flask entry point and SPA host
|   |-- config.py           Environment-based configuration
|   |-- models.py           SQLAlchemy models
|   |-- blueprints/         API route modules
|   |-- migrations/         Ordered, non-destructive schema migrations
|   `-- utils/              Shared helpers (mail, money, serializers, etc.)
|-- frontend/
|   |-- src/                React pages, components, styles, API client
|   |-- dist/               Generated Vite build (served by Flask)
|   |-- index.html          Vite entry document
|   |-- vite.config.js      Dev server and API proxy
|   `-- package.json        Frontend dependencies and scripts
`-- README.md
```

## Quickstart

Requirements: Python 3.10+ and Node 20+.

```powershell
cd frontend
npm install
npm run build

cd ..\backend
python -m pip install -r requirements.txt
python app.py
```

Open http://localhost:5000. Flask serves `frontend/dist` and falls back to
`index.html` for client routes such as `/app/events`.

For frontend development, run the API and Vite dev server together:

```powershell
# Terminal 1
cd backend
python app.py

# Terminal 2
cd frontend
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` requests to the Flask server on
port 5000.

With no database configured, the application uses a local SQLite file and seeds
demo data automatically. For local SQL Server, run `backend/database.sql` once
in SSMS or with `sqlcmd`, then set `LOCAL_DB_ENABLED=1` in `backend/.env`. To use
PostgreSQL, set either `DATABASE_URL` or the individual `DB_*` values.

If the configured database is unreachable, the app falls back to SQLite when
`SQLITE_FALLBACK=1`. Set `SQLITE_FALLBACK=0` to fail instead.

## Demo accounts

| Email | Password | Role |
| --- | --- | --- |
| `admin@baymark.com` | `admin@123` | Admin |
| `user@baymark.com` | `user@123` | Normal user |

Login also accepts usernames (`admin`, `user`). These accounts are seeded for
local development only.

## Configuration

All settings are optional for local development. The main variables are:

| Variable | Purpose |
| --- | --- |
| `SECRET_KEY` | JWT signing key. If unset, a random per-process key is generated. Set a stable value for any real deployment. |
| `DATABASE_URL` | Full SQLAlchemy database URL. Overrides `LOCAL_DB_*` and `DB_*`. |
| `LOCAL_DB_ENABLED`, `LOCAL_DB_*` | Local SQL Server connection, using Windows auth by default. |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | PostgreSQL connection parts. |
| `SQLITE_FALLBACK` | Fall back to local SQLite when the configured database is unreachable. Default: `1`. |
| `WM_DEMO_AUTH` | When `1`, unauthenticated requests use the demo user. Set `0` to require a real JWT. |
| `SMTP_*` | Email delivery settings. Without SMTP, mail is stored in the in-app outbox. |
| `PAYMENT_PROVIDER` | Empty disables payments. Use `sandbox` or `paypal` to enable checkout. |
| `PAYPAL_*` | PayPal client, webhook, currency, and return URL settings. |

See [backend/README.md](backend/README.md) for the complete configuration table,
API map, migrations, roles, and integration details.

## Security notes

- Never commit `backend/.env` or any real credentials.
- Set a strong, stable `SECRET_KEY` before deploying.
- Keep `WM_DEMO_AUTH=0` outside local development.
- When SMTP is not configured, OTP fallback codes are returned by the API for
  development convenience. Configure SMTP before exposing the app.
- The frontend is a prototype; review authentication, authorization, CORS, and
  rate limiting before production use.

## Status

This is a working prototype, not a production-hardened deployment. The backend
API is the source of truth, and the React app consumes it through
`frontend/src/lib/api.js`. The analytics, reports, and operations modules are
still rolling out behind polished placeholder screens.
