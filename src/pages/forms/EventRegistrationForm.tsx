import { useState } from 'react';
import { FileText, Link2 } from 'lucide-react';
import { Badge } from '@/components/ui';
import { CheckboxField, FormActions, FormSection, FormStatus, RadioGroup, SelectInput, TextArea, TextField, ToggleField } from '@/components/FormFields';

type FormStatusState = 'idle' | 'loading' | 'success' | 'error';
type EventType = 'Hackathon' | 'Workshop' | 'Conference' | 'Community';

export function EventRegistrationForm() {
  const [eventType, setEventType] = useState<EventType>('Hackathon');
  const [fullName, setFullName] = useState('Maya Chen');
  const [email, setEmail] = useState('maya@waymark.events');
  const [phone, setPhone] = useState('');
  const [org, setOrg] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamSize, setTeamSize] = useState('1');
  const [experienceLevel, setExperienceLevel] = useState('');
  const [ dietaryPref, setDietaryPref] = useState('');
  const [track, setTrack] = useState('');
  const [posterTopic, setPosterTopic] = useState('');
  const [accommodation, setAccommodation] = useState(false);
  const [transport, setTransport] = useState(false);
  const [agree, setAgree] = useState(false);
  const [agreeCode, setAgreeCode] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [status, setStatus] = useState<FormStatusState>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!fullName.trim()) e.fullName = 'Full name is required.';
    if (!email.trim()) e.email = 'Email is required.';
    else if (!/^\S+@\S+\.\S+$/.test(email)) e.email = 'Enter a valid email address.';
    if (eventType === 'Hackathon') {
      if (!teamName.trim()) e.teamName = 'Team name is required for hackathons.';
      if (!experienceLevel) e.experienceLevel = 'Please select your experience level.';
      if (!track) e.track = 'Please select a track.';
      if (!agreeCode) e.agreeCode = 'You must agree to the code of conduct.';
    }
    if (eventType === 'Workshop' && !experienceLevel) e.experienceLevel = 'Please select your experience level.';
    if (eventType === 'Conference' && !posterTopic.trim()) e.posterTopic = 'Poster topic is required for conferences.';
    if (!agree) e.agree = 'You must accept the participation terms.';
    return e;
  };

  const handleSubmit = () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setLoading(true); setStatus('loading');
    window.setTimeout(() => { setLoading(false); setStatus('success'); setStatusMsg('Registration confirmed! A confirmation email has been sent.'); }, 900);
  };

  const handleSave = () => {
    setLoading(true);
    window.setTimeout(() => { setLoading(false); setStatus('success'); setStatusMsg('Draft saved. You can return to complete your registration later.'); }, 600);
  };

  if (status === 'success') {
    return (
      <div className="form-success-screen">
        <div className="success-icon"><FileText size={24} /></div>
        <h3>Registration complete</h3>
        <p>{statusMsg}</p>
        <button className="button button-secondary" onClick={() => { setStatus('idle'); setStatusMsg(''); }}>Register for another event</button>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="section-heading">
        <div><span className="eyebrow">Event registration</span><h2>Register for: Zero Origin Hackathon</h2></div>
        <Badge tone="green">Registration open</Badge>
      </div>
      <FormSection title="Event type" eyebrow="Format">
        <RadioGroup id="reg-type" label="Select your event type" value={eventType}
          onChange={(v) => { setEventType(v as EventType); setErrors({}); }}
          columns={4}
          options={[
            { value: 'Hackathon', label: 'Hackathon', detail: 'Team competition' },
            { value: 'Workshop', label: 'Workshop', detail: 'Learning session' },
            { value: 'Conference', label: 'Conference', detail: 'Talks & posters' },
            { value: 'Community', label: 'Community', detail: 'Meetup' },
          ]} />
      </FormSection>
      <FormSection title="Participant details" eyebrow="Your information">
        <div className="form-grid-2">
          <TextField id="reg-name" label="Full name" value={fullName} onChange={(v) => { setFullName(v); setErrors((c) => ({ ...c, fullName: undefined })); }}
            required error={errors.fullName} />
          <TextField id="reg-email" label="Email address" value={email} onChange={(v) => { setEmail(v); setErrors((c) => ({ ...c, email: undefined })); }}
            required type="email" error={errors.email} />
          <TextField id="reg-phone" label="Phone number" value={phone} onChange={setPhone} hint="Optional, for reminders" />
          <TextField id="reg-org" label="Organization / school" value={org} onChange={setOrg} />
        </div>
      </FormSection>

      {/* Conditional fields by event type */}
      {eventType === 'Hackathon' && (
        <FormSection title="Hackathon details" eyebrow="Team & track">
          <div className="form-grid-2">
            <TextField id="reg-team" label="Team name" value={teamName} onChange={(v) => { setTeamName(v); setErrors((c) => ({ ...c, teamName: undefined })); }}
              required error={errors.teamName} />
            <SelectInput id="reg-team-size" label="Team size" value={teamSize} onChange={setTeamSize}
              options={['1', '2', '3', '4', '5', '6']} />
          </div>
          <RadioGroup id="reg-exp" label="Experience level" value={experienceLevel}
            onChange={(v) => { setExperienceLevel(v); setErrors((c) => ({ ...c, experienceLevel: undefined })); }}
            required error={errors.experienceLevel} columns={3}
            options={[
              { value: 'beginner', label: 'Beginner', detail: 'First or second hackathon' },
              { value: 'intermediate', label: 'Intermediate', detail: '3-5 hackathons' },
              { value: 'advanced', label: 'Advanced', detail: '6+ hackathons' },
            ]} />
          <RadioGroup id="reg-track" label="Preferred track" value={track}
            onChange={(v) => { setTrack(v); setErrors((c) => ({ ...c, track: undefined })); }}
            required error={errors.track} columns={3}
            options={[
              { value: 'ai-ml', label: 'AI & ML', detail: 'Machine learning projects' },
              { value: 'sustainability', label: 'Sustainability', detail: 'Climate & environment' },
              { value: 'civic-tech', label: 'Civic tech', detail: 'Community impact' },
            ]} />
          <div className="form-field-group">
            <div className="form-field-label-row"><label>Team portfolio link<span className="form-req">*</span></label><span className="form-hint">GitHub, Google Drive, or similar</span></div>
            <div className="form-input-wrap"><Link2 size={16} /><input value="" onChange={() => {}} placeholder="https://..." /></div>
          </div>
          <CheckboxField id="reg-code" label="I agree to the hackathon code of conduct" checked={agreeCode}
            onChange={(v) => { setAgreeCode(v); setErrors((c) => ({ ...c, agreeCode: undefined })); }}
            hint="All team members must comply with the code of conduct." />
          {errors.agreeCode && <span className="field-error">{errors.agreeCode}</span>}
        </FormSection>
      )}

      {eventType === 'Workshop' && (
        <FormSection title="Workshop details" eyebrow="Session preferences">
          <RadioGroup id="reg-ws-exp" label="Experience level" value={experienceLevel}
            onChange={(v) => { setExperienceLevel(v); setErrors((c) => ({ ...c, experienceLevel: undefined })); }}
            required error={errors.experienceLevel} columns={3}
            options={[
              { value: 'beginner', label: 'Beginner', detail: 'New to the topic' },
              { value: 'intermediate', label: 'Intermediate', detail: 'Some experience' },
              { value: 'advanced', label: 'Advanced', detail: 'Deep knowledge' },
            ]} />
          <SelectInput id="reg-diet" label="Dietary preferences" value={dietaryPref} onChange={setDietaryPref}
            options={['No preference', 'Vegetarian', 'Vegan', 'Gluten-free', 'Halal', 'Kosher']}
            hint="For catered sessions" />
        </FormSection>
      )}

      {eventType === 'Conference' && (
        <FormSection title="Conference details" eyebrow="Presentation">
          <TextField id="reg-poster" label="Poster / talk topic" value={posterTopic}
            onChange={(v) => { setPosterTopic(v); setErrors((c) => ({ ...c, posterTopic: undefined })); }}
            required error={errors.posterTopic} hint="If presenting; otherwise enter 'Attending only'" />
          <SelectInput id="reg-session" label="Preferred session track" value={track} onChange={setTrack}
            options={['No preference', 'Research', 'Industry', 'Student', 'Community']} />
        </FormSection>
      )}

      {eventType === 'Community' && (
        <FormSection title="Community meetup" eyebrow="Details">
          <TextArea id="reg-topics" label="Topics you'd like to discuss" value={posterTopic} onChange={setPosterTopic}
            rows={3} hint="Help the organizer plan the agenda" />
        </FormSection>
      )}

      <FormSection title="Logistics" eyebrow="Support">
        <ToggleField id="reg-accom" label="Request accommodation" checked={accommodation} onChange={setAccommodation}
          hint="For multi-day events requiring overnight stay." />
        <ToggleField id="reg-transport" label="Request transport assistance" checked={transport} onChange={setTransport}
          hint="Shuttle or travel stipend for eligible participants." />
      </FormSection>
      <FormSection title="Terms & consent" eyebrow="Agreement">
        <CheckboxField id="reg-agree" label="I accept the participation terms and event guidelines" checked={agree}
          onChange={(v) => { setAgree(v); setErrors((c) => ({ ...c, agree: undefined })); }} />
        {errors.agree && <span className="field-error">{errors.agree}</span>}
      </FormSection>
      <FormStatus status={status} message={statusMsg} />
      <FormActions onSave={handleSave} onSubmit={handleSubmit} loading={loading}
        submitLabel="Confirm registration" saveLabel="Save draft" />
    </div>
  );
}
