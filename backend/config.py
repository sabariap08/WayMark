"""WayMark backend configuration.

Values are read from environment variables (optionally a .env file next to
this file). Secrets MUST be supplied via the environment or .env; they are
never committed to the repository. With no database settings the app uses a
local SQLite file so `python app.py` still starts for development.
"""
import os
import secrets
from urllib.parse import quote_plus

from dotenv import load_dotenv

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BACKEND_DIR, '.env'))


def _env(name, default=''):
    return os.getenv(name, default)


class Config:
    # Set SECRET_KEY in every real deployment. If it is absent we generate a
    # random per-process key so tokens are never signed with a public default;
    # sessions then reset when the process restarts.
    SECRET_KEY = _env('SECRET_KEY') or secrets.token_hex(32)
    JWT_EXP_HOURS = int(_env('JWT_EXP_HOURS', '72'))

    SUPABASE_URL = _env('SUPABASE_URL')
    SUPABASE_KEY = _env('SUPABASE_KEY')

    LOCAL_DB_ENABLED = _env('LOCAL_DB_ENABLED', '0') == '1'
    LOCAL_DB_SERVER = _env('LOCAL_DB_SERVER', 'localhost')
    LOCAL_DB_NAME = _env('LOCAL_DB_NAME', 'WayMarkLocal')
    LOCAL_DB_DRIVER = _env('LOCAL_DB_DRIVER', 'ODBC Driver 18 for SQL Server')
    LOCAL_DB_TRUSTED_CONNECTION = _env('LOCAL_DB_TRUSTED_CONNECTION', 'yes') == 'yes'
    LOCAL_DB_TRUST_SERVER_CERTIFICATE = _env('LOCAL_DB_TRUST_SERVER_CERTIFICATE', 'yes') == 'yes'
    LOCAL_DB_USER = _env('LOCAL_DB_USER')
    LOCAL_DB_PASSWORD = _env('LOCAL_DB_PASSWORD')

    DB_HOST = _env('DB_HOST')
    DB_PORT = _env('DB_PORT', '5432')
    DB_NAME = _env('DB_NAME', 'postgres')
    DB_USER = _env('DB_USER', 'postgres')
    DB_PASSWORD = _env('DB_PASSWORD')

    SQLITE_FALLBACK = _env('SQLITE_FALLBACK', '1') == '1'
    SQLITE_PATH = _env('SQLITE_PATH', os.path.join(BACKEND_DIR, 'waymark-local.db'))

    _override_url = _env('DATABASE_URL')
    if _override_url:
        DATABASE_URL = _override_url
    elif LOCAL_DB_ENABLED:
        _local_params = ['driver=' + quote_plus(LOCAL_DB_DRIVER)]
        if LOCAL_DB_TRUSTED_CONNECTION:
            _local_auth = '@'
            _local_params.append('Trusted_Connection=yes')
        else:
            _local_auth = quote_plus(LOCAL_DB_USER) + ':' + quote_plus(LOCAL_DB_PASSWORD) + '@'
        if LOCAL_DB_TRUST_SERVER_CERTIFICATE:
            _local_params.append('TrustServerCertificate=yes')
        DATABASE_URL = (
            'mssql+pyodbc://' + _local_auth + LOCAL_DB_SERVER + '/' + LOCAL_DB_NAME
            + '?' + '&'.join(_local_params)
        )
    elif DB_HOST:
        DATABASE_URL = (
            'postgresql+psycopg2://' + DB_USER + ':' + quote_plus(DB_PASSWORD)
            + '@' + DB_HOST + ':' + DB_PORT + '/' + DB_NAME
            + '?sslmode=require'
        )
    else:
        DATABASE_URL = 'sqlite:///' + SQLITE_PATH

    OTP_LENGTH = int(_env('OTP_LENGTH', '6'))
    OTP_EXP_MINUTES = int(_env('OTP_EXP_MINUTES', '15'))

    SMTP_HOST = _env('SMTP_HOST')
    SMTP_PORT = int(_env('SMTP_PORT', '587'))
    SMTP_USER = _env('SMTP_USER')
    SMTP_PASSWORD = _env('SMTP_PASSWORD')
    SMTP_FROM = _env('SMTP_FROM', 'WayMark <no-reply@baymark.com>')

    DEMO_USER_EMAIL = _env('DEMO_USER_EMAIL', 'user@baymark.com')
    # When 1 (default) a request with NO token at all is served as the demo user
    # so the static frontend can be browsed without logging in. Tests set this
    # to 0 so anonymous requests are genuinely 401.
    DEMO_AUTH = _env('WM_DEMO_AUTH', '1') == '1'

    # Optional AI provider. 'local' (default) uses the deterministic offline
    # generator, so WayMark never depends on a paid service.
    AI_PROVIDER = _env('AI_PROVIDER', 'local')
    AI_API_KEY = _env('AI_API_KEY', '')
    AI_MODEL = _env('AI_MODEL', '')

    # Optional payment provider. Empty = payments disabled, free events unaffected.
    # 'paypal' enables the real PayPal Orders v2 integration (see utils/paypal.py);
    # 'sandbox' enables the HMAC-signed offline sandbox flow used by tests.
    PAYMENT_PROVIDER = _env('PAYMENT_PROVIDER', '')
    PAYMENT_MODE = _env('PAYMENT_MODE', 'sandbox')
    PAYMENT_SECRET = _env('PAYMENT_SECRET', '')

    # PayPal REST app credentials (developer.paypal.com > Apps & Credentials).
    PAYPAL_CLIENT_ID = _env('PAYPAL_CLIENT_ID', '')
    PAYPAL_CLIENT_SECRET = _env('PAYPAL_CLIENT_SECRET', '')
    PAYPAL_MODE = _env('PAYPAL_MODE', 'sandbox')
    PAYPAL_WEBHOOK_ID = _env('PAYPAL_WEBHOOK_ID', '')
    PAYPAL_CURRENCY = _env('PAYPAL_CURRENCY', 'USD')
    # PayPal cannot settle in INR, so INR event fees are converted for checkout.
    PAYPAL_INR_PER_USD = float(_env('PAYPAL_INR_PER_USD', '83.0'))
    PAYPAL_RETURN_URL = _env('PAYPAL_RETURN_URL', '')
    PAYPAL_CANCEL_URL = _env('PAYPAL_CANCEL_URL', '')

    FRONTEND_DIR = os.path.abspath(os.path.join(BACKEND_DIR, '..', 'frontend'))