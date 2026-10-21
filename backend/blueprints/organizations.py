"""Organizations (multi-tenancy)."""
from flask import Blueprint, jsonify, request

from extensions import db
from models import Event, Organization, OrganizationMember, User
from utils.helpers import audit
from utils.security import can_manage_event, current_user, is_admin, require_auth
from utils.serializers import event_json, org_member_json, organization_json

organizations_bp = Blueprint('organizations', __name__)

VALID_ROLES = ('Owner', 'Manager', 'Member')
VALID_PERMS = ['events', 'budget', 'sponsors', 'reports', 'volunteers']


def _get_membership(org_id, user_id):
    if not user_id:
        return None
    return OrganizationMember.query.filter_by(org_id=org_id, user_id=user_id).first()


def _has_org_permission(membership, perms=None):
    if not membership:
        return False
    if membership.org_role in ('Owner', 'Manager'):
        return True
    if perms:
        mperms = membership.permissions or []
        for p in perms:
            if p in mperms:
                return True
        return False
    return True


def _can_manage_org(user, org_id):
    """Admin or an Owner/Manager of this specific organization."""
    if is_admin(user):
        return True
    mem = _get_membership(org_id, user.id if user else '')
    return bool(mem and mem.org_role in ('Owner', 'Manager'))


def _clean_permissions(value):
    if not isinstance(value, list):
        return []
    return [str(p) for p in value if str(p) in VALID_PERMS]


@organizations_bp.route('/organizations', methods=['GET'])
@require_auth
def list_organizations():
    user = current_user()
    if is_admin(user):
        orgs = Organization.query.all()
        result = []
        for o in orgs:
            d = organization_json(o)
            d['membersCount'] = OrganizationMember.query.filter_by(org_id=o.id).count()
            result.append(d)
        return jsonify(result)
    mems = OrganizationMember.query.filter_by(user_id=user.id).all()
    org_ids = [m.org_id for m in mems]
    if not org_ids:
        return jsonify([])
    orgs = Organization.query.filter(Organization.id.in_(org_ids)).all()
    result = []
    for o in orgs:
        d = organization_json(o)
        d['membersCount'] = OrganizationMember.query.filter_by(org_id=o.id).count()
        result.append(d)
    return jsonify(result)


@organizations_bp.route('/organizations', methods=['POST'])
@require_auth
def create_organization():
    user = current_user()
    payload = request.get_json(silent=True) or {}
    name = str(payload.get('name') or '').strip()
    if not name:
        return jsonify({'message': 'Name is required.'}), 400
    org = Organization(name=name, description=payload.get('description') or '',
                       website=payload.get('website') or '',
                       contact_email=payload.get('contactEmail') or payload.get('contact_email') or '',
                       created_by=user.id if user else None)
    db.session.add(org)
    db.session.commit()
    member = OrganizationMember(org_id=org.id, user_id=user.id, org_role='Owner',
                                permissions=list(VALID_PERMS), status='Active')
    db.session.add(member)
    db.session.commit()
    audit('Organization created', user, target=org.name)
    d = organization_json(org)
    d['membersCount'] = 1
    return jsonify(d), 201


@organizations_bp.route('/organizations/<org_id>', methods=['GET'])
@require_auth
def get_organization(org_id):
    user = current_user()
    org = Organization.query.get(org_id)
    if not org:
        return jsonify({'message': 'Organization not found.'}), 404
    if not is_admin(user):
        mem = _get_membership(org_id, user.id)
        if not mem:
            return jsonify({'message': 'You do not have permission to view this organization.'}), 403
    d = organization_json(org)
    d['membersCount'] = OrganizationMember.query.filter_by(org_id=org_id).count()
    return jsonify(d)


