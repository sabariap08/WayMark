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
from utils import money, paypal
from utils.helpers import audit, refresh_event_counts, ticket_code
from utils.security import can_manage_event, current_user, require_auth
from utils.serializers import payment_json

payments_bp = Blueprint('payments', __name__)

PAID = 'Paid'
PAYPAL = 'paypal'
PAYPAL_PENDING = ('PENDING', 'APPROVED', 'PAYER_ACTION_REQUIRED', 'CREATED')


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


def _paypal_amount(event, fee_minor):
    """Return (charge_minor, charge_currency, fx_meta) for PayPal.

    PayPal settles in a limited currency set (no INR), so a non-PayPal event
    fee is converted with an explicitly configured rate. No rate -> None, and
    checkout refuses rather than silently charging a wrong amount.
    """
    source = money.clean_currency((event.currency if event else '') or 'INR')
    target = paypal.currency()
    fx = {'sourceAmountMinor': int(fee_minor), 'sourceCurrency': source, 'paypalCurrency': target}
    if source == target:
        fx['fxRate'] = 1.0
        return int(fee_minor), target, fx
    if source == 'INR' and target == 'USD':
        rate = float(current_app.config.get('PAYPAL_INR_PER_USD') or 83.0)
        if rate <= 0:
            return None, target, fx
        fx['fxRate'] = rate
        charge = int(round(int(fee_minor) / rate))
        return (charge if charge > 0 else 1), target, fx
    return None, target, fx


def _captures(result):
    captures = []
    for unit in (result or {}).get('purchase_units') or []:
        captures.extend(((unit.get('payments') or {}).get('captures') or []))
    return captures


def _captured_amount(result):
    """(minor_units, currency) from a capture/order payload, or (None, '')."""
    captures = _captures(result)
    if not captures:
        return None, ''
    amount = captures[0].get('amount') or {}
    code = str(amount.get('currency_code') or '').upper()
    value = amount.get('value')
    if value in (None, ''):
        return None, code
    try:
        return money.parse_amount(value, code or 'USD'), code
    except (TypeError, ValueError):
        return None, code


def _capture_id(result):
    captures = _captures(result)
    return str((captures[0].get('id') if captures else '') or '')


def _amount_matches(payment, minor, currency):
    if minor is None:
        return False
    if currency and currency != str(payment.currency or '').upper():
        return False
    return int(minor) == int(payment.amount_minor or 0)


def _webhook_order_id(event_type, resource):
    if event_type.startswith('PAYMENT.CAPTURE.'):
        related = (resource.get('supplementary_data') or {}).get('related_ids') or {}
        return str(related.get('order_id') or '')
    if event_type.startswith('CHECKOUT.ORDER.'):
        return str(resource.get('id') or '')
    return ''


