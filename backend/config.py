"""WayMark backend configuration.

Values are read from environment variables (optionally a .env file next to
this file). Every setting has a working default so `python app.py` starts
with no extra setup.
"""
import os
from urllib.parse import quote_plus

from dotenv import load_dotenv

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BACKEND_DIR, '.env'))


def _env(name, default=''):
    return os.getenv(name, default)


class Config:
    SECRET_KEY = _env('SECRET_KEY', 'waymark-dev-secret-change-me-please-32b')
    JWT_EXP_HOURS = int(_env('JWT_EXP_HOURS', '72'))

    SUPABASE_URL = _env('SUPABASE_URL', 'https://vzywehdyzzdiwbmtpwry.supabase.co')
    SUPABASE_KEY = _env('SUPABASE_KEY', 'sb_publishable_CF7Te9f7_bYke3SujOs-Dg_ZicAg2Pn')

    DB_HOST = _env('DB_HOST', 'db.vzywehdyzzdiwbmtpwry.supabase.co')
    DB_PORT = _env('DB_PORT', '5432')
    DB_NAME = _env('DB_NAME', 'postgres')
    DB_USER = _env('DB_USER', 'postgres')
    DB_PASSWORD = _env('DB_PASSWORD', 'WayMark@_2026')

    _override_url = _env('DATABASE_URL')
    DATABASE_URL = _override_url or (
        'postgresql+psycopg2://' + DB_USER + ':' + quote_plus(DB_PASSWORD)
        + '@' + DB_HOST + ':' + DB_PORT + '/' + DB_NAME
        + '?sslmode=require'
    )

    SQLITE_FALLBACK = _env('SQLITE_FALLBACK', '1') == '1'
    SQLITE_PATH = _env('SQLITE_PATH', os.path.join(BACKEND_DIR, 'waymark-local.db'))

    OTP_LENGTH = int(_env('OTP_LENGTH', '6'))
    OTP_EXP_MINUTES = int(_env('OTP_EXP_MINUTES', '15'))

    SMTP_HOST = _env('SMTP_HOST')
    SMTP_PORT = int(_env('SMTP_PORT', '587'))
    SMTP_USER = _env('SMTP_USER')
    SMTP_PASSWORD = _env('SMTP_PASSWORD')
    SMTP_FROM = _env('SMTP_FROM', 'WayMark <no-reply@waymark.dev>')

    DEMO_USER_EMAIL = _env('DEMO_USER_EMAIL', 'admin@waymark.dev')

    FRONTEND_DIR = os.path.abspath(os.path.join(BACKEND_DIR, '..', 'frontend'))