@organizations_bp.route('/organizations/<org_id>', methods=['PATCH'])
@require_auth
def update_organization(org_id):
    user = current_user()
    org = Organization.query.get(org_id)
    if not org:
        return jsonify({'message': 'Organization not found.'}), 404
    if not is_admin(user):
        mem = _get_membership(org_id, user.id)
        if not mem or mem.org_role not in ('Owner', 'Manager'):
            return jsonify({'message': 'You do not have permission to update this organization.'}), 403
    payload = request.get_json(silent=True) or {}
    if 'name' in payload:
        org.name = str(payload.get('name') or org.name).strip()
    if 'description' in payload:
        org.description = payload.get('description') or ''
    if 'website' in payload:
        org.website = payload.get('website') or ''
    if 'contactEmail' in payload:
        org.contact_email = payload.get('contactEmail') or ''
    if 'contact_email' in payload:
        org.contact_email = payload.get('contact_email') or ''
    db.session.commit()
    audit('Organization updated', user, target=org.name)
    d = organization_json(org)
    d['membersCount'] = OrganizationMember.query.filter_by(org_id=org_id).count()
    return jsonify(d)


@organizations_bp.route('/organizations/<org_id>', methods=['DELETE'])
@require_auth
def delete_organization(org_id):
    user = current_user()
    org = Organization.query.get(org_id)
    if not org:
        return jsonify({'message': 'Organization not found.'}), 404
    if not is_admin(user):
        mem = _get_membership(org_id, user.id)
        if not mem or mem.org_role != 'Owner':
            return jsonify({'message': 'Only organization owner can delete this organization.'}), 403
    for ev in Event.query.filter_by(org_id=org_id).all():
        ev.org_id = ''
    db.session.commit()
    db.session.delete(org)
    db.session.commit()
    audit('Organization deleted', user, target=org.name)
    return jsonify({'ok': True})


@organizations_bp.route('/organizations/<org_id>/members', methods=['GET'])
@require_auth
def list_org_members(org_id):
    user = current_user()
    org = Organization.query.get(org_id)
    if not org:
        return jsonify({'message': 'Organization not found.'}), 404
    if not _can_manage_org(user, org_id):
        return jsonify({'message': 'You do not have permission to view this organization.'}), 403
    rows = OrganizationMember.query.filter_by(org_id=org_id).order_by(OrganizationMember.created_at.asc()).all()
    user_ids = [m.user_id for m in rows if m.user_id]
    users = {u.id: u for u in User.query.filter(User.id.in_(user_ids)).all()} if user_ids else {}
    return jsonify([org_member_json(m, users.get(m.user_id)) for m in rows])


@organizations_bp.route('/organizations/<org_id>/members', methods=['POST'])
@require_auth
def add_org_member(org_id):
    user = current_user()
    org = Organization.query.get(org_id)
    if not org:
        return jsonify({'message': 'Organization not found.'}), 404
    if not _can_manage_org(user, org_id):
        return jsonify({'message': 'You do not have permission to manage this organization.'}), 403
    payload = request.get_json(silent=True) or {}
    email = str(payload.get('email') or '').strip().lower()
    if not email:
        return jsonify({'message': 'A member email is required.'}), 400
    target = User.query.filter_by(email=email).first()
    if not target:
        return jsonify({'message': 'No WayMark user exists with that email. Ask them to sign up first.'}), 409
    org_role = str(payload.get('orgRole') or payload.get('org_role') or 'Member').strip()
    if org_role not in VALID_ROLES:
        return jsonify({'message': 'orgRole must be one of Owner, Manager, Member.'}), 400
    raw_perms = payload.get('permissions')
    if raw_perms is not None and not isinstance(raw_perms, list):
        return jsonify({'message': 'permissions must be a list.'}), 400
    if isinstance(raw_perms, list):
        invalid = [p for p in raw_perms if str(p) not in VALID_PERMS]
        if invalid:
            return jsonify({'message': 'Invalid permissions: ' + ', '.join(str(p) for p in invalid)}), 400
    existing = _get_membership(org_id, target.id)
    if existing:
        return jsonify({'message': 'That user is already a member of this organization.'}), 409
    member = OrganizationMember(org_id=org_id, user_id=target.id, org_role=org_role,
                                permissions=_clean_permissions(raw_perms), status='Active')
    db.session.add(member)
    db.session.commit()
    audit('Organization member added', user, target=target.email + ' @ ' + (org.name or ''))
    return jsonify(org_member_json(member, target)), 201


