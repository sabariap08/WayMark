import { useState } from 'react';
import { Award, Check, ClipboardCheck, Download, FileCheck2, MessageSquare, QrCode } from 'lucide-react';
import { Badge, SectionHeading } from '@/components/ui';
import { CheckboxField, FormActions, FormSection, FormStatus, RadioGroup, ScoreInput, SelectInput, TextArea, TextField, ToggleField } from '@/components/FormFields';

type FormStatusState = 'idle' | 'loading' | 'success' | 'error';

// =================== Attendance Form ===================

export function AttendanceForm() {
  const [mode, setMode] = useState<'manual' | 'qr'>('manual');
  const [event, setEvent] = useState('Zero Origin Hackathon');
  const [participantId, setParticipantId] = useState('');
  const [session, setSession] = useState('Main event');
  const [checkedIn, setCheckedIn] = useState<string[]>([]);
  const [status, setStatus] = useState<FormStatusState>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const roster = [
    { id: 'P001', name: 'Maya Chen', email: 'maya@waymark.events', status: 'confirmed' as const },
    { id: 'P002', name: 'Jordan Lee', email: 'jordan@waymark.events', status: 'confirmed' as const },
    { id: 'P003', name: 'Ari Kim', email: 'ari@waymark.events', status: 'confirmed' as const },
    { id: 'P004', name: 'Samira Okafor', email: 'samira@waymark.events', status: 'confirmed' as const },
    { id: 'P005', name: 'Theo Martin', email: 'theo@waymark.events', status: 'confirmed' as const },
  ];

  const toggleCheckIn = (id: string) => {
    setCheckedIn((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);
    setStatus('success'); setStatusMsg(`${roster.find((r) => r.id === id)?.name} checked ${checkedIn.includes(id) ? 'out' : 'in'}.`);
    window.setTimeout(() => setStatus('idle'), 2000);
  };

  const handleManualCheckIn = () => {
    if (!participantId.trim()) { setStatus('error'); setStatusMsg('Enter a participant ID.'); return; }
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      if (!checkedIn.includes(participantId)) {
        setCheckedIn((prev) => [...prev, participantId]);
        setStatus('success'); setStatusMsg(`Participant ${participantId} checked in.`);
      } else {
        setStatus('error'); setStatusMsg(`Participant ${participantId} already checked in.`);
      }
      setParticipantId('');
    }, 500);
  };

  return (
    <div className="page-stack">
      <SectionHeading eyebrow="Event operations" title="Attendance check-in" />
      <FormSection title="Session selection" eyebrow="Setup">
        <div className="form-grid-2">
          <SelectInput id="at-event" label="Event" value={event} onChange={setEvent}
            options={['Zero Origin Hackathon', 'Designing for Civic Impact', 'Campus Sustainability Summit']} />
          <SelectInput id="at-session" label="Session" value={session} onChange={setSession}
            options={['Main event', 'Opening ceremony', 'Workshop session A', 'Workshop session B', 'Closing ceremony']} />
        </div>
      </FormSection>
      <FormSection title="Check-in method" eyebrow="Mode">
        <RadioGroup id="at-mode" label="Select method" value={mode} onChange={(v) => setMode(v as 'manual' | 'qr')}
          columns={2}
          options={[
            { value: 'manual', label: 'Manual check-in', detail: 'Search by ID or name' },
            { value: 'qr', label: 'QR code scan', detail: 'Scan participant QR code' },
          ]} />
      </FormSection>

      {mode === 'manual' ? (
        <FormSection title="Manual check-in" eyebrow="Enter ID">
          <TextField id="at-pid" label="Participant ID" value={participantId} onChange={setParticipantId}
            placeholder="e.g. P001" icon={<ClipboardCheck size={16} />} />
          <button type="button" className="button button-primary" onClick={handleManualCheckIn} disabled={loading}>
            <Check size={15} /> Check in participant
          </button>
          <FormStatus status={status} message={statusMsg} />
        </FormSection>
      ) : (
        <FormSection title="QR code scanner" eyebrow="Scan">
          <div className="qr-placeholder">
            <QrCode size={64} />
            <p>QR scanner is ready. Point the camera at a participant's QR code.</p>
          </div>
          <FormStatus status={status} message={statusMsg} />
        </FormSection>
      )}

      <FormSection title="Attendance roster" eyebrow={`${checkedIn.length}/${roster.length} checked in`}>
        <div className="attendance-roster">
          {roster.map((r) => (
            <div className={`attendance-row ${checkedIn.includes(r.id) ? 'checked-in' : ''}`} key={r.id}>
              <div className="attendance-id">{r.id}</div>
              <div className="attendance-name">
                <strong>{r.name}</strong>
                <span>{r.email}</span>
              </div>
              <Badge tone={checkedIn.includes(r.id) ? 'green' : 'slate'}>
                {checkedIn.includes(r.id) ? 'Checked in' : 'Not checked in'}
              </Badge>
              <button className={`button button-${checkedIn.includes(r.id) ? 'secondary' : 'primary'} attendance-toggle`}
                onClick={() => toggleCheckIn(r.id)}>
                {checkedIn.includes(r.id) ? 'Undo' : 'Check in'}
              </button>
            </div>
          ))}
        </div>
      </FormSection>
    </div>
  );
}

