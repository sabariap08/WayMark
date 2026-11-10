"""PayPal REST integration (Orders v2 + webhook signature verification).

Standard library only, so WayMark needs no extra dependency. All calls happen
server-side: the browser never sees the client secret and a client-side
"success" flag is never trusted. Set:

    PAYMENT_PROVIDER=paypal
    PAYPAL_CLIENT_ID=...
    PAYPAL_CLIENT_SECRET=...
    PAYPAL_MODE=sandbox        # or live
    PAYPAL_WEBHOOK_ID=...      # required to accept webhooks
    PAYPAL_CURRENCY=USD
"""
import base64
import json
import urllib.error
import urllib.parse
import urllib.request

from flask import current_app

DEFAULT_CURRENCY = 'USD'

# PayPal settles only in these currencies (INR is intentionally absent).
SUPPORTED_CURRENCIES = (
    'AUD', 'BRL', 'CAD', 'CNY', 'CZK', 'DKK', 'EUR', 'HKD', 'HUF', 'ILS',
    'JPY', 'MYR', 'MXN', 'TWD', 'NZD', 'NOK', 'PHP', 'PLN', 'GBP', 'RUB',
    'SGD', 'SEK', 'CHF', 'THB', 'USD',
)


class PayPalError(Exception):
    """Raised when PayPal is not configured, unreachable, or rejects a call."""


def _cfg(name, default=''):
    return current_app.config.get(name, default) or default


def client_id():
    return str(_cfg('PAYPAL_CLIENT_ID'))


def client_secret():
    return str(_cfg('PAYPAL_CLIENT_SECRET'))


def mode():
    return str(_cfg('PAYPAL_MODE', 'sandbox')).lower()


def currency():
    code = str(_cfg('PAYPAL_CURRENCY', DEFAULT_CURRENCY)).upper()
    return code if code in SUPPORTED_CURRENCIES else DEFAULT_CURRENCY


def webhook_id():
    return str(_cfg('PAYPAL_WEBHOOK_ID'))


def configured():
    return bool(client_id() and client_secret())


def base_url():
    return 'https://api-m.paypal.com' if mode() == 'live' else 'https://api-m.sandbox.paypal.com'


def sdk_url():
    """The official PayPal JS SDK URL for the configured client + currency."""
    cid = client_id()
    if not cid:
        return ''
    query = urllib.parse.urlencode({
        'client-id': cid,
        'currency': currency(),
        'intent': 'capture',
        'components': 'buttons',
    })
    return 'https://www.paypal.com/sdk/js?' + query


def _parse(raw):
    if not raw or not str(raw).strip():
        return {}
    try:
        return json.loads(raw)
    except ValueError:
        return {'raw': str(raw)[:500]}


def _http(method, path, body=None, headers=None, form=False, timeout=25):
    url = base_url() + path
    data = None
    hdrs = {'Accept': 'application/json'}
    if body is not None:
        if form:
            data = urllib.parse.urlencode(body).encode('utf-8')
            hdrs['Content-Type'] = 'application/x-www-form-urlencoded'
        else:
            data = json.dumps(body).encode('utf-8')
            hdrs['Content-Type'] = 'application/json'
    if headers:
        hdrs.update(headers)
    request = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, _parse(response.read().decode('utf-8'))
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode('utf-8') if exc.fp else ''
        return exc.code, _parse(raw)
    except urllib.error.URLError as exc:
        raise PayPalError('PayPal is unreachable: ' + str(getattr(exc, 'reason', exc)))


def access_token():
    if not configured():
        raise PayPalError('PayPal credentials are not configured.')
    basic = base64.b64encode((client_id() + ':' + client_secret()).encode('utf-8')).decode('ascii')
    status, data = _http(
        'POST', '/v1/oauth2/token',
        body={'grant_type': 'client_credentials'},
        headers={'Authorization': 'Basic ' + basic},
        form=True,
    )
    token = str((data or {}).get('access_token') or '')
    if status >= 400 or not token:
        raise PayPalError('PayPal authentication failed: ' + _error_message(data, status))
    return token


def _authorized(method, path, body=None):
    token = access_token()
    return _http(method, path, body=body, headers={'Authorization': 'Bearer ' + token})


def _value(amount_minor):
    return '{:.2f}'.format(int(amount_minor or 0) / 100.0)


def approval_url(order):
    for link in (order or {}).get('links') or []:
        if link.get('rel') in ('approve', 'payer-action'):
            return link.get('href') or ''
    return ''


def create_order(amount_minor, currency_code, reference, return_url='', cancel_url=''):
    payload = {
        'intent': 'CAPTURE',
        'purchase_units': [{
            'reference_id': str(reference)[:60],
            'custom_id': str(reference)[:127],
            'description': 'WayMark event registration',
            'amount': {'currency_code': currency_code, 'value': _value(amount_minor)},
        }],
    }
    if return_url or cancel_url:
        payload['application_context'] = {
            'brand_name': 'WayMark',
            'user_action': 'PAY_NOW',
            'return_url': return_url or 'https://example.com/paypal/return',
            'cancel_url': cancel_url or 'https://example.com/paypal/cancel',
        }
    status, data = _authorized('POST', '/v2/checkout/orders', payload)
    if status >= 400 or not (data or {}).get('id'):
        raise PayPalError(_error_message(data, status))
    return {
        'id': data['id'],
        'status': data.get('status') or '',
        'approvalUrl': approval_url(data),
        'raw': data,
    }


def get_order(order_id):
    status, data = _authorized('GET', '/v2/checkout/orders/' + urllib.parse.quote(str(order_id)))
    if status >= 400:
        raise PayPalError(_error_message(data, status))
    return data


def capture_order(order_id):
    status, data = _authorized(
        'POST', '/v2/checkout/orders/' + urllib.parse.quote(str(order_id)) + '/capture', {})
    if status >= 400:
        raise PayPalError(_error_message(data, status))
    return data


def verify_webhook(headers, event):
    """Return True only when PayPal confirms the signature for our webhook id.

    `headers` is any mapping with PayPal's transmission headers (Flask's
    request.headers is case-insensitive, which is what we rely on).
    """
    if not webhook_id():
        raise PayPalError('PAYPAL_WEBHOOK_ID is not configured.')

    def _h(name):
        return str(headers.get(name) or headers.get('Paypal-' + name) or '')

    payload = {
        'transmission_id': _h('Paypal-Transmission-Id'),
        'transmission_time': _h('Paypal-Transmission-Time'),
        'cert_url': _h('Paypal-Cert-Url'),
        'auth_algo': _h('Paypal-Auth-Algo'),
        'transmission_sig': _h('Paypal-Transmission-Sig'),
        'webhook_id': webhook_id(),
        'webhook_event': event or {},
    }
    required = ('transmission_id', 'transmission_time', 'cert_url', 'auth_algo', 'transmission_sig')
    if not all(payload[key] for key in required):
        return False
    status, data = _authorized('POST', '/v1/notifications/verify-webhook-signature', payload)
    return status < 400 and str((data or {}).get('verification_status') or '').upper() == 'SUCCESS'


def _error_message(data, status):
    data = data or {}
    message = data.get('message') or data.get('error_description') or data.get('error') or ''
    details = data.get('details') or []
    if isinstance(details, list) and details and isinstance(details[0], dict):
        message = message or details[0].get('description') or details[0].get('issue') or ''
    return 'PayPal error (' + str(status) + '): ' + (str(message)[:300] or 'request failed')
