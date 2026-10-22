"""In-memory rate limiting for login / verification / guest activation.

Simple sliding-window counter per (client-key, endpoint). Good enough for the
demo/hardened build; the blueprint calls for it.
"""
import time
from collections import defaultdict, deque

from flask import jsonify, request


_BUCKETS = defaultdict(lambda: defaultdict(deque))


def _client_key():
    ip = request.headers.get('X-Forwarded-For', '') or request.remote_addr or 'unknown'
    ip = ip.split(',')[0].strip()
    return ip


def rate_limit(limit=10, window_seconds=60, key_fn=None):
    def decorator(fn):
        def wrapper(*args, **kwargs):
            client = (key_fn() if key_fn else _client_key())
            route = request.endpoint or fn.__name__
            now = time.time()
            bucket = _BUCKETS[client][route]
            while bucket and bucket[0] < now - window_seconds:
                bucket.popleft()
            if len(bucket) >= limit:
                return jsonify({'message': 'Too many requests. Please try again later.'}), 429
            bucket.append(now)
            return fn(*args, **kwargs)
        wrapper.__name__ = fn.__name__
        return wrapper
    return decorator