@organizations_bp.route('/organizations/members/<member_id>', methods=['PUT', 'PATCH'])
@require_auth
def update_org_member(member_id):
    user = current_user()
    member = OrganizationMember.query.get(member_id)
    if not member:
        return jsonify({'message': 'Organization member not found.'}), 404
    if not _can_manage_org(user, member.org_id):
        return jsonify({'message': 'You do not have permission to manage this organization.'}), 403
    payload = request.get_json(silent=True) or {}
    if 'orgRole' in payload or 'org_role' in payload:
        org_role = str(payload.get('orgRole') or payload.get('org_role') or '').strip()
        if org_role not in VALID_ROLES:
            return jsonify({'message': 'orgRole must be one of Owner, Manager, Member.'}), 400
        member.org_role = org_role
    if 'permissions' in payload:
        raw_perms = payload.get('permissions')
        if not isinstance(raw_perms, list):
            return jsonify({'message': 'permissions must be a list.'}), 400
        invalid = [p for p in raw_perms if str(p) not in VALID_PERMS]
        if invalid:
            return jsonify({'message': 'Invalid permissions: ' + ', '.join(str(p) for p in invalid)}), 400
        member.permissions = _clean_permissions(raw_perms)
    if 'status' in payload:
        member.status = str(payload.get('status') or member.status)
    db.session.commit()
    target = User.query.get(member.user_id)
    audit('Organization member updated', user, target=(target.email if target else member.user_id))
    return jsonify(org_member_json(member, target))


@organizations_bp.route('/organizations/members/<member_id>', methods=['DELETE'])
@require_auth
def remove_org_member(member_id):
    user = current_user()
    member = OrganizationMember.query.get(member_id)
    if not member:
        return jsonify({'message': 'Organization member not found.'}), 404
    if not _can_manage_org(user, member.org_id):
        return jsonify({'message': 'You do not have permission to manage this organization.'}), 403
    if member.org_role == 'Owner':
        owners = OrganizationMember.query.filter_by(org_id=member.org_id, org_role='Owner').count()
        if owners <= 1:
            return jsonify({'message': 'An organization must keep at least one owner.'}), 409
    target = User.query.get(member.user_id)
    db.session.delete(member)
    db.session.commit()
    audit('Organization member removed', user, target=(target.email if target else member.user_id))
    return jsonify({'ok': True})


@organizations_bp.route('/organizations/<org_id>/events', methods=['GET'])
@require_auth
def list_org_events(org_id):
    user = current_user()
    org = Organization.query.get(org_id)
    if not org:
        return jsonify({'message': 'Organization not found.'}), 404
    if not is_admin(user):
        mem = _get_membership(org_id, user.id)
        if not mem:
            return jsonify({'message': 'You do not have permission to view this organization.'}), 403
        if not _has_org_permission(mem, ['events']):
            return jsonify({'message': 'You do not have the events permission for this organization.'}), 403
    rows = Event.query.filter_by(org_id=org_id).order_by(Event.created_at.desc()).all()
    return jsonify([event_json(e) for e in rows])


@organizations_bp.route('/events/<event_id>/organization', methods=['POST'])
@require_auth
def set_event_organization(event_id):
    user = current_user()
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    if not can_manage_event(user, event):
        return jsonify({'message': 'You can only manage events you host.'}), 403
    payload = request.get_json(silent=True) or {}
    org_id = str(payload.get('orgId') or payload.get('org_id') or '').strip()
    if not org_id:
        event.org_id = ''
        db.session.commit()
        audit('Event detached from organization', user, target=event.title)
        return jsonify(event_json(event))
    org = Organization.query.get(org_id)
    if not org:
        return jsonify({'message': 'Organization not found.'}), 404
    event.org_id = org.id
    db.session.commit()
    audit('Event assigned to organization', user, target=(event.title or '') + ' -> ' + (org.name or ''))
    return jsonify(event_json(event))
