"""Deterministic schedule time helpers.

Sessions store `day` as YYYY-MM-DD and `start_time`/`end_time` as 24h HH:MM so
overlap maths never depends on locale parsing.
"""
import re
from datetime import datetime, timedelta

DAY_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
TIME_RE = re.compile(r'^([01]\d|2[0-3]):([0-5]\d)$')


def valid_day(value):
    if not DAY_RE.match(str(value or '').strip()):
        return False
    try:
        datetime.strptime(str(value).strip(), '%Y-%m-%d')
        return True
    except ValueError:
        return False


def valid_time(value):
    return bool(TIME_RE.match(str(value or '').strip()))


def norm_day(value):
    return str(value or '').strip()


def norm_time(value):
    return str(value or '').strip()


def to_minutes(value):
    """'09:30' → 570. Returns None when unparseable."""
    if not valid_time(value):
        return None
    h, m = str(value).split(':')
    return int(h) * 60 + int(m)


def day_window(day, start, end, setup=0, teardown=0):
    """Inclusive-with-setup window in minutes since epoch-day 0, or None."""
    if not valid_day(day):
        return None
    start_m, end_m = to_minutes(start), to_minutes(end)
    if start_m is None or end_m is None or end_m <= start_m:
        return None
    base = _day_index(day)
    return (base * 1440 + start_m - int(setup or 0),
            base * 1440 + end_m + int(teardown or 0))


def _day_index(day):
    return int((datetime.strptime(day, '%Y-%m-%d') - datetime(1970, 1, 1)).days)


def overlaps(a, b):
    """True when two (start, end) minute windows intersect."""
    if not a or not b:
        return False
    return a[0] < b[1] and b[0] < a[1]


def gap_minutes(a, b):
    """Distance in minutes between two windows (negative when overlapping)."""
    if not a or not b:
        return None
    if a[1] <= b[0]:
        return b[0] - a[1]
    if b[1] <= a[0]:
        return a[0] - b[1]
    return -(min(a[1], b[1]) - max(a[0], b[0]))


def parse_day_time(value):
    """Accepts 'YYYY-MM-DD HH:MM' or ISO datetime → datetime, else None."""
    text = str(value or '').strip().replace('Z', '')
    for fmt in ('%Y-%m-%d %H:%M', '%Y-%m-%dT%H:%M', '%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S'):
        try:
            return datetime.strptime(text[:len(fmt) + 1], fmt)
        except ValueError:
            continue
    return None


def window_label(window):
    """(start_minutes, end_minutes) → '10:00 - 11:30' using the 1440-day clock."""
    if not window:
        return ''
    def fmt(minute):
        minute = int(minute) % 1440
        return '%02d:%02d' % (minute // 60, minute % 60)
    return fmt(window[0]) + ' - ' + fmt(window[1])


def add_minutes(time_value, delta):
    """'09:30' + 45 → '10:15' (or '-01:30' when going below midnight)."""
    mins = to_minutes(time_value)
    if mins is None:
        return ''
    total = mins + int(delta)
    return '%02d:%02d' % ((total // 60) % 24, total % 60)


def to_datetime(day, time_value, default_hour=9):
    if valid_day(day) and valid_time(time_value):
        return datetime.strptime(day + ' ' + time_value, '%Y-%m-%d %H:%M')
    if valid_day(day):
        return datetime.strptime(day, '%Y-%m-%d') + timedelta(hours=default_hour)
    return None
