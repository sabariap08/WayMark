"""Tests for payments."""
import hashlib
import hmac

from conftest import get, post


def _published_event(client, admin_token, title):
    ev = post(client, '/api/events', {'title': title, 'category': 'Hackathon',
                                      'seats': 20, 'date': '2026-11-05'},
              token=admin_token).get_json()
    ev_id = ev.get('event') and ev['event'].get('id') or ev.get('id')
    res = post(client, '/api/events/' + ev_id + '/approve', {'status': 'Registration open'},
               token=admin_token)
    assert res.status_code == 200, res.get_json()
    return ev_id


def _set_fee(app, ev_id, fee):
    from models import Event
    from extensions import db
    with app.app_context():
        event = Event.query.get(ev_id)
        event.settings = {'fee': fee}
        db.session.commit()


def test_payments_config(client):
    res = get(client, '/api/payments/config')
    assert res.status_code == 200
    data = res.get_json()
    assert 'provider' in data
    assert 'enabled' in data


def test_free_event_no_payment(client, admin_token, user_token, app):
    app.config['PAYMENT_PROVIDER'] = 'sandbox'
    app.config['PAYMENT_SECRET'] = 'testsecret'
    try:
        ev_id = _published_event(client, admin_token, 'Free Event')
        _set_fee(app, ev_id, 0)
        reg = post(client, '/api/registrations', {'eventId': ev_id}, token=user_token).get_json()
        reg_id = reg['id']
        res = post(client, '/api/registrations/' + reg_id + '/checkout', token=user_token)
        assert res.status_code == 409
        assert 'free' in res.get_json()['message'].lower()

        from models import Payment
        with app.app_context():
            assert Payment.query.filter_by(registration_id=reg_id).count() == 0
    finally:
        app.config['PAYMENT_PROVIDER'] = ''
        app.config['PAYMENT_SECRET'] = ''


def test_disabled_provider_no_payment(client, admin_token, user_token, app):
    app.config['PAYMENT_PROVIDER'] = ''
    ev_id = _published_event(client, admin_token, 'No Provider Event')
    _set_fee(app, ev_id, 500)
    reg = post(client, '/api/registrations', {'eventId': ev_id}, token=user_token).get_json()
    res = post(client, '/api/registrations/' + reg['id'] + '/checkout', token=user_token)
    assert res.status_code == 409
    assert 'not configured' in res.get_json()['message'].lower()

    from models import Payment
    with app.app_context():
        assert Payment.query.filter_by(registration_id=reg['id']).count() == 0


def test_verify_requires_signature(client, app):
    app.config['PAYMENT_PROVIDER'] = 'sandbox'
    app.config['PAYMENT_SECRET'] = 'testsecret'
    try:
        res = post(client, '/api/payments/verify', {'registrationId': 'nonexist'})
        assert res.status_code == 400
        # A bare success claim is never trusted.
        res2 = post(client, '/api/payments/verify', {'success': True})
        assert res2.status_code == 400
    finally:
        app.config['PAYMENT_PROVIDER'] = ''
        app.config['PAYMENT_SECRET'] = ''


def test_checkout_verify_once_and_replay(client, admin_token, user_token, app):
    app.config['PAYMENT_PROVIDER'] = 'sandbox'
    app.config['PAYMENT_SECRET'] = 'testsecret'
    try:
        ev_id = _published_event(client, admin_token, 'Paid Event')
        _set_fee(app, ev_id, 500)
        reg = post(client, '/api/registrations', {'eventId': ev_id}, token=user_token).get_json()
        reg_id = reg['id']

        # Checkout creates a Pending payment and never a fake success. Card
        # fields in the request are ignored entirely.
        co = post(client, '/api/registrations/' + reg_id + '/checkout',
                  {'card': {'number': '4242424242424242', 'cvc': '123'}}, token=user_token)
        assert co.status_code == 200
        data = co.get_json()
        assert data['status'] == 'Pending'
        assert data['provider'] == 'sandbox'
        assert data['currency'] == 'INR'
        assert data['amount'] == 500.0
        payment_id = data['paymentId']
        provider_ref = data['clientReference']

        # Repeated checkout reuses the same Payment row.
        co2 = post(client, '/api/registrations/' + reg_id + '/checkout', token=user_token).get_json()
        assert co2['paymentId'] == payment_id

        from models import Payment
        with app.app_context():
            assert Payment.query.filter_by(registration_id=reg_id).count() == 1
            payment = Payment.query.get(payment_id)
            assert payment.status == 'Pending'
            assert not hasattr(payment, 'card_number')
            assert not any('card' in str(k).lower() or 'cvc' in str(k).lower()
                           for k in (payment.meta or {}))
            assert '4242424242424242' not in str(payment.meta or {})

        amount_minor = 50000
        payload = {'provider': 'sandbox', 'providerRef': provider_ref,
                   'registrationId': reg_id, 'amountMinor': amount_minor}

        # Missing signature -> 400 and the payment stays Pending.
        assert post(client, '/api/payments/verify', payload).status_code == 400
        with app.app_context():
            assert Payment.query.get(payment_id).status == 'Pending'

        # Wrong signature -> 400 and still not Paid.
        bad = client.post('/api/payments/verify', json=payload,
                          headers={'X-WayMark-Signature': 'deadbeef'})
        assert bad.status_code == 400
        with app.app_context():
            assert Payment.query.get(payment_id).status == 'Pending'

        # Correct HMAC over 'providerRef|registrationId|amountMinor'.
        signature = hmac.new(b'testsecret',
                             (provider_ref + '|' + reg_id + '|' + str(amount_minor)).encode('utf-8'),
                             hashlib.sha256).hexdigest()
        verified = client.post('/api/payments/verify', json=payload,
                               headers={'X-WayMark-Signature': signature})
        assert verified.status_code == 200
        assert verified.get_json()['id'] == payment_id
        assert verified.get_json()['status'] == 'Paid'

        # Replay returns the same payment and does not re-process anything.
        replay = client.post('/api/payments/verify', json=payload,
                             headers={'X-WayMark-Signature': signature})
        assert replay.status_code == 200
        assert replay.get_json()['id'] == payment_id
        assert replay.get_json()['status'] == 'Paid'

        from models import Registration
        with app.app_context():
            assert Payment.query.filter_by(registration_id=reg_id).count() == 1
            assert Registration.query.get(reg_id).status == 'Confirmed'

        # Owner or manager can read the payment.
        gpay = get(client, '/api/registrations/' + reg_id + '/payment', token=user_token)
        assert gpay.status_code == 200
        assert gpay.get_json()['id'] == payment_id
        assert get(client, '/api/registrations/' + reg_id + '/payment').status_code == 401
    finally:
        app.config['PAYMENT_PROVIDER'] = ''
        app.config['PAYMENT_SECRET'] = ''
