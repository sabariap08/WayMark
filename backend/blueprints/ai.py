"""AI helpers: deterministic local drafts, summaries and Q&A.

Every call is logged to the AI log so the admin view has real data. If an
OPENAI_API_KEY were ever supplied this is where it would plug in; for now the
generation is template/keyword based and works fully offline.
"""
import re

from flask import Blueprint, jsonify, request

from extensions import db
from models import AiLog, Event, Feedback, Registration
from utils.security import current_user
from utils.serializers import ai_log_json

ai_bp = Blueprint('ai', __name__)


def _log(feature, prompt, response, user=None, status='Success'):
    row = AiLog(
        feature=feature, user=(user.name if user else 'system'), model='waymark-local',
        prompt=str(prompt)[:4000], response=str(response)[:4000],
        tokens=max(1, (len(str(prompt)) + len(str(response))) // 4), status=status,
    )
    db.session.add(row)
    db.session.commit()
    return row


def _title_case(text):
    small = {'a', 'an', 'the', 'and', 'or', 'for', 'of', 'in', 'on', 'to', 'with'}
    words = str(text or '').strip().split()
    out = []
    for i, w in enumerate(words):
        lw = w.lower()
        out.append(lw if (i and lw in small) else (w[:1].upper() + w[1:]))
    return ' '.join(out)


def _detect_category(text):
    lower = str(text or '').lower()
    if 'hack' in lower or 'build' in lower or 'sprint' in lower:
        return 'Hackathon'
    if 'workshop' in lower or 'bootcamp' in lower or 'training' in lower or 'class' in lower:
        return 'Workshop'
    if 'conference' in lower or 'summit' in lower or 'panel' in lower or 'talk' in lower:
        return 'Conference'
    if 'contest' in lower or 'competition' in lower or 'challenge' in lower or 'cup' in lower:
        return 'Competition'
    return 'Community'


def _keywords(text, limit=5):
    stop = {'the', 'a', 'an', 'and', 'or', 'for', 'of', 'in', 'on', 'to', 'with', 'we', 'our', 'is', 'are', 'this', 'that', 'event'}
    words = re.findall(r'[A-Za-z][A-Za-z0-9+#-]{2,}', str(text or ''))
    seen, out = set(), []
    for w in words:
        lw = w.lower()
        if lw in stop or lw in seen:
            continue
        seen.add(lw)
        out.append(_title_case(w))
        if len(out) >= limit:
            break
    return out


@ai_bp.route('/ai/draft-event', methods=['POST'])
def draft_event():
    payload = request.get_json(silent=True) or {}
    brief = str(payload.get('brief') or payload.get('description') or payload.get('title') or '').strip()
    if not brief:
        return jsonify({'message': 'Describe your event idea first.'}), 400
    category = str(payload.get('category') or '') or _detect_category(brief)
    title = str(payload.get('title') or '').strip() or _title_case(' '.join(brief.split()[:7]))
    tags = _keywords(brief)
    agenda = [
        {'time': '09:00', 'title': 'Check-in & welcome kit'},
        {'time': '09:30', 'title': 'Opening keynote'},
        {'time': '10:15', 'title': 'Core sessions & build time'},
        {'time': '13:00', 'title': 'Lunch & networking'},
        {'time': '15:30', 'title': 'Demos, judging & awards'},
    ]
    description = (title + ' brings together the community for a hands-on '
                   + category.lower() + ' experience. ' + brief.strip().rstrip('.') + '.'
                   + '\n\nExpect practical sessions, mentor support and plenty of time to collaborate.')
    draft = {
        'title': title, 'category': category, 'description': description,
        'tags': tags, 'agenda': agenda,
        'seats': int(payload.get('seats') or 120), 'duration': 1,
    }
    _log('draft-event', brief, draft, current_user())
    return jsonify({'draft': draft, 'title': title, 'category': category,
                    'description': description, 'tags': tags, 'agenda': agenda})


TEMPLATES = {
    'Registration confirmation': (
        'You are confirmed: {{event}}',
        'Hi {{name}},\n\nGreat news — your spot for {{event}} is confirmed. '
        'Your ticket and QR pass are in your WayMark registrations.\n\nSee you there!\n— The WayMark team'),
    'Waitlist offer': (
        'A seat opened up for {{event}}',
        'Hi {{name}},\n\nA spot just opened for {{event}}. Accept your waitlist offer '
        'before it expires and your ticket will be issued instantly.\n\n— The WayMark team'),
    'Reminder': (
        'Reminder: {{event}} is coming up',
        'Hi {{name}},\n\nA quick reminder that {{event}} is almost here. '
        'Check the schedule and bring your QR pass for a fast check-in.\n\n— The WayMark team'),
    'Results released': (
        'Results are live for {{event}}',
        'Hi {{name}},\n\nResults for {{event}} have just been released. '
        'Head to the event page to see the standings.\n\n— The WayMark team'),
    'Certificate ready': (
        'Your certificate for {{event}} is ready',
        'Hi {{name}},\n\nYour certificate for {{event}} is ready to download and share. '
        'You can verify it any time with your credential ID.\n\n— The WayMark team'),
}


@ai_bp.route('/ai/draft-message', methods=['POST'])
def draft_message():
    payload = request.get_json(silent=True) or {}
    template = str(payload.get('template') or 'Reminder')
    audience = str(payload.get('audience') or 'All registrants')
    event = Event.query.get(str(payload.get('eventId') or '')) if payload.get('eventId') else None
    event_title = (event.title if event else '') or 'your event'
    subject_t, body_t = TEMPLATES.get(template, TEMPLATES['Reminder'])
    subject = str(payload.get('subject') or '').strip() or subject_t.replace('{{event}}', event_title)
    body = body_t.replace('{{event}}', event_title).replace('{{name}}', 'there')
    body += '\n\n(Sent to: ' + audience + ')'
    _log('draft-message', str(payload), {'subject': subject, 'body': body}, current_user())
    return jsonify({'subject': subject, 'body': body})


@ai_bp.route('/ai/summarise-feedback', methods=['POST'])
def summarise_feedback():
    payload = request.get_json(silent=True) or {}
    event_id = str(payload.get('eventId') or '')
    query = Feedback.query
    if event_id:
        query = query.filter_by(event_id=event_id)
    rows = query.all()
    if not rows:
        return jsonify({'message': 'No feedback to summarise yet.'}), 404
    n = len(rows)
    avg = lambda key: round(sum((getattr(f, key) or 0) for f in rows) / n, 1)  # noqa: E731
    recommend = sum(1 for f in rows if f.would_recommend)
    highlights = [f.what_worked for f in rows if f.what_worked][:3]
    concerns = [f.what_didnt for f in rows if f.what_didnt][:3]
    summary = (str(n) + ' responses. Overall ' + str(avg('overall_rating')) + '/5, content '
               + str(avg('content_rating')) + '/5, organization ' + str(avg('organization_rating'))
               + '/5. ' + str(round(recommend * 100 / n)) + '% would recommend the event.')
    result = {'summary': summary, 'highlights': highlights, 'concerns': concerns,
              'averageRating': avg('overall_rating'), 'responses': n,
              'wouldRecommend': round(recommend * 100 / n)}
    _log('summarise-feedback', event_id or 'all events', result, current_user())
    return jsonify(result)


@ai_bp.route('/ai/ask', methods=['POST'])
def ask():
    payload = request.get_json(silent=True) or {}
    question = str(payload.get('question') or payload.get('prompt') or '').strip()
    if not question:
        return jsonify({'message': 'Ask a question first.'}), 400
    lower = question.lower()
    if 'event' in lower and any(w in lower for w in ('how many', 'count', 'total')):
        answer = 'There are ' + str(Event.query.count()) + ' events on the platform right now.'
    elif 'registration' in lower or 'signup' in lower:
        answer = 'There are ' + str(Registration.query.count()) + ' registrations across all events.'
    elif 'feedback' in lower:
        rows = Feedback.query.all()
        if rows:
            avg = round(sum(f.overall_rating or 0 for f in rows) / len(rows), 1)
            answer = 'Feedback averages ' + str(avg) + '/5 across ' + str(len(rows)) + ' responses.'
        else:
            answer = 'No feedback has been collected yet.'
    elif 'certificate' in lower:
        from models import Certificate
        answer = 'There are ' + str(Certificate.query.count()) + ' certificates issued.'
    elif 'waitlist' in lower:
        answer = 'There are ' + str(Registration.query.filter(Registration.status.in_(['Waitlisted', 'Offered'])).count()) + ' waitlisted registrations.'
    else:
        matches = Event.query.filter(Event.title.ilike('%' + question.split()[0] + '%')).limit(3).all()
        if matches:
            answer = 'Closest events: ' + ', '.join(e.title for e in matches) + '.'
        else:
            answer = ('I can report on events, registrations, feedback, certificates and waitlists. '
                      'Try asking "How many registrations are there?"')
    result = {'answer': answer}
    _log('ask', question, result, current_user())
    return jsonify(result)


@ai_bp.route('/ai/logs', methods=['GET'])
def logs():
    rows = AiLog.query.order_by(AiLog.created_at.desc()).limit(50).all()
    return jsonify([ai_log_json(a) for a in rows])