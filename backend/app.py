"""WayMark backend entry point.

Run:  python app.py
Then open http://127.0.0.1:5000

On start the app:
  1. connects to the Supabase Postgres instance (falls back to SQLite if
     unreachable and SQLITE_FALLBACK=1),
  2. creates all tables,
  3. seeds demo data on first run,
  4. serves the REST API under /api and the static frontend from ../frontend.
"""
import os
import sys

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from config import Config
from extensions import db
from utils.mailer import email_configured


def resolve_database_uri(cfg):
    uri = cfg.DATABASE_URL
    if uri.startswith('sqlite'):
        return uri, 'SQLite: ' + uri
    url = make_url(uri)
    label = url.drivername + ' @ ' + str(url.host or '') + '/' + str(url.database or '')
    if uri.startswith('mssql'):
        connect_args = {'timeout': 10}
    else:
        connect_args = {'connect_timeout': 10}
    try:
        engine = create_engine(uri, connect_args=connect_args)
        with engine.connect() as conn:
            conn.execute(text('SELECT 1'))
        engine.dispose()
        return uri, label
    except Exception as exc:
        print('!! Could not reach configured database: ' + str(exc)[:280])
        if cfg.SQLITE_FALLBACK:
            fallback = 'sqlite:///' + cfg.SQLITE_PATH
            print('!! Falling back to local SQLite so the app still runs:')
            print('   ' + fallback)
            print('   (set SQLITE_FALLBACK=0 in .env to fail hard instead)')
            return fallback, 'SQLite fallback: ' + cfg.SQLITE_PATH
        raise


# Modules that are developed independently of the core. They are loaded
# defensively so a module still being built never prevents the rest of WayMark
# from starting; app.extensions['wm_missing_blueprints'] reports anything absent.
OPTIONAL_BLUEPRINTS = (
    ('scheduling', 'scheduling_bp'),
    ('event_types', 'event_types_bp'),
    ('operations', 'operations_bp'),
    ('tasks', 'tasks_bp'),
    ('finance', 'finance_bp'),
    ('plans', 'plans_bp'),
    ('achievements', 'achievements_bp'),
    ('analytics', 'analytics_bp'),
    ('integrations', 'integrations_bp'),
    ('organizations', 'organizations_bp'),
    ('payments', 'payments_bp'),
    ('offline', 'offline_bp'),
    ('verification', 'verification_bp'),
    ('guests', 'guests_bp'),
)


def register_blueprints(app):
    import importlib

    from blueprints.auth import auth_bp
    from blueprints.meta import meta_bp
    from blueprints.users import users_bp
    from blueprints.events import events_bp
    from blueprints.registrations import registrations_bp
    from blueprints.attendance import attendance_bp
    from blueprints.jury import jury_bp
    from blueprints.rubrics import rubrics_bp
    from blueprints.submissions import submissions_bp
    from blueprints.scores import scores_bp
    from blueprints.feedback import feedback_bp
    from blueprints.certificates import certificates_bp
    from blueprints.notifications import notifications_bp
    from blueprints.audit import audit_bp
    from blueprints.dashboard import dashboard_bp
    from blueprints.leaderboard import leaderboard_bp
    from blueprints.reports import reports_bp
    from blueprints.admin import admin_bp
    from blueprints.messages import messages_bp
    from blueprints.ai import ai_bp
    from blueprints.guest import guest_bp
    from blueprints.hosting import hosting_bp
    from blueprints.volunteers import volunteers_bp

    for bp in (auth_bp, meta_bp, users_bp, events_bp, registrations_bp, attendance_bp,
               jury_bp, rubrics_bp, submissions_bp, scores_bp, feedback_bp, certificates_bp,
               notifications_bp, audit_bp, dashboard_bp, leaderboard_bp, reports_bp,
               admin_bp, messages_bp, ai_bp, guest_bp, hosting_bp, volunteers_bp):
        app.register_blueprint(bp, url_prefix='/api')

    missing = []
    for module_name, attribute in OPTIONAL_BLUEPRINTS:
        try:
            module = importlib.import_module('blueprints.' + module_name)
            app.register_blueprint(getattr(module, attribute), url_prefix='/api')
        except Exception as exc:  # module may still be under construction
            missing.append(module_name + ': ' + str(exc)[:120])
    app.extensions['wm_missing_blueprints'] = missing
    if missing:
        print('!! optional blueprints unavailable: ' + ', '.join(
            item.split(':')[0] for item in missing))


