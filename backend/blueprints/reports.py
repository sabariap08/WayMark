"""Reports: CSV / XLSX / PDF exports per event."""
import csv
import io

from flask import Blueprint, jsonify, request, send_file

from models import AttendanceLog, Certificate, Event, Feedback, Registration, Score, Submission
from utils.pdf import build_pdf

reports_bp = Blueprint('reports', __name__)


def _registrations_rows(event):
    rows = Registration.query.filter_by(event_id=event.id).order_by(Registration.registered_at.asc()).all()
    headers = ['Ticket', 'Name', 'Email', 'Status', 'Attendance', 'Registered on']
    data = [[r.ticket_code or '', r.user_name or '', r.user_email or '', r.status or '',
             r.attendance_status or '', r.registered_at.strftime('%Y-%m-%d') if r.registered_at else ''] for r in rows]
    return 'Registrations — ' + (event.title or ''), headers, data


def _attendance_rows(event):
    rows = AttendanceLog.query.filter_by(event_id=event.id).order_by(AttendanceLog.timestamp.asc()).all()
    headers = ['Name', 'Email', 'Session', 'Method', 'Time']
    data = [[a.participant_name or '', a.participant_email or '', a.session or '', a.method or '',
             a.timestamp.strftime('%Y-%m-%d %H:%M') if a.timestamp else ''] for a in rows]
    return 'Attendance — ' + (event.title or ''), headers, data


def _results_rows(event):
    from blueprints.events import results_for_event
    entries = results_for_event(event)
    headers = ['Rank', 'Team', 'Project', 'Track', 'Score', 'Max', 'Spread', 'Award']
    data = [[str(e.get('rank', '')), e.get('teamName', ''), e.get('projectTitle', ''), e.get('track', ''),
             str(e.get('score', '')), str(e.get('maxScore', '')), str(e.get('spread', '')), e.get('award', '')]
            for e in entries]
    return 'Results — ' + (event.title or ''), headers, data


def _feedback_rows(event):
    rows = Feedback.query.filter_by(event_id=event.id).order_by(Feedback.submitted_at.desc()).all()
    headers = ['Name', 'Overall', 'Content', 'Organization', 'Venue', 'What worked', 'What did not', 'Recommend']
    data = [[('Anonymous' if f.anonymous else f.user_name or ''), str(f.overall_rating or ''),
             str(f.content_rating or ''), str(f.organization_rating or ''), str(f.venue_rating or ''),
             f.what_worked or '', f.what_didnt or '', 'Yes' if f.would_recommend else 'No'] for f in rows]
    return 'Feedback — ' + (event.title or ''), headers, data


def _certificates_rows(event):
    rows = Certificate.query.filter_by(event_id=event.id).all()
    headers = ['Recipient', 'Credential ID', 'Type', 'Issued', 'Status']
    data = [[c.recipient_name or '', c.credential_id or '', c.type or '', c.issue_date or '', c.status or '']
            for c in rows]
    return 'Certificates — ' + (event.title or ''), headers, data


def _submissions_rows(event):
    rows = Submission.query.filter_by(event_id=event.id).all()
    scores = Score.query.filter_by(event_id=event.id).all()
    totals = {}
    for s in scores:
        totals.setdefault(s.submission_id, []).append(s.total or 0)
    headers = ['Team', 'Project', 'Track', 'Status', 'Average score']
    data = []
    for s in rows:
        values = totals.get(s.id, [])
        avg = round(sum(values) / len(values), 1) if values else ''
        data.append([s.team_name or '', s.project_title or '', s.track or '', s.status or '', str(avg)])
    return 'Submissions — ' + (event.title or ''), headers, data


BUILDERS = {
    'registrations': _registrations_rows,
    'attendance': _attendance_rows,
    'results': _results_rows,
    'feedback': _feedback_rows,
    'certificates': _certificates_rows,
    'submissions': _submissions_rows,
}


@reports_bp.route('/events/<event_id>/reports/<kind>', methods=['GET'])
def report(event_id, kind):
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'message': 'Event not found.'}), 404
    builder = BUILDERS.get(kind)
    if not builder:
        return jsonify({'message': 'Unknown report type: ' + kind}), 404
    title, headers, data = builder(event)
    fmt = (request.args.get('format') or 'csv').lower()
    safe = ''.join(ch if ch.isalnum() or ch in '-_' else '-' for ch in (event.title or 'event')).strip('-').lower()
    filename = (safe or 'event') + '-' + kind

    if fmt in ('xlsx', 'xls'):
        try:
            from openpyxl import Workbook
            wb = Workbook()
            ws = wb.active
            ws.title = kind.title()
            ws.append(headers)
            for row in data:
                ws.append(row)
            buf = io.BytesIO()
            wb.save(buf)
            buf.seek(0)
            return send_file(buf, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                             as_attachment=True, download_name=filename + '.xlsx')
        except Exception:
            fmt = 'csv'

    if fmt == 'pdf':
        lines = [' | '.join(headers)]
        lines.append('-' * 90)
        for row in data[:40]:
            lines.append(' | '.join(str(c) for c in row))
        pdf = build_pdf(title, lines)
        return send_file(io.BytesIO(pdf), mimetype='application/pdf',
                         as_attachment=True, download_name=filename + '.pdf')

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    writer.writerows(data)
    return send_file(io.BytesIO(buf.getvalue().encode('utf-8-sig')), mimetype='text/csv',
                     as_attachment=True, download_name=filename + '.csv')