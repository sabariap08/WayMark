"""Decimal-safe money helpers.

WayMark stores money as **integer minor units** (paise/cents) plus an explicit
ISO currency code, so totals, rounding and variance maths are exact on both
Postgres and SQLite. Never do float arithmetic on money.
"""
import re

DEFAULT_CURRENCY = 'INR'
SYMBOLS = {'INR': '₹', 'USD': '$', 'EUR': '€', 'GBP': '£', 'AED': 'د.إ'}
CURRENCIES = ('INR', 'USD', 'EUR', 'GBP', 'AED', 'JPY', 'AUD', 'CAD', 'SGD')
_MINOR = {'JPY': 0}   # zero-decimal currencies


def clean_currency(value, default=DEFAULT_CURRENCY):
    code = str(value or default).strip().upper()
    if code not in CURRENCIES:
        return default
    return code


def parse_amount(value, currency=DEFAULT_CURRENCY):
    """Accepts '1200', '1,200.50', '₹1,200.50', 1200.5, 1200 → int minor units."""
    currency = clean_currency(currency)
    if value is None or value == '':
        return 0
    if isinstance(value, bool):
        return 0
    if isinstance(value, int):
        return value * _scale(currency)
    if isinstance(value, float):
        text = ('%.2f' % value)
    else:
        text = str(value)
    text = text.strip().replace(',', '')
    text = re.sub(r'[^\d.\-]', '', text)
    if not text or text in ('.', '-'):
        return 0
    negative = text.startswith('-')
    text = text.lstrip('-')
    scale = _scale(currency)
    if '.' in text:
        whole, frac = text.split('.', 1)
    else:
        whole, frac = text, ''
    whole = whole or '0'
    if scale == 0:
        frac = ''
    else:
        frac = (frac + '00')[:scale]
    units = int(whole or '0') * (10 ** scale) + int(frac or '0')
    return -units if negative else units


def _scale(currency):
    return _MINOR.get(clean_currency(currency), 2)


def to_major(minor, currency=DEFAULT_CURRENCY):
    """Integer minor units → float major units for JSON (2dp, except JPY)."""
    scale = _scale(currency)
    if scale == 0:
        return float(int(minor or 0))
    return round((int(minor or 0)) / (10 ** scale), scale)


def total_minor(rows, attr='amount_minor'):
    """Exact sum of a list of model rows or plain ints."""
    total = 0
    for row in rows:
        value = getattr(row, attr, row) if not isinstance(row, dict) else row.get(attr, 0)
        if isinstance(row, dict):
            value = row.get(attr, 0)
        try:
            total += int(value or 0)
        except (TypeError, ValueError):
            continue
    return total


def fmt(minor, currency=DEFAULT_CURRENCY):
    """Human formatted amount, e.g. ₹2,00,000.00 (INR grouping when available)."""
    currency = clean_currency(currency)
    scale = _scale(currency)
    units = int(minor or 0)
    symbol = SYMBOLS.get(currency, currency + ' ')
    if scale == 0:
        body = '{:,}'.format(abs(units))
        return ('-' if units < 0 else '') + symbol + body
    neg = units < 0
    units = abs(units)
    body = '{:,}'.format(units // 100) + '.' + str(units % 100).zfill(2)
    return ('-' if neg else '') + symbol + body


def variance_minor(planned, actual):
    """Positive = over budget."""
    return int(actual or 0) - int(planned or 0)


def utilisation_percent(planned, actual):
    planned = int(planned or 0)
    if planned <= 0:
        return 0
    return round((int(actual or 0) * 100.0) / planned, 1)


def money_json(minor, currency=DEFAULT_CURRENCY, key=None):
    """Serialize a money column for the API: {amount, currency, formatted}."""
    currency = clean_currency(currency)
    data = {
        'minor': int(minor or 0),
        'amount': to_major(minor, currency),
        'currency': currency,
        'formatted': fmt(minor, currency),
    }
    if key:
        data = {key: data}
    return data