// =================== Feedback Form ===================

export function FeedbackForm() {
  const [event, setEvent] = useState('Zero Origin Hackathon');
  const [overallRating, setOverallRating] = useState(0);
  const [contentRating, setContentRating] = useState(0);
  const [organizationRating, setOrganizationRating] = useState(0);
  const [venueRating, setVenueRating] = useState(0);
  const [whatWorked, setWhatWorked] = useState('');
  const [whatDidnt, setWhatDidnt] = useState('');
  const [wouldRecommend, setWouldRecommend] = useState('');
  const [attendAgain, setAttendAgain] = useState(true);
  const [anonymous, setAnonymous] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [status, setStatus] = useState<FormStatusState>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = () => {
    const e: Record<string, string> = {};
    if (!overallRating) e.overall = 'Please rate your overall experience.';
    if (!wouldRecommend) e.recommend = 'Please select an option.';
    if (!whatWorked.trim()) e.whatWorked = 'Please share what worked well.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setLoading(true); setStatus('loading');
    window.setTimeout(() => { setLoading(false); setStatus('success'); setStatusMsg('Thank you! Your feedback has been submitted.'); }, 800);
  };

  if (status === 'success') {
    return (
      <div className="form-success-screen">
        <div className="success-icon"><MessageSquare size={24} /></div>
        <h3>Feedback received</h3>
        <p>{statusMsg}</p>
        <button className="button button-secondary" onClick={() => { setStatus('idle'); setOverallRating(0); setContentRating(0); setOrganizationRating(0); setVenueRating(0); setWhatWorked(''); setWhatDidnt(''); setWouldRecommend(''); }}>Submit another</button>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <SectionHeading eyebrow="Post-event" title="Event feedback" />
      <FormSection title="Event" eyebrow="Select">
        <SelectInput id="fb-event" label="Which event are you reviewing?" value={event} onChange={setEvent}
          options={['Zero Origin Hackathon', 'Designing for Civic Impact', 'Campus Sustainability Summit', 'Frontend Futures Meetup']} />
      </FormSection>
      <FormSection title="Ratings" eyebrow="Your experience">
        <div className="feedback-rating">
          <div className="feedback-rating-head"><strong>Overall experience<span className="form-req">*</span></strong></div>
          <ScoreInput label="" value={overallRating} max={5}
            onChange={(v) => { setOverallRating(v); setErrors((c) => ({ ...c, overall: undefined })); }} />
          {errors.overall && <span className="field-error">{errors.overall}</span>}
        </div>
        <div className="feedback-rating">
          <div className="feedback-rating-head"><strong>Content quality</strong></div>
          <ScoreInput label="" value={contentRating} max={5} onChange={setContentRating} />
        </div>
        <div className="feedback-rating">
          <div className="feedback-rating-head"><strong>Organization</strong></div>
          <ScoreInput label="" value={organizationRating} max={5} onChange={setOrganizationRating} />
        </div>
        <div className="feedback-rating">
          <div className="feedback-rating-head"><strong>Venue / platform</strong></div>
          <ScoreInput label="" value={venueRating} max={5} onChange={setVenueRating} />
        </div>
      </FormSection>
      <FormSection title="Written feedback" eyebrow="Details">
        <TextArea id="fb-worked" label="What worked well?" value={whatWorked}
          onChange={(v) => { setWhatWorked(v); setErrors((c) => ({ ...c, whatWorked: undefined })); }}
          required error={errors.whatWorked} rows={3} placeholder="Share what you enjoyed about the event..." />
        <TextArea id="fb-didnt" label="What could be improved?" value={whatDidnt} onChange={setWhatDidnt}
          rows={3} placeholder="Constructive suggestions for the organizers..." />
        <div className="form-field-group">
          <div className="form-field-label-row"><label>Would you recommend this event to others?<span className="form-req">*</span></label></div>
          <div className="form-radio-grid form-radio-cols-3">
            {['Yes, definitely', 'Maybe', 'No'].map((r) => (
              <button type="button" key={r} className={`form-radio-card ${wouldRecommend === r ? 'form-radio-selected' : ''}`}
                onClick={() => { setWouldRecommend(r); setErrors((c) => ({ ...c, recommend: undefined })); }}>
                <span className={`form-radio-dot ${wouldRecommend === r ? 'form-radio-dot-on' : ''}`} />
                <div><strong>{r}</strong></div>
              </button>
            ))}
          </div>
          {errors.recommend && <span className="field-error">{errors.recommend}</span>}
        </div>
        <ToggleField id="fb-again" label="I would attend another event by this organizer" checked={attendAgain} onChange={setAttendAgain} />
        <ToggleField id="fb-anon" label="Submit anonymously" checked={anonymous} onChange={setAnonymous}
          hint="Your name will not be shared with the organizer." />
      </FormSection>
      <FormStatus status={status} message={statusMsg} />
      <FormActions onSubmit={handleSubmit} loading={loading} submitLabel="Submit feedback" showSave={false} />
    </div>
  );
}

// =================== Certificate Issuance Form ===================

export function CertificateForm() {
  const [event, setEvent] = useState('Zero Origin Hackathon');
  const [template, setTemplate] = useState('Standard');
  const [title, setTitle] = useState('Certificate of Participation');
  const [issuer, setIssuer] = useState('WayMark Platform');
  const [signatory, setSignatory] = useState('Dr. Sarah Lin');
  const [criteria, setCriteria] = useState('attended');
  const [minScore, setMinScore] = useState('0');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [status, setStatus] = useState<FormStatusState>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [issued, setIssued] = useState(false);

  const eligible = [
    { id: 'P001', name: 'Maya Chen', attended: true, score: 85 },
    { id: 'P002', name: 'Jordan Lee', attended: true, score: 78 },
    { id: 'P003', name: 'Ari Kim', attended: true, score: 92 },
    { id: 'P004', name: 'Samira Okafor', attended: false, score: 0 },
    { id: 'P005', name: 'Theo Martin', attended: true, score: 65 },
  ];

  const filtered = criteria === 'attended' ? eligible.filter((p) => p.attended)
    : criteria === 'score' ? eligible.filter((p) => p.attended && p.score >= Number(minScore))
    : eligible;

  const toggleRecipient = (id: string) => {
    setRecipients((prev) => prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]);
  };

  const handleIssue = () => {
    if (recipients.length === 0) { setStatus('error'); setStatusMsg('Select at least one recipient.'); return; }
    setLoading(true); setStatus('loading');
    window.setTimeout(() => { setLoading(false); setStatus('success'); setIssued(true); setStatusMsg(`${recipients.length} certificate(s) issued successfully.`); }, 1000);
  };

  if (issued) {
    return (
      <div className="form-success-screen">
        <div className="success-icon"><FileCheck2 size={24} /></div>
        <h3>Certificates issued</h3>
        <p>{statusMsg}</p>
        <div className="form-success-actions">
          <button className="button button-secondary"><Download size={15} /> Download all</button>
          <button className="button button-primary" onClick={() => { setIssued(false); setRecipients([]); setStatus('idle'); }}>Issue more</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <SectionHeading eyebrow="Certificates" title="Issue certificates" />
      <FormSection title="Certificate details" eyebrow="Template">
        <div className="form-grid-2">
          <SelectInput id="ct-event" label="Event" value={event} onChange={setEvent}
            options={['Zero Origin Hackathon', 'Designing for Civic Impact', 'Campus Sustainability Summit']} />
          <SelectInput id="ct-template" label="Template" value={template} onChange={setTemplate}
            options={['Standard', 'Achievement', 'Participation', 'Excellence', 'Completion']} />
          <TextField id="ct-title" label="Certificate title" value={title} onChange={setTitle} />
          <TextField id="ct-issuer" label="Issuing organization" value={issuer} onChange={setIssuer} />
          <TextField id="ct-signatory" label="Signatory name" value={signatory} onChange={setSignatory} />
        </div>
      </FormSection>
      <FormSection title="Eligibility criteria" eyebrow="Rules">
        <RadioGroup id="ct-criteria" label="Who should receive certificates?" value={criteria}
          onChange={(v) => { setCriteria(v); setRecipients([]); }}
          columns={3}
          options={[
            { value: 'attended', label: 'All who attended', detail: 'Checked-in participants' },
            { value: 'score', label: 'Minimum score', detail: 'Jury score threshold' },
            { value: 'manual', label: 'Manual selection', detail: 'Pick recipients individually' },
          ]} />
        {criteria === 'score' && (
          <TextField id="ct-min-score" label="Minimum jury score" value={minScore} onChange={setMinScore} type="number" />
        )}
      </FormSection>
      <FormSection title="Recipients" eyebrow={`${recipients.length} selected`}>
        <div className="cert-recipient-list">
          {filtered.map((p) => (
            <div className={`cert-recipient-row ${recipients.includes(p.id) ? 'selected' : ''}`} key={p.id}>
              <CheckboxField id={`ct-${p.id}`} label="" checked={recipients.includes(p.id)} onChange={() => toggleRecipient(p.id)} />
              <div className="cert-recipient-info">
                <strong>{p.name}</strong>
                <span>{p.id} · {p.attended ? `Score: ${p.score}` : 'Did not attend'}</span>
              </div>
              {p.attended ? <Badge tone="green">Eligible</Badge> : <Badge tone="slate">Not eligible</Badge>}
            </div>
          ))}
        </div>
      </FormSection>
      <FormStatus status={status} message={statusMsg} />
      <FormActions onSubmit={handleIssue} loading={loading} submitLabel="Issue certificates" showSave={false} />
    </div>
  );
}

// =================== Certificate Verification Form ===================

export function CertificateVerifyForm() {
  const [certId, setCertId] = useState('');
  const [result, setResult] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [loading, setLoading] = useState(false);

  const handleVerify = () => {
    if (!certId.trim()) return;
    setLoading(true); setResult('idle');
    window.setTimeout(() => {
      setLoading(false);
      setResult(certId.toUpperCase() === 'WM-2026-001' ? 'valid' : 'invalid');
    }, 700);
  };

  return (
    <div className="page-stack">
      <SectionHeading eyebrow="Certificates" title="Verify a certificate" />
      <FormSection title="Certificate lookup" eyebrow="Search">
        <TextField id="cv-id" label="Certificate ID" value={certId} onChange={setCertId}
          placeholder="e.g. WM-2026-001" icon={<Award size={16} />} hint="Found on the certificate document" />
        <button type="button" className="button button-primary" onClick={handleVerify} disabled={loading}>
          {loading ? <><span className="loading-spinner" /> Verifying...</> : <>Verify certificate</>}
        </button>
      </FormSection>
      {result === 'valid' && (
        <div className="panel cert-verify-result valid">
          <div className="success-icon"><Check size={24} /></div>
          <h3>Certificate verified</h3>
          <div className="cert-verify-details">
            <div><span className="eyebrow">Holder</span><strong>Maya Chen</strong></div>
            <div><span className="eyebrow">Event</span><strong>Zero Origin Hackathon</strong></div>
            <div><span className="eyebrow">Date</span><strong>October 18, 2026</strong></div>
            <div><span className="eyebrow">Status</span><strong>Valid</strong></div>
          </div>
          <button className="button button-secondary"><Download size={15} /> Download copy</button>
        </div>
      )}
      {result === 'invalid' && (
        <div className="panel cert-verify-result invalid">
          <div className="cert-verify-invalid-icon"><FileCheck2 size={24} /></div>
          <h3>Certificate not found</h3>
          <p>No certificate with ID "{certId}" was found. Please check the ID and try again.</p>
        </div>
      )}
    </div>
  );
}
