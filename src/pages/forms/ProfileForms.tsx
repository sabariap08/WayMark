import { useState } from 'react';
import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail, User, Building2, Phone, Globe, MapPin, Calendar, Briefcase } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import { FormActions, FormSection, FormStatus, RadioGroup, TextArea, TextField, ToggleField } from '@/components/FormFields';

type FormStatusState = 'idle' | 'loading' | 'success' | 'error';

// =================== Registration (Signup) Form ===================

export function SignupForm() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('');
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [status, setStatus] = useState<FormStatusState>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!fullName.trim()) e.fullName = 'Full name is required.';
    else if (fullName.trim().length < 2) e.fullName = 'Name must be at least 2 characters.';
    if (!email.trim()) e.email = 'Email address is required.';
    else if (!/^\S+@\S+\.\S+$/.test(email)) e.email = 'Enter a valid email address.';
    if (!password) e.password = 'Password is required.';
    else if (password.length < 8) e.password = 'Password must be at least 8 characters.';
    if (!role) e.role = 'Please select how you plan to use WayMark.';
    if (!agree) e.agree = 'You must agree to the terms to continue.';
    return e;
  };

  const handleSubmit = () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setLoading(true); setStatus('loading');
    window.setTimeout(() => {
      setLoading(false); setStatus('success');
      setStatusMsg('Account created successfully. You can now sign in.');
    }, 900);
  };

  if (status === 'success') {
    return (
      <div className="auth-success">
        <div className="success-icon"><Check size={24} /></div>
        <h3>Welcome to WayMark.</h3>
        <p>{statusMsg}</p>
        <Button onClick={() => navigate('/login')} icon={<ArrowRight size={16} />}>Continue to sign in</Button>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} noValidate>
      <TextField id="su-name" label="Full name" value={fullName} onChange={setFullName}
        placeholder="Maya Chen" required error={errors.fullName} icon={<User size={16} />} />
      <TextField id="su-email" label="Email address" value={email} onChange={setEmail}
        placeholder="you@example.com" required type="email" error={errors.email} icon={<Mail size={16} />} />
      <div className="form-field-group">
        <div className="form-field-label-row"><label htmlFor="su-pw">Password<span className="form-req">*</span></label></div>
        <div className={`form-input-wrap ${errors.password ? 'form-input-error' : ''}`}>
          <LockKeyhole size={16} />
          <input id="su-pw" type={showPassword ? 'text' : 'password'} value={password}
            onChange={(e) => { setPassword(e.target.value); setErrors((c) => ({ ...c, password: undefined })); }}
            placeholder="Minimum 8 characters" />
          <button type="button" className="password-toggle" onClick={() => setShowPassword((v) => !v)}>
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {errors.password && <span className="field-error">{errors.password}</span>}
      </div>
      <RadioGroup id="su-role" label="How will you use WayMark?" value={role} onChange={setRole} required
        error={errors.role} columns={2}
        options={[
          { value: 'participant', label: 'Participant', detail: 'Discover and join events' },
          { value: 'host', label: 'Event host', detail: 'Create and manage events' },
          { value: 'jury', label: 'Jury member', detail: 'Evaluate event submissions' },
          { value: 'admin', label: 'Administrator', detail: 'Approve and oversee events' },
        ]} />
      <div className="form-field-group">
        <ToggleField id="su-agree" label="I agree to the WayMark terms and privacy policy"
          checked={agree} onChange={(v) => { setAgree(v); setErrors((c) => ({ ...c, agree: undefined })); }}
          hint="You can review the full terms before continuing." />
        {errors.agree && <span className="field-error">{errors.agree}</span>}
      </div>
      <FormStatus status={status} message={statusMsg} />
      <Button className="auth-submit" onClick={handleSubmit}>
        {loading ? <><span className="loading-spinner" /> Creating account...</> : <>Create account <ArrowRight size={16} /></>}
      </Button>
    </form>
  );
}

// =================== Profile Management Form ===================