@payments_bp.route('/payments/config', methods=['GET'])
def payments_config():
    provider = current_app.config.get('PAYMENT_PROVIDER') or ''
    is_paypal = provider == PAYPAL
    paypal_ready = is_paypal and paypal.configured()
    enabled = bool(provider) and (paypal_ready if is_paypal else True)
    return jsonify({
        'provider': provider,
        'mode': paypal.mode() if is_paypal else (current_app.config.get('PAYMENT_MODE') or ''),
        'enabled': enabled,
        'currency': paypal.currency() if is_paypal else 'INR',
        'clientId': paypal.client_id() if is_paypal else '',
        'sdkUrl': paypal.sdk_url() if is_paypal else '',
        'paypal': is_paypal,
        'note': ('' if enabled or not provider else 'PayPal credentials are not configured.'),
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
    if provider == PAYPAL and not paypal.configured():
        return jsonify({'message': 'PayPal is not configured on this server. '
                                   'No payment was created.'}), 409

    idempotency_key = str(reg.id) + ':' + str(reg.event_id)
    payment = Payment.query.filter_by(idempotency_key=idempotency_key).first()
    if not payment:
        meta = {'eventTitle': (event.title if event else reg.event_title) or '',
                'registrationTicket': reg.ticket_code or ''}
        charge_minor = fee_minor
        charge_currency = money.clean_currency((event.currency if event else '') or 'INR')
        if provider == PAYPAL:
            charge_minor, charge_currency, fx = _paypal_amount(event, fee_minor)
            if charge_minor is None:
                return jsonify({'message': 'No exchange rate is configured for '
                                           + fx['sourceCurrency'] + ' to ' + charge_currency + '.'}), 409
            meta.update(fx)
        payment = Payment(
            event_id=reg.event_id, registration_id=reg.id, user_id=reg.user_id or user.id,
            provider=provider, idempotency_key=idempotency_key,
            amount_minor=charge_minor, currency=charge_currency, status='Pending',
            meta=meta,
        )
        db.session.add(payment)
        db.session.commit()
        if provider == 'sandbox' and not payment.provider_ref:
            payment.provider_ref = 'sbx-' + payment.id
            db.session.commit()
        audit('Checkout started', user, target=(event.title if event else reg.event_title) or reg.id)

    if provider == PAYPAL:
        return _paypal_checkout_response(payment)

    return jsonify({
        'paymentId': payment.id,
        'provider': payment.provider,
        'amount': money.to_major(payment.amount_minor, payment.currency),
        'amountMinor': payment.amount_minor or 0,
        'currency': payment.currency,
        'status': payment.status,
        'clientReference': payment.provider_ref or payment.id,
    })


def _paypal_checkout_response(payment):
    """Create (or reuse) a PayPal order and hand the browser the order id +
    official SDK URL. The browser never receives the client secret."""
    if not paypal.configured():
        return jsonify({'message': 'PayPal is not configured on this server.'}), 409
    if payment.status == PAID:
        return jsonify({
            'paymentId': payment.id, 'provider': payment.provider,
            'amount': money.to_major(payment.amount_minor, payment.currency),
            'amountMinor': payment.amount_minor or 0, 'currency': payment.currency,
            'status': payment.status, 'clientReference': payment.provider_ref or payment.id,
            'orderId': payment.provider_ref or '', 'approvalUrl': '', 'alreadyPaid': True,
            'clientId': paypal.client_id(), 'sdkUrl': paypal.sdk_url(),
        })
    if payment.status in ('Refunded', 'Cancelled'):
        return jsonify({'message': 'This payment can no longer be checked out.'}), 409

    order = None
    if payment.provider_ref:
        try:
            existing = paypal.get_order(payment.provider_ref)
            order = {'id': payment.provider_ref,
                     'approvalUrl': paypal.approval_url(existing),
                     'status': str(existing.get('status') or '')}
            if str(existing.get('status') or '').upper() not in PAYPAL_PENDING:
                order = None
        except paypal.PayPalError:
            order = None
    if order is None:
        try:
            order = paypal.create_order(
                payment.amount_minor, payment.currency, reference=payment.id,
                return_url=str(current_app.config.get('PAYPAL_RETURN_URL') or ''),
                cancel_url=str(current_app.config.get('PAYPAL_CANCEL_URL') or ''),
            )
        except paypal.PayPalError as exc:
            return jsonify({'message': str(exc)}), 502
        payment.provider_ref = order['id']
        payment.meta = {**(payment.meta or {}), 'paypalStatus': order.get('status') or ''}
        db.session.commit()

    return jsonify({
        'paymentId': payment.id,
        'provider': payment.provider,
        'orderId': order.get('id') or payment.provider_ref,
        'approvalUrl': order.get('approvalUrl') or '',
        'clientId': paypal.client_id(),
        'sdkUrl': paypal.sdk_url(),
        'amount': money.to_major(payment.amount_minor, payment.currency),
        'amountMinor': payment.amount_minor or 0,
        'currency': payment.currency,
        'status': payment.status,
        'clientReference': payment.provider_ref or payment.id,
        'fx': payment.meta or {},
    })


@payments_bp.route('/payments/paypal/capture', methods=['POST'])
@require_auth
def paypal_capture():
    """Capture an approved PayPal order server-side, then confirm exactly once."""
    user = current_user()
    payload = request.get_json(silent=True) or {}
    order_id = str(payload.get('orderId') or '').strip()
    if not order_id:
        return jsonify({'message': 'orderId is required.'}), 400
    payment = Payment.query.filter_by(provider=PAYPAL, provider_ref=order_id).first()
    if not payment:
        return jsonify({'message': 'No payment matches this PayPal order.'}), 404
    event = Event.query.get(payment.event_id) if payment.event_id else None
    if payment.user_id != user.id and not can_manage_event(user, event):
        return jsonify({'message': 'You can only capture your own payment.'}), 403
    if payment.status == PAID:
        return jsonify(payment_json(payment))
    if payment.status in ('Refunded', 'Cancelled'):
        return jsonify({'message': 'This payment can no longer be captured.'}), 409

    try:
        result = paypal.capture_order(order_id)
    except paypal.PayPalError as exc:
        payment.status = 'Failed'
        payment.failure_reason = str(exc)[:300]
        db.session.commit()
        return jsonify({'message': str(exc)}), 502

    status = str(result.get('status') or '').upper()
    captured_minor, captured_currency = _captured_amount(result)
    if not _amount_matches(payment, captured_minor, captured_currency):
        payment.failure_reason = 'Captured amount did not match the expected amount.'
        db.session.commit()
        return jsonify({'message': 'Captured amount did not match the expected amount.'}), 409
    if status != 'COMPLETED':
        payment.meta = {**(payment.meta or {}), 'paypalStatus': status}
        db.session.commit()
        return jsonify(payment_json(payment))

    payment.meta = {**(payment.meta or {}), 'paypalStatus': status,
                    'captureId': _capture_id(result),
                    'verifiedAt': datetime.utcnow().isoformat() + 'Z'}
    _mark_paid(payment, order_id)
    return jsonify(payment_json(payment))


@payments_bp.route('/payments/paypal/webhook', methods=['POST'])
def paypal_webhook():
    """PayPal webhook: signature verified via PayPal's own verify-webhook API.

    Only PAYMENT.CAPTURE.COMPLETED marks a payment Paid; order approvals are
    recorded but never treated as money received. Replays are idempotent.
    """
    event = request.get_json(silent=True) or {}
    if not event:
        return jsonify({'message': 'Empty webhook body.'}), 400
    try:
        verified = paypal.verify_webhook(request.headers, event)
    except paypal.PayPalError as exc:
        return jsonify({'message': str(exc)}), 502
    if not verified:
        return jsonify({'message': 'Invalid PayPal webhook signature.'}), 400

    event_type = str(event.get('event_type') or '')
    resource = event.get('resource') or {}
    order_id = _webhook_order_id(event_type, resource)
    if not order_id:
        return jsonify({'ok': True, 'ignored': True, 'event': event_type})
    payment = Payment.query.filter_by(provider=PAYPAL, provider_ref=order_id).first()
    if not payment:
        return jsonify({'ok': True, 'ignored': True, 'reason': 'unknown order'})
    if payment.status == PAID:
        return jsonify({'ok': True, 'duplicate': True, 'paymentId': payment.id,
                        'status': payment.status})
    if event_type == 'PAYMENT.CAPTURE.COMPLETED':
        amount = resource.get('amount') or {}
        captured_currency = str(amount.get('currency_code') or '').upper()
        captured_minor = money.parse_amount(amount.get('value'), captured_currency or payment.currency)
        if not _amount_matches(payment, captured_minor, captured_currency):
            return jsonify({'ok': False, 'message': 'Captured amount did not match.'}), 409
        payment.meta = {**(payment.meta or {}), 'paypalStatus': 'COMPLETED',
                        'captureId': str(resource.get('id') or ''),
                        'webhookEvent': event_type[:80],
                        'verifiedAt': datetime.utcnow().isoformat() + 'Z'}
        _mark_paid(payment, order_id)
        return jsonify({'ok': True, 'duplicate': False, 'paymentId': payment.id,
                        'status': payment.status})

    payment.meta = {**(payment.meta or {}), 'paypalStatus': str(resource.get('status') or ''),
                    'webhookEvent': event_type[:80]}
    db.session.commit()
    return jsonify({'ok': True, 'paymentId': payment.id, 'status': payment.status})


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
