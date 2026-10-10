import { useState } from 'react';
import type { ReactNode } from 'react';
import { Calendar, Check, ChevronRight, Eye, Link2, MapPin, Pencil, Tag, TicketCheck, Users } from 'lucide-react';
import { Badge, SectionHeading } from '@/components/ui';
import { CheckboxField, FormActions, FormPreviewCard, FormSection, FormStatus, RadioGroup, SelectInput, TextArea, TextField, ToggleField } from '@/components/FormFields';

type FormStatusState = 'idle' | 'loading' | 'success' | 'error';
type Mode = 'edit' | 'preview';

export function HostEventForm() {
  const [mode, setMode] = useState<Mode>('edit');
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState('');
  const [category, setCategory] = useState('Hackathon');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [format, setFormat] = useState('');
  const [capacity, setCapacity] = useState('50');
  const [regDeadline, setRegDeadline] = useState('');
  const [organizer, setOrganizer] = useState('Maya Chen');
  const [contactEmail, setContactEmail] = useState('maya@waymark.events');
  const [website, setWebsite] = useState('');
  const [tags, setTags] = useState('');
  const [certificates, setCertificates] = useState(true);
  const [juryEnabled, setJuryEnabled] = useState(false);
  const [feedbackEnabled, setFeedbackEnabled] = useState(true);
  const [attendanceRequired, setAttendanceRequired] = useState(true);
  const [agreeRules, setAgreeRules] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [status, setStatus] = useState<FormStatusState>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Event title is required.';
    else if (title.trim().length < 5) e.title = 'Title must be at least 5 characters.';
    if (!eventType) e.eventType = 'Please select an event type.';
    if (!description.trim()) e.description = 'Description is required.';
    else if (description.trim().length < 30) e.description = 'Description must be at least 30 characters.';
    if (!startDate) e.startDate = 'Start date is required.';
    if (!endDate) e.endDate = 'End date is required.';
    if (startDate && endDate && endDate < startDate) e.endDate = 'End date cannot be before start date.';
    if (!startTime) e.startTime = 'Start time is required.';
    if (!endTime) e.endTime = 'End time is required.';
    if (!location.trim()) e.location = 'Location is required.';
    if (!format) e.format = 'Please select a format.';
    if (!capacity || Number(capacity) < 1) e.capacity = 'Capacity must be at least 1.';
    if (!regDeadline) e.regDeadline = 'Registration deadline is required.';
    if (!contactEmail.trim()) e.contactEmail = 'Contact email is required.';
    else if (!/^\S+@\S+\.\S+$/.test(contactEmail)) e.contactEmail = 'Enter a valid email address.';
    if (!agreeRules) e.agreeRules = 'You must agree to the hosting guidelines.';
    return e;
  };

  const handleSave = () => {
    setLoading(true);
    window.setTimeout(() => { setLoading(false); setStatus('success'); setStatusMsg('Draft saved. You can continue editing later.'); }, 600);
  };

  const handleSubmit = () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) { setStatus('error'); setStatusMsg('Please fix the errors before submitting.'); return; }
    setLoading(true); setStatus('loading');
    window.setTimeout(() => { setLoading(false); setStatus('success'); setStatusMsg('Event submitted for approval! Administrators will review it shortly.'); }, 1000);
  };

  if (status === 'success' && mode === 'edit') {
    return (
      <div className="form-success-screen">
        <div className="success-icon"><Check size={24} /></div>
        <h3>Event submitted</h3>
        <p>{statusMsg}</p>
        <div className="form-success-actions">
          <button className="button button-secondary" onClick={() => { setStatus('idle'); setStatusMsg(''); setErrors({}); }}>Create another</button>
          <button className="button button-primary" onClick={() => undefined}>View in my events <ChevronRight size={16} /></button>
        </div>
      </div>
    );
  }

  const eventPreview: ReactNode = (
    <>
      <div className="preview-row"><span>Event title</span><strong>{title || '—'}</strong></div>
      <div className="preview-row"><span>Type</span><strong>{eventType || '—'}</strong></div>
      <div className="preview-row"><span>Category</span><strong>{category}</strong></div>
      <div className="preview-row"><span>Format</span><strong>{format || '—'}</strong></div>
      <div className="preview-row"><span>Date</span><strong>{startDate ? `${startDate} → ${endDate || '—'}` : '—'}</strong></div>
      <div className="preview-row"><span>Time</span><strong>{startTime ? `${startTime} — ${endTime || '—'}` : '—'}</strong></div>
      <div className="preview-row"><span>Location</span><strong>{location || '—'}</strong></div>
      <div className="preview-row"><span>Capacity</span><strong>{capacity}</strong></div>
      <div className="preview-row"><span>Reg. deadline</span><strong>{regDeadline || '—'}</strong></div>
      <div className="preview-row"><span>Contact</span><strong>{contactEmail || '—'}</strong></div>
      <div className="preview-row preview-desc"><span>Description</span><p>{description || '—'}</p></div>
      <div className="preview-flags">
        {certificates && <Badge tone="green">Certificates</Badge>}
        {juryEnabled && <Badge tone="blue">Jury evaluation</Badge>}
        {feedbackEnabled && <Badge tone="amber">Feedback enabled</Badge>}
        {attendanceRequired && <Badge tone="slate">Attendance required</Badge>}
      </div>
    </>
  );

  return (
    <div className="page-stack">
      <div className="section-heading">
        <div><span className="eyebrow">Host workspace</span><h2>Create event</h2></div>
        <div className="form-mode-toggle">
          <button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}><Pencil size={14} /> Edit</button>
          <button className={mode === 'preview' ? 'active' : ''} onClick={() => setMode('preview')}><Eye size={14} /> Preview</button>
        </div>
      </div>

      {mode === 'preview' ? (
        <div className="form-preview-stack">
          <FormPreviewCard title={title || 'Untitled event'}>{eventPreview}</FormPreviewCard>
          <FormStatus status={status} message={statusMsg} />
          <FormActions onSave={handleSave} onSubmit={handleSubmit} loading={loading}
            submitLabel="Submit for approval" saveLabel="Save draft"
            showCancel={false} />
        </div>
      ) : (
        <>
          <FormSection title="Event basics" eyebrow="Step 1">
            <TextField id="he-title" label="Event title" value={title} onChange={(v) => { setTitle(v); setErrors((c) => ({ ...c, title: undefined })); }}
              required error={errors.title} placeholder="e.g. Zero Origin Hackathon" />
            <div className="form-grid-2">
              <RadioGroup id="he-type" label="Event type" value={eventType}
                onChange={(v) => { setEventType(v); setErrors((c) => ({ ...c, eventType: undefined })); }}
                required error={errors.eventType} columns={4}
                options={[
                  { value: 'Hackathon', label: 'Hackathon' },
                  { value: 'Workshop', label: 'Workshop' },
                  { value: 'Conference', label: 'Conference' },
                  { value: 'Community', label: 'Community' },
                ]} />
            </div>
            <SelectInput id="he-category" label="Category" value={category} onChange={setCategory}
              options={['Hackathon', 'Workshop', 'Conference', 'Community', 'Competition', 'Other']} icon={<Tag size={16} />} />
            <TextArea id="he-desc" label="Description" value={description}
              onChange={(v) => { setDescription(v); setErrors((c) => ({ ...c, description: undefined })); }}
              required error={errors.description} rows={4} maxLength={1000}
              hint="Minimum 30 characters. This will be shown on the event page."
              placeholder="Describe your event, goals, and what participants can expect..." />
          </FormSection>

          <FormSection title="Date & time" eyebrow="Step 2">
            <div className="form-grid-2">
              <TextField id="he-start-date" label="Start date" value={startDate}
                onChange={(v) => { setStartDate(v); setErrors((c) => ({ ...c, startDate: undefined })); }}
                required error={errors.startDate} type="date" icon={<Calendar size={16} />} />
              <TextField id="he-end-date" label="End date" value={endDate}
                onChange={(v) => { setEndDate(v); setErrors((c) => ({ ...c, endDate: undefined })); }}
                required error={errors.endDate} type="date" icon={<Calendar size={16} />} />
              <TextField id="he-start-time" label="Start time" value={startTime}
                onChange={(v) => { setStartTime(v); setErrors((c) => ({ ...c, startTime: undefined })); }}
                required error={errors.startTime} type="time" />
              <TextField id="he-end-time" label="End time" value={endTime}
                onChange={(v) => { setEndTime(v); setErrors((c) => ({ ...c, endTime: undefined })); }}
                required error={errors.endTime} type="time" />
            </div>
          </FormSection>

          <FormSection title="Location & capacity" eyebrow="Step 3">
            <RadioGroup id="he-format" label="Format" value={format}
              onChange={(v) => { setFormat(v); setErrors((c) => ({ ...c, format: undefined })); }}
              required error={errors.format} columns={3}
              options={[
                { value: 'Online', label: 'Online', detail: 'Zoom or similar' },
                { value: 'Offline', label: 'In-person', detail: 'Physical venue' },
                { value: 'Hybrid', label: 'Hybrid', detail: 'Both online & in-person' },
              ]} />
            <TextField id="he-location" label="Location / venue" value={location}
              onChange={(v) => { setLocation(v); setErrors((c) => ({ ...c, location: undefined })); }}
              required error={errors.location} icon={<MapPin size={16} />} placeholder="e.g. Innovation Hub, San Francisco" />
            <div className="form-grid-2">
              <TextField id="he-capacity" label="Capacity" value={capacity} onChange={setCapacity}
                required error={errors.capacity} type="number" icon={<Users size={16} />} />
              <TextField id="he-reg-deadline" label="Registration deadline" value={regDeadline}
                onChange={(v) => { setRegDeadline(v); setErrors((c) => ({ ...c, regDeadline: undefined })); }}
                required error={errors.regDeadline} type="date" icon={<TicketCheck size={16} />} />
            </div>
          </FormSection>

          <FormSection title="Organizer details" eyebrow="Step 4">
            <div className="form-grid-2">
              <TextField id="he-organizer" label="Organizer name" value={organizer} onChange={setOrganizer} />
              <TextField id="he-contact" label="Contact email" value={contactEmail}
                onChange={(v) => { setContactEmail(v); setErrors((c) => ({ ...c, contactEmail: undefined })); }}
                required error={errors.contactEmail} type="email" />
              <TextField id="he-website" label="Event website (optional)" value={website} onChange={setWebsite}
                icon={<Link2 size={16} />} placeholder="https://..." />
              <TextField id="he-tags" label="Tags (comma-separated)" value={tags} onChange={setTags}
                icon={<Tag size={16} />} placeholder="sustainability, ai, civic-tech" />
            </div>
          </FormSection>

          <FormSection title="Event features" eyebrow="Step 5">
            <ToggleField id="he-cert" label="Issue certificates" checked={certificates} onChange={setCertificates}
              hint="Automatically generate certificates for eligible participants." />
            <ToggleField id="he-jury" label="Enable jury evaluation" checked={juryEnabled} onChange={setJuryEnabled}
              hint="Assign jury members to score participant submissions." />
            <ToggleField id="he-feedback" label="Collect feedback" checked={feedbackEnabled} onChange={setFeedbackEnabled}
              hint="Send a feedback form after the event concludes." />
            <ToggleField id="he-attendance" label="Require attendance check-in" checked={attendanceRequired} onChange={setAttendanceRequired}
              hint="Participants must check in to receive certificates." />
          </FormSection>

          <FormSection title="Guidelines" eyebrow="Step 6">
            <CheckboxField id="he-rules" label="I agree to the WayMark hosting guidelines and content policies" checked={agreeRules}
              onChange={(v) => { setAgreeRules(v); setErrors((c) => ({ ...c, agreeRules: undefined })); }} />
            {errors.agreeRules && <span className="field-error">{errors.agreeRules}</span>}
          </FormSection>

          <FormStatus status={status} message={statusMsg} />
          <FormActions onSave={handleSave} onSubmit={handleSubmit} loading={loading}
            submitLabel="Submit for approval" saveLabel="Save draft" />
        </>
      )}
    </div>
  );
}