def create_app():
    cfg = Config
    frontend_root = os.path.abspath(cfg.FRONTEND_DIR)
    build_dir = os.path.join(frontend_root, 'dist')
    spa_root = build_dir if os.path.isfile(os.path.join(build_dir, 'index.html')) else None
    app = Flask(__name__, static_folder=None)
    app.extensions['wm_frontend_root'] = spa_root or frontend_root
    app.extensions['wm_frontend_built'] = bool(spa_root)
    db_uri, db_label = resolve_database_uri(cfg)
    engine_options = {'pool_pre_ping': True, 'pool_recycle': 280}
    if db_uri.startswith('postgresql'):
        engine_options['connect_args'] = {
            'connect_timeout': 10,
            'keepalives': 1,
            'keepalives_idle': 30,
            'keepalives_interval': 10,
            'keepalives_count': 3,
            'options': '-c statement_timeout=20000',
        }
    elif db_uri.startswith('mssql'):
        engine_options['connect_args'] = {'timeout': 10}
    app.config.update(
        SECRET_KEY=cfg.SECRET_KEY,
        JWT_EXP_HOURS=cfg.JWT_EXP_HOURS,
        SQLALCHEMY_DATABASE_URI=db_uri,
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SQLALCHEMY_ENGINE_OPTIONS=engine_options,
        DEMO_USER_EMAIL=cfg.DEMO_USER_EMAIL,
        DEMO_AUTH=cfg.DEMO_AUTH,
        AI_PROVIDER=cfg.AI_PROVIDER,
        AI_API_KEY=cfg.AI_API_KEY,
        AI_MODEL=cfg.AI_MODEL,
        PAYMENT_PROVIDER=cfg.PAYMENT_PROVIDER,
        PAYMENT_MODE=cfg.PAYMENT_MODE,
        PAYMENT_SECRET=cfg.PAYMENT_SECRET,
        OTP_LENGTH=cfg.OTP_LENGTH,
        OTP_EXP_MINUTES=cfg.OTP_EXP_MINUTES,
        SMTP_HOST=cfg.SMTP_HOST,
        SMTP_PORT=cfg.SMTP_PORT,
        SMTP_USER=cfg.SMTP_USER,
        SMTP_PASSWORD=cfg.SMTP_PASSWORD,
        SMTP_FROM=cfg.SMTP_FROM,
    )
    app.json.sort_keys = False
    CORS(app, resources={r'/api/*': {'origins': '*'}})
    db.init_app(app)
    app.extensions['wm_database_label'] = db_label

    register_blueprints(app)

    @app.route('/api/health')
    def health():
        return jsonify({
            'ok': True,
            'database': app.extensions.get('wm_database_label', ''),
            'emailConfigured': email_configured(),
            'otpFallback': '0' * int(app.config['OTP_LENGTH']),
        })

    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_frontend(path):
        """Serve the Vite build and fall back to index.html for client routes."""
        if path == 'api' or path.startswith('api/'):
            return jsonify({'message': 'Endpoint not found: /' + path}), 404

        if spa_root:
            safe_path = os.path.normpath(path).replace('\\', '/').lstrip('/')
            candidate = os.path.abspath(os.path.join(spa_root, safe_path)) if safe_path else spa_root
            inside_build = os.path.commonpath([spa_root, candidate]) == spa_root
            if safe_path and inside_build and os.path.isfile(candidate):
                return send_from_directory(spa_root, safe_path)
            index_path = os.path.join(spa_root, 'index.html')
            if os.path.isfile(index_path):
                return send_from_directory(spa_root, 'index.html')

        instructions = (
            '<!doctype html><html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1">'
            '<title>WayMark frontend not built</title></head>'
            '<body style="margin:0;display:grid;place-items:center;min-height:100vh;'
            'background:#f6f7fb;color:#121826;font-family:Segoe UI,sans-serif">'
            '<main style="max-width:560px;padding:32px;border:1px solid #e3e7ef;'
            'border-radius:20px;background:#fff;box-shadow:0 14px 38px rgba(17,24,39,.08)">'
            '<p style="margin:0 0 6px;color:#687086;font-size:12px;letter-spacing:.12em;'
            'text-transform:uppercase">WayMark frontend</p>'
            '<h1 style="margin:0;font-size:26px">The Vite build is missing.</h1>'
            '<p style="margin:10px 0 18px;color:#687086;line-height:1.6">'
            'Run the frontend build, then reload this page.</p>'
            '<pre style="margin:0;padding:14px;border-radius:12px;background:#0d1527;'
            'color:#dbe2f3;font-size:13px;overflow:auto">cd frontend\nnpm install\nnpm run build</pre>'
            '</main></body></html>'
        )
        return instructions, 503, {'Content-Type': 'text/html; charset=utf-8'}

    @app.errorhandler(404)
    def not_found(error):
        if request.path.startswith('/api/'):
            return jsonify({'message': 'Endpoint not found: ' + request.path}), 404
        return error

    @app.errorhandler(500)
    def server_error(error):
        if request.path.startswith('/api/'):
            return jsonify({'message': 'Internal server error.'}), 500
        return error

    with app.app_context():
        from seed import seed_all, ensure_accounts, ensure_event_types
        db.create_all()
        try:
            from migrations import run_migrations
            applied = run_migrations()
            app.extensions['wm_migrations'] = applied
        except Exception as exc:  # never block boot on a migration bookkeeping failure
            app.extensions['wm_migrations'] = ['error: ' + str(exc)[:200]]
            print('!! migration run failed: ' + str(exc)[:280])
        seeded = seed_all()
        ensure_accounts()
        ensure_event_types()
        app.extensions['wm_seeded'] = seeded
        try:
            from utils.scheduler import start_scheduler
            start_scheduler(app, interval_seconds=60)
        except Exception as exc:
            app.extensions['wm_scheduler'] = 'error: ' + str(exc)[:160]

    return app


def main():
    app = create_app()
    port = int(os.getenv('PORT', '5000'))
    frontend = Config.FRONTEND_DIR
    with app.app_context():
        email_ready = email_configured()
    print('')
    print('  WayMark backend is starting')
    print('  ------------------------------------------------')
    print('  Database : ' + app.extensions['wm_database_label'])
    print('  Seed     : ' + ('demo data inserted' if app.extensions['wm_seeded'] else 'existing data kept'))
    print('  Email    : ' + ('SMTP configured' if email_ready
                             else 'not configured - mail goes to the in-app outbox, OTP falls back to '
                                  + '0' * int(app.config['OTP_LENGTH'])))
    print('  Frontend : ' + frontend)
    print('  Open     : http://127.0.0.1:' + str(port) + '/')
    print('  API      : http://127.0.0.1:' + str(port) + '/api/health')
    print('  ------------------------------------------------')
    print('  Two roles: Admin + Normal User')
    print('  Demo logins')
    print('    admin            / admin@123   (Admin)')
    print('    user@baymark.com / user@123    (Normal User)')
    print('  ------------------------------------------------')
    print('')
    app.run(host='0.0.0.0', port=port, debug=False)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)