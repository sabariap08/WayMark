"""Payments (optional and configurable).

WayMark never touches card data: checkout only creates a Pending payment record
and a client reference; a provider callback must be signature-verified
server-side before a payment becomes Paid.
"""
import hashlib
import hmac
from datetime import datetime

from flask import Blueprint, current_app, jsonify, request

from extensions import db
from models import Event, Payment, Registration
from utils import money
from utils.helpers import audit, refresh_event_counts, ticket_code
from utils.security import can_manage_event, current_user, require_auth
from utils.serializers import payment_json

payments_bp = Blueprint('payments', __name__)

PAID = 'Paid'


def _event_fee_minor(event):
    """Read the event fee from settings/config (the Event model has no fee
    column) and return an exact integer minor-unit amount."""
    if not event:
        return 0
    fee = None
    if isinstance(event.settings, dict):
        fee = event.settings.get('fee')
    if isinstance(event.config, dict) and event.config.get('fee') is not None:
        fee = event.config.get('fee')
    if isinstance(fee, bool):
        return 0
    if isinstance(fee, (int, float)):
        # money.parse_amount treats plain numbers as major units but its int
        # branch scales by the currency's decimal places incorrectly, so
        # normalize to text first.
        fee = str(fee)
    return money.parse_amount(fee, event.currency or 'INR')


def _is_free_event(event):
    return _event_fee_minor(event) <= 0


def _canonical(provider_ref, registration_id, amount_minor):
    return (str(provider_ref) + '|' + str(registration_id) + '|' + str(amount_minor)).encode('utf-8')


def _payment_secret():
    return str(current_app.config.get('PAYMENT_SECRET') or '')


def _sign(provider_ref, registration_id, amount_minor):
    return hmac.new(_payment_secret().encode('utf-8'),
                    _canonical(provider_ref, registration_id, amount_minor),
                    hashlib.sha256).hexdigest()


def _provided_signature():
    raw = (request.headers.get('X-WayMark-Signature') or '').strip()
    if raw.lower().startswith('sha256='):
        raw = raw[7:].strip()
    return raw


def _confirm_registration(payment):
    """Confirm exactly once - the caller only invokes this when the payment
    transitions to Paid (a replay short-circuits before this)."""
    reg = Registration.query.get(payment.registration_id) if payment.registration_id else None
    if not reg:
        return None
    if reg.status not in ('Confirmed', 'Registered'):
        reg.status = 'Confirmed'
        if not reg.ticket_code:
            reg.ticket_code = ticket_code()
    db.session.commit()
    event = Event.query.get(payment.event_id or reg.event_id)
    if event:
        refresh_event_counts(event)
    return reg


def _mark_paid(payment, provider_ref):
    payment.status = PAID
    payment.provider_ref = provider_ref or payment.provider_ref
    payment.updated_at = datetime.utcnow()
    payment.meta = {**(payment.meta or {}), 'verifiedAt': datetime.utcnow().isoformat() + 'Z'}
    db.session.commit()
    _confirm_registration(payment)
    audit('Payment verified', None, target='Payment ' + payment.id + ' (' + payment.provider + ')')


@payments_bp.route('/payments/config', methods=['GET'])
def payments_config():
    provider = current_app.config.get('PAYMENT_PROVIDER') or ''
    mode = current_app.config.get('PAYMENT_MODE') or ''
    enabled = bool(provider)
    return jsonify({
        'provider': provider,
        'mode': mode,
        'enabled': enabled,
        'currency': 'INR',
        'note': ''
    })


@payments_bp.route('/registrations/<registration_id>/checkout', methods=['POST'])
@require_auth
def checkout(registration_id):
    user = current_user()
    reg = Registration.query.get(registration_id)
    if not reg:
        return jsonify({'message': 'Registration not found.'}), 404
    event = Event.query.get(reg.event_id) if reg.event_id else None
    if reg.user_id != user.id and not can_manage_event(user, event):
        return jsonify({'message': 'You can only pay for your own registration.'}), 403

    provider = str(current_app.config.get('PAYMENT_PROVIDER') or '').strip()
    if not provider:
        return jsonify({'message': 'Online payments are not configured on this platform. '
                                   'No payment was created.'}), 409
    fee_minor = _event_fee_minor(event)
    if fee_minor <= 0:
        return jsonify({'message': 'This event is free - no checkout or payment is needed.'}), 409

    idempotency_key = str(reg.id) + ':' + str(reg.event_id)
    payment = Payment.query.filter_by(idempotency_key=idempotency_key).first()
    if not payment:
        currency = money.clean_currency((event.currency if event else '') or 'INR')
        payment = Payment(
            event_id=reg.event_id, registration_id=reg.id, user_id=reg.user_id or user.id,
            provider=provider, idempotency_key=idempotency_key,
            amount_minor=fee_minor, currency=currency, status='Pending',
            meta={'eventTitle': (event.title if event else reg.event_title) or '',
                  'registrationTicket': reg.ticket_code or ''},
        )
        db.session.add(payment)
        db.session.commit()
        if provider == 'sandbox' and not payment.provider_ref:
            payment.provider_ref = 'sbx-' + payment.id
            db.session.commit()
        audit('Checkout started', user, target=(event.title if event else reg.event_title) or reg.id)

    return jsonify({
        'paymentId': payment.id,
        'provider': payment.provider,
        'amount': money.to_major(payment.amount_minor, payment.currency),
        'amountMinor': payment.amount_minor or 0,
        'currency': payment.currency,
        'status': payment.status,
        'clientReference': payment.provider_ref or payment.id,
    })


@payments_bp.route('/payments/verify', methods=['POST'])
def verify_payment():
    """Server-side verification only. A bare {"success": true} is never trusted."""
    payload = request.get_json(silent=True) or {}
    provider = str(payload.get('provider') or 'sandbox').strip()
    provider_ref = str(payload.get('providerRef') or '').strip()
    registration_id = str(payload.get('registrationId') or '').strip()
    amount_raw = payload.get('amountMinor')

    signature = _provided_signature()
    if not signature:
        return jsonify({'message': 'Missing X-WayMark-Signature header. '
                                   'Payments are verified server-side only.'}), 400
    if not provider_ref or not registration_id or amount_raw is None:
        return jsonify({'message': 'providerRef, registrationId and amountMinor are required.'}), 400
    try:
        amount_minor = int(amount_raw)
    except (TypeError, ValueError):
        return jsonify({'message': 'amountMinor must be an integer number of minor units.'}), 400

    expected = _sign(provider_ref, registration_id, amount_minor)
    if not hmac.compare_digest(expected, signature):
        return jsonify({'message': 'Invalid payment signature.'}), 400

    payment = Payment.query.filter_by(provider=provider, provider_ref=provider_ref).first()
    if not payment:
        return jsonify({'message': 'Payment not found for this provider reference.'}), 400
    if payment.registration_id != registration_id or int(payment.amount_minor or 0) != amount_minor:
        return jsonify({'message': 'Verified payload does not match this payment.'}), 400
    if payment.status == PAID:
        return jsonify(payment_json(payment))
    if payment.status in ('Refunded', 'Cancelled'):
        return jsonify({'message': 'This payment can no longer be confirmed.'}), 409

    _mark_paid(payment, provider_ref)
    return jsonify(payment_json(payment))


@payments_bp.route('/payments/<provider>/webhook', methods=['POST'])
def payment_webhook(provider):
    """Provider webhook: same signature check as /payments/verify, idempotent on
    providerRef. Only non-sensitive metadata is stored."""
    payload = request.get_json(silent=True) or {}
    provider = (provider or '').strip()
    provider_ref = str(payload.get('providerRef') or '').strip()
    registration_id = str(payload.get('registrationId') or '').strip()
    amount_raw = payload.get('amountMinor')

    signature = _provided_signature()
    if not signature:
        return jsonify({'message': 'Missing X-WayMark-Signature header.'}), 400
    if not provider_ref or not registration_id or amount_raw is None:
        return jsonify({'message': 'providerRef, registrationId and amountMinor are required.'}), 400
    try:
        amount_minor = int(amount_raw)
    except (TypeError, ValueError):
        return jsonify({'message': 'amountMinor must be an integer number of minor units.'}), 400

    expected = _sign(provider_ref, registration_id, amount_minor)
    if not hmac.compare_digest(expected, signature):
        return jsonify({'message': 'Invalid payment signature.'}), 400

    payment = Payment.query.filter_by(provider=provider, provider_ref=provider_ref).first()
    if not payment:
        return jsonify({'message': 'Payment not found for this provider reference.'}), 404
    if payment.registration_id != registration_id or int(payment.amount_minor or 0) != amount_minor:
        return jsonify({'message': 'Webhook payload does not match this payment.'}), 400
    if payment.status == PAID:
        return jsonify({'ok': True, 'duplicate': True, 'paymentId': payment.id,
                        'status': payment.status})

    _mark_paid(payment, provider_ref)
    payment.meta = {**(payment.meta or {}),
                    'webhookEvent': str(payload.get('event') or '')[:80]}
    db.session.commit()
    return jsonify({'ok': True, 'duplicate': False, 'paymentId': payment.id,
                    'status': payment.status})


@payments_bp.route('/registrations/<registration_id>/payment', methods=['GET'])
@require_auth
def registration_payment(registration_id):
    user = current_user()
    reg = Registration.query.get(registration_id)
    if not reg:
        return jsonify({'message': 'Registration not found.'}), 404
    event = Event.query.get(reg.event_id) if reg.event_id else None
    if reg.user_id != user.id and not can_manage_event(user, event):
        return jsonify({'message': 'You do not have permission to view this payment.'}), 403
    payment = Payment.query.filter_by(registration_id=reg.id) \
        .order_by(Payment.created_at.desc()).first()
    if not payment:
        return jsonify({'message': 'No payment has been recorded for this registration.'}), 404
    return jsonify(payment_json(payment))
