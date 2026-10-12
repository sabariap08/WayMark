"""Audit log listing."""
from flask import Blueprint, jsonify, request

from models import AuditLog
from utils.serializers import audit_json

audit_bp = Blueprint('audit', __name__)


@audit_bp.route('/audit-logs', methods=['GET'])
def list_audit_logs():
    query = AuditLog.query
    q = (request.args.get('q') or '').strip().lower()
    status = request.args.get('status')
    if status:
        query = query.filter_by(status=status)
    if q:
        query = query.filter(AuditLog.action.ilike('%' + q + '%'))
    rows = query.order_by(AuditLog.timestamp.desc()).limit(200).all()
    return jsonify([audit_json(a) for a in rows])