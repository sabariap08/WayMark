"""Versioned, non-destructive schema migrations.

`db.create_all()` still creates brand-new tables. Migrations exist for columns
that were added to tables which already have data. Every schema change in this
project therefore has a numbered entry here; nothing ever drops or resets a
table.

Usage (called from app.py):

    from migrations import run_migrations
    db.create_all()
    run_migrations()

Each step is (id, description, fn). `fn(connection)` runs inside a transaction
and is recorded in `wm_schema_migrations` so it never runs twice. Steps must be
idempotent themselves (they use column/existence checks) because a fresh
database may already have the column.
"""
from datetime import datetime

from sqlalchemy import inspect, text

MIGRATIONS = [
    # id, description, fn
    ('0001_user_notification_preferences',
     'wm_users.notify_prefs JSON consent map',
     lambda c: add_column(c, 'wm_users', 'notify_prefs', "JSON DEFAULT '{}'")),

    ('0002_event_universal_engine',
     'wm_events: event type, parent/sub-event, format, dates, org, config',
     lambda c: [add_column(c, 'wm_events', 'event_type', "VARCHAR(80) DEFAULT ''"),
                add_column(c, 'wm_events', 'parent_event_id', "VARCHAR(36) DEFAULT ''"),
                add_column(c, 'wm_events', 'format', "VARCHAR(20) DEFAULT 'Offline'"),
                add_column(c, 'wm_events', 'timezone', "VARCHAR(60) DEFAULT 'Asia/Kolkata'"),
                add_column(c, 'wm_events', 'start_date', "VARCHAR(20) DEFAULT ''"),
                add_column(c, 'wm_events', 'end_date', "VARCHAR(20) DEFAULT ''"),
                add_column(c, 'wm_events', 'participation', "VARCHAR(20) DEFAULT 'individual'"),
                add_column(c, 'wm_events', 'currency', "VARCHAR(3) DEFAULT 'INR'"),
                add_column(c, 'wm_events', 'org_id', "VARCHAR(36) DEFAULT ''"),
                add_column(c, 'wm_events', 'config', "JSON DEFAULT '{}'"),
                add_column(c, 'wm_events', 'settings', "JSON DEFAULT '{}'"),
                add_index(c, 'ix_wm_events_parent_event_id', 'wm_events', 'parent_event_id'),
                add_index(c, 'ix_wm_events_org_id', 'wm_events', 'org_id')]),

    ('0003_volunteer_coordination',
     'wm_volunteers: skills, availability, venue, hour cap',
     lambda c: [add_column(c, 'wm_volunteers', 'skills', "JSON DEFAULT '[]'"),
                add_column(c, 'wm_volunteers', 'availability', "JSON DEFAULT '[]'"),
                add_column(c, 'wm_volunteers', 'venue', "VARCHAR(200) DEFAULT ''"),
                add_column(c, 'wm_volunteers', 'max_hours', "INTEGER DEFAULT 0"),
                add_column(c, 'wm_volunteers', 'assigned_hours', "FLOAT DEFAULT 0"),
                add_column(c, 'wm_volunteers', 'completed_tasks', "INTEGER DEFAULT 0")]),

    ('0004_event_type_configuration',
     'wm_event_types: data-driven config, system flag',
     lambda c: [add_column(c, 'wm_event_types', 'is_system', "BOOLEAN DEFAULT FALSE"),
                add_column(c, 'wm_event_types', 'config', "JSON DEFAULT '{}'"),
                add_column(c, 'wm_event_types', 'updated_at', "TIMESTAMP")]),

    ('0005_registration_integrity',
     'wm_registrations: identity snapshot, answers, verification state',
     lambda c: [add_column(c, 'wm_registrations', 'identity_snapshot', "JSON DEFAULT '{}'"),
                add_column(c, 'wm_registrations', 'answers', "JSON DEFAULT '{}'"),
                add_column(c, 'wm_registrations', 'verification_state', "VARCHAR(20) DEFAULT 'pending'"),
                add_column(c, 'wm_registrations', 'verification_note', "TEXT DEFAULT ''"),
                add_column(c, 'wm_registrations', 'qr_revoked_at', "TIMESTAMP")]),

    ('0006_event_discovery_identity',
     'wm_events: public slug + visibility (public/unlisted)',
     lambda c: [add_column(c, 'wm_events', 'slug', "VARCHAR(160) DEFAULT NULL"),
                add_column(c, 'wm_events', 'visibility', "VARCHAR(20) DEFAULT 'public'"),
                add_index(c, 'ix_wm_events_visibility', 'wm_events', 'visibility'),
                add_index(c, 'ix_wm_events_slug', 'wm_events', 'slug', unique=True)]),
]


def add_column(conn, table, name, ddl):
    """ALTER TABLE ... ADD COLUMN, guarded so it is safe on every dialect."""
    if table not in _tables(conn):
        return
    if name in _columns(conn, table):
        return
    conn.execute(text('ALTER TABLE {0} ADD COLUMN {1} {2}'.format(table, name, ddl)))


def add_index(conn, name, table, column, unique=False):
    if table not in _tables(conn):
        return
    if column not in _columns(conn, table):
        return
    keyword = 'UNIQUE INDEX' if unique else 'INDEX'
    conn.execute(text('CREATE {0} IF NOT EXISTS {1} ON {2} ({3})'.format(
        keyword, name, table, column)))


def _tables(conn):
    return set(inspect(conn).get_table_names())


def _columns(conn, table):
    try:
        return {c['name'] for c in inspect(conn).get_columns(table)}
    except Exception:
        return set()


def applied_migrations(conn):
    rows = conn.execute(text('SELECT id FROM wm_schema_migrations')).fetchall()
    return {r[0] for r in rows}


def run_migrations(engine=None):
    """Apply every pending migration. Returns the list of applied ids."""
    from extensions import db
    engine = engine or db.engine
    applied = []
    with engine.begin() as conn:
        conn.execute(text(
            'CREATE TABLE IF NOT EXISTS wm_schema_migrations ('
            ' id VARCHAR(120) PRIMARY KEY,'
            ' description VARCHAR(255) DEFAULT \'\','
            ' applied_at TIMESTAMP)'))
        done = applied_migrations(conn)
        for mid, description, step in MIGRATIONS:
            if mid in done:
                continue
            step(conn)
            conn.execute(
                text('INSERT INTO wm_schema_migrations (id, description, applied_at) '
                     'VALUES (:mid, :description, :applied_at)'),
                {'mid': mid, 'description': description,
                 'applied_at': datetime.utcnow()})
            applied.append(mid)
    return applied


def migration_status():
    """For docs/diagnostics: every migration with whether it has run."""
    from extensions import db
    with db.engine.connect() as conn:
        done = applied_migrations(conn)
    return [{'id': mid, 'description': desc, 'applied': mid in done}
            for mid, desc, _ in MIGRATIONS]