// =================== Admin Approval & Publishing Form ===================

export function ApprovalForm() {
  const [decision, setDecision] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [conditions, setConditions] = useState('');
  const [publishImmediately, setPublishImmediately] = useState(true);
  const [featured, setFeatured] = useState(false);
  const [notifyOrganizer, setNotifyOrganizer] = useState(true);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [status, setStatus] = useState<FormStatusState>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = () => {
    const e: Record<string, string> = {};
    if (!decision) e.decision = 'Please select a decision.';
    if (decision === 'approve-with-conditions' && !conditions.trim()) e.conditions = 'Conditions must be specified.';
    if (decision === 'reject' && !reviewNotes.trim()) e.reviewNotes = 'Please provide a reason for rejection.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setLoading(true); setStatus('loading');
    window.setTimeout(() => {
      setLoading(false); setStatus('success');
      setStatusMsg(decision === 'reject' ? 'Event rejected. The organizer has been notified.' : 'Event approved and published successfully.');
    }, 900);
  };

  if (status === 'success') {
    return (
      <div className="form-success-screen">
        <div className="success-icon"><Check size={24} /></div>
        <h3>Decision recorded</h3>
        <p>{statusMsg}</p>
        <button className="button button-secondary" onClick={() => { setStatus('idle'); setDecision(''); setReviewNotes(''); }}>Review next event</button>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <SectionHeading eyebrow="Admin workspace" title="Review: Campus Sustainability Summit" />
      <div className="form-approval-summary panel">
        <div className="approval-summary-row">
          <div className="approval-summary-item"><span className="eyebrow">Organizer</span><strong>Jordan Lee</strong></div>
          <div className="approval-summary-item"><span className="eyebrow">Type</span><strong>Conference</strong></div>
          <div className="approval-summary-item"><span className="eyebrow">Date</span><strong>Nov 02, 2026</strong></div>
          <div className="approval-summary-item"><span className="eyebrow">Capacity</span><strong>400</strong></div>
          <div className="approval-summary-item"><span className="eyebrow">Submitted</span><strong>3h ago</strong></div>
        </div>
      </div>
      <FormSection title="Review decision" eyebrow="Action">
        <RadioGroup id="ap-decision" label="Decision" value={decision}
          onChange={(v) => { setDecision(v); setErrors((c) => ({ ...c, decision: undefined })); }}
          required error={errors.decision} columns={1}
          options={[
            { value: 'approve', label: 'Approve and publish', detail: 'Event will be live immediately or on scheduled date' },
            { value: 'approve-with-conditions', label: 'Approve with conditions', detail: 'Specify conditions the organizer must meet' },
            { value: 'request-changes', label: 'Request changes', detail: 'Send back to organizer for edits' },
            { value: 'reject', label: 'Reject', detail: 'Event will not be published' },
          ]} />
        {decision === 'approve-with-conditions' && (
          <TextArea id="ap-conditions" label="Conditions" value={conditions}
            onChange={(v) => { setConditions(v); setErrors((c) => ({ ...c, conditions: undefined })); }}
            required error={errors.conditions} rows={3}
            placeholder="List the conditions the organizer must address..." />
        )}
        <TextArea id="ap-notes" label="Review notes" value={reviewNotes}
          onChange={setReviewNotes} rows={3}
          required={decision === 'reject' || decision === 'request-changes'}
          error={errors.reviewNotes}
          placeholder="Internal notes or feedback for the organizer..." />
      </FormSection>
      <FormSection title="Publishing options" eyebrow="Settings">
        <ToggleField id="ap-publish" label="Publish immediately" checked={publishImmediately} onChange={setPublishImmediately}
          hint="If off, event will be scheduled for publishing on its start date." />
        <ToggleField id="ap-featured" label="Feature on discover page" checked={featured} onChange={setFeatured}
          hint="Highlighted in the discover events section." />
        <ToggleField id="ap-notify" label="Notify organizer" checked={notifyOrganizer} onChange={setNotifyOrganizer}
          hint="Send an email notification with the decision." />
      </FormSection>
      <FormStatus status={status} message={statusMsg} />
      <FormActions onSubmit={handleSubmit} loading={loading}
        submitLabel={decision === 'reject' ? 'Reject event' : 'Approve & publish'}
        saveLabel="Save review" showCancel={true} />
    </div>
  );
}