export function ProfileForm() {
  const [fullName, setFullName] = useState('Maya Chen');
  const [email, setEmail] = useState('maya@waymark.events');
  const [phone, setPhone] = useState('+1 555 0142');
  const [org, setOrg] = useState('Independent');
  const [role, setRole] = useState('Event host');
  const [bio, setBio] = useState('Community builder and event organizer focused on civic tech and sustainability initiatives.');
  const [website, setWebsite] = useState('https://maya-chen.work');
  const [location, setLocation] = useState('San Francisco, CA');
  const [birthDate, setBirthDate] = useState('1998-03-14');
  const [pronouns, setPronouns] = useState('she/her');
  const [emailUpdates, setEmailUpdates] = useState(true);
  const [smsReminders, setSmsReminders] = useState(false);
  const [publicProfile, setPublicProfile] = useState(true);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [status, setStatus] = useState<FormStatusState>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!fullName.trim()) e.fullName = 'Full name is required.';
    if (!email.trim()) e.email = 'Email is required.';
    else if (!/^\S+@\S+\.\S+$/.test(email)) e.email = 'Enter a valid email address.';
    if (website && !/^https?:\/\//.test(website)) e.website = 'Website must start with http:// or https://';
    if (bio.length > 300) e.bio = 'Bio must be 300 characters or fewer.';
    return e;
  };

  const handleSave = () => {
    setLoading(true); setStatus('loading');
    window.setTimeout(() => { setLoading(false); setStatus('success'); setStatusMsg('Profile saved successfully.'); }, 700);
  };

  const handleSubmit = () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setLoading(true); setStatus('loading');
    window.setTimeout(() => { setLoading(false); setStatus('success'); setStatusMsg('Profile updated and published.'); }, 900);
  };

  return (
    <div className="page-stack">
      <div className="section-heading">
        <div><span className="eyebrow">Your account</span><h2>Profile settings</h2></div>
      </div>
      <FormSection title="Personal information" eyebrow="Identity">
        <div className="form-grid-2">
          <TextField id="pf-name" label="Full name" value={fullName} onChange={(v) => { setFullName(v); setErrors((c) => ({ ...c, fullName: undefined })); }}
            required error={errors.fullName} icon={<User size={16} />} />
          <TextField id="pf-email" label="Email address" value={email} onChange={(v) => { setEmail(v); setErrors((c) => ({ ...c, email: undefined })); }}
            required type="email" error={errors.email} icon={<Mail size={16} />} />
          <TextField id="pf-phone" label="Phone number" value={phone} onChange={setPhone}
            hint="For event reminders" icon={<Phone size={16} />} />
          <TextField id="pf-pronouns" label="Pronouns" value={pronouns} onChange={setPronouns} />
          <TextField id="pf-dob" label="Date of birth" value={birthDate} onChange={setBirthDate} type="date" icon={<Calendar size={16} />} />
          <TextField id="pf-location" label="Location" value={location} onChange={setLocation} icon={<MapPin size={16} />} />
        </div>
        <TextArea id="pf-bio" label="Bio" value={bio} onChange={(v) => { setBio(v); setErrors((c) => ({ ...c, bio: undefined })); }}
          maxLength={300} rows={3} error={errors.bio} hint="Shown on your public profile" />
      </FormSection>
      <FormSection title="Professional details" eyebrow="Background">
        <div className="form-grid-2">
          <TextField id="pf-org" label="Organization" value={org} onChange={setOrg} icon={<Building2 size={16} />} />
          <TextField id="pf-role" label="Role / title" value={role} onChange={setRole} icon={<Briefcase size={16} />} />
          <TextField id="pf-website" label="Website" value={website} onChange={(v) => { setWebsite(v); setErrors((c) => ({ ...c, website: undefined })); }}
            error={errors.website} icon={<Globe size={16} />} />
        </div>
      </FormSection>
      <FormSection title="Communication preferences" eyebrow="Notifications">
        <ToggleField id="pf-email-updates" label="Email updates" checked={emailUpdates} onChange={setEmailUpdates}
          hint="Receive event confirmations, reminders, and announcements." />
        <ToggleField id="pf-sms" label="SMS reminders" checked={smsReminders} onChange={setSmsReminders}
          hint="Get text reminders 24 hours before events start." />
        <ToggleField id="pf-public" label="Public profile" checked={publicProfile} onChange={setPublicProfile}
          hint="Allow other participants to view your profile." />
      </FormSection>
      <FormStatus status={status} message={statusMsg} />
      <FormActions onSave={handleSave} onSubmit={handleSubmit} onCancel={() => { setStatus('idle'); setStatusMsg(''); }}
        loading={loading} submitLabel="Save changes" saveLabel="Save draft" />
    </div>
  );
}
