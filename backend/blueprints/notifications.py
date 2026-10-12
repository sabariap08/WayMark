"""Notifications for the signed-in user."""
from flask import Blueprint, jsonify, request

from extensions import db
from models import Notification
from utils.security import current_user
from utils.serializers import notification_json

notifications_bp = Blueprint('notifications', __name__)


@notifications_bp.route('/notifications', methods=['GET'])
def list_notifications():
    user = current_user()
    query = Notification.query
    if user:
        query = query.filter_by(user_id=user.id)
    if request.args.get('unread'):
        query = query.filter_by(read=False)
    rows = query.order_by(Notification.created_at.desc()).limit(50).all()
    return jsonify([notification_json(n) for n in rows])


@notifications_bp.route('/notifications/<notification_id>/read', methods=['POST'])
def mark_read(notification_id):
    row = Notification.query.get(notification_id)
    if not row:
        return jsonify({'message': 'Notification not found.'}), 404
    row.read = True
    db.session.commit()
    return jsonify(notification_json(row))


@notifications_bp.route('/notifications/read-all', methods=['POST'])
def mark_all_read():
    user = current_user()
    if user:
        Notification.query.filter_by(user_id=user.id, read=False).update({'read': True})
        db.session.commit()
    return jsonify({'ok': True})