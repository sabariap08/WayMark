"""Webhook emission: signed, retried, idempotent deliveries to customer URLs.

Emission is fire-and-forget from the caller's point of view - a broken webhook
must never block or fail a core event operation. Delivery is attempted once
inline (fast path for tests/local) and failures stay queued for retry via
`POST /api/webhooks/deliveries/<id>/retry`.
"""
import hashlib
import hmac
import json
import urllib.error
import urllib.request
from datetime import datetime

from extensions import db
from models import Webhook, WebhookDelivery

WEBHOOK_TIMEOUT_SECONDS = 5


def signature(secret, body_bytes):
    return hmac.new((secret or '').encode('utf-8'), body_bytes, hashlib.sha256).hexdigest()


def _matches(hook, event_type):
    patterns = hook.events or []
    if not patterns:
        return True
    for pattern in patterns:
        pattern = str(pattern)
        if pattern == event_type or pattern == '*':
            return True
        if pattern.endswith('.*') and event_type.startswith(pattern[:-1]):
            return True
    return False


def emit(event_type, payload, event_id=None, idempotency_key=None):
    """Queue (and try to deliver) one webhook event. Never raises."""
    created = []
    try:
        hooks = Webhook.query.filter_by(active=True).all()
        for hook in hooks:
            if event_id and hook.event_id and hook.event_id != event_id:
                continue
            if not _matches(hook, event_type):
                continue
            key = idempotency_key or (event_type + ':' + str(event_id or '') + ':'
                                      + hashlib.sha1(json.dumps(payload, sort_keys=True,
                                                               default=str)
                                                    .encode('utf-8')).hexdigest()[:24])
            existing = WebhookDelivery.query.filter_by(webhook_id=hook.id,
                                                       idempotency_key=key).first()
            if existing:
                continue  # retry-safe: the same logical event is never queued twice
            delivery = WebhookDelivery(
                webhook_id=hook.id, event_type=event_type, payload=dict(payload or {}),
                idempotency_key=key, status='Pending')
            db.session.add(delivery)
            db.session.commit()
            created.append(delivery)
            deliver(delivery.id)
    except Exception:
        db.session.rollback()
    return created


def deliver(delivery_id, force=False):
    """Attempt one delivery. Returns the WebhookDelivery (or None). Never raises."""
    try:
        delivery = WebhookDelivery.query.get(delivery_id)
        if not delivery:
            return None
        if delivery.status == 'Delivered' and not force:
            return delivery
        hook = Webhook.query.get(delivery.webhook_id)
        if not hook:
            delivery.status = 'Failed'
            delivery.error = 'Webhook was deleted.'
            db.session.commit()
            return delivery
        if not hook.active and not force:
            delivery.status = 'Skipped'
            delivery.error = 'Webhook is inactive.'
            db.session.commit()
            return delivery

        body = json.dumps({'id': delivery.id, 'event': delivery.event_type,
                           'createdAt': datetime.utcnow().isoformat() + 'Z',
                           'data': delivery.payload or {}},
                          sort_keys=True, default=str).encode('utf-8')
        sig = signature(hook.secret, body)
        request = urllib.request.Request(
            hook.url, data=body, method='POST',
            headers={'Content-Type': 'application/json',
                     'User-Agent': 'WayMark-Webhooks/1.0',
                     'X-WayMark-Event': delivery.event_type,
                     'X-WayMark-Signature': 'sha256=' + sig})
        delivery.attempts = (delivery.attempts or 0) + 1
        try:
            with urllib.request.urlopen(request, timeout=WEBHOOK_TIMEOUT_SECONDS) as response:
                delivery.response_code = response.status
                delivery.status = 'Delivered' if 200 <= response.status < 300 else 'Failed'
                if delivery.status == 'Failed':
                    delivery.error = 'Endpoint returned ' + str(response.status)
        except urllib.error.HTTPError as exc:
            delivery.response_code = exc.code
            delivery.status = 'Failed'
            delivery.error = 'HTTP ' + str(exc.code)
        except Exception as exc:  # DNS, refused, timeout
            delivery.status = 'Failed'
            delivery.error = str(exc)[:300]
        if delivery.status == 'Delivered':
            delivery.delivered_at = datetime.utcnow()
        db.session.commit()
    except Exception:
        db.session.rollback()
    return delivery


def deliver_pending(limit=20):
    """Batch retry for the admin jobs screen / background worker."""
    rows = WebhookDelivery.query.filter(WebhookDelivery.status.in_(['Pending', 'Failed'])) \
        .order_by(WebhookDelivery.created_at.asc()).limit(limit).all()
    return [deliver(row.id) for row in rows]
