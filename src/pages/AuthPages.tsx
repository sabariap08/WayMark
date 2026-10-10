import { FormEvent, useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';

function WaymarkBrand() {
  return <Link className="auth-brand" to="/"><span className="brand-mark"><i /><i /><i /></span><span>waymark</span></Link>;
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return <main className="auth-page"><div className="auth-visual"><div className="auth-visual-top"><WaymarkBrand /><span className="auth-pill"><ShieldCheck size={13} /> Built for meaningful participation</span></div><div className="auth-quote"><div className="quote-mark">“</div><h1>Every event is a chance to leave a mark.</h1><p>WayMark carries one participant record through discovery, registration, attendance, evaluation, and beyond.</p><div className="quote-footer"><span className="quote-line" /><span>One journey. Many possibilities.</span></div></div><div className="auth-orbit orbit-one" /><div className="auth-orbit orbit-two" /><div className="auth-visual-footer"><span>WAYMARK PLATFORM</span><span>Events with intention</span></div></div><section className="auth-form-side"><div className="auth-form-wrap">{children}<p className="auth-legal">By continuing, you agree to WayMark's terms and privacy policy.</p></div></section></main>;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resetMessage, setResetMessage] = useState('');

  const validate = () => {
    const nextErrors: { email?: string; password?: string } = {};
    if (!email.trim()) nextErrors.email = 'Enter the email address you use for WayMark.';
    else if (!/^\S+@\S+\.\S+$/.test(email)) nextErrors.email = 'Enter a valid email address.';
    if (!password) nextErrors.password = 'Enter your password.';
    else if (password.length < 8) nextErrors.password = 'Your password must be at least 8 characters.';
    return nextErrors;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResetMessage('');
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setLoading(true);
    window.setTimeout(() => { setLoading(false); setSuccess(true); }, 850);
  };

  return <AuthShell><div className="auth-heading"><div className="auth-mobile-brand"><WaymarkBrand /></div><div className="eyebrow">Welcome back</div><h2>Sign in to WayMark</h2><p>Continue your event journey from wherever you left off.</p></div>{success ? <div className="auth-success"><div className="success-icon"><ShieldCheck size={24} /></div><h3>You're ready to go.</h3><p>This demo sign-in is complete. Continue to your workspace to explore WayMark.</p><Button onClick={() => navigate('/')} icon={<ArrowRight size={16} />}>Continue to workspace</Button></div> : <form className="auth-form" onSubmit={handleSubmit} noValidate><div className="field-group"><label htmlFor="email">Email address</label><div className={`auth-input ${errors.email ? 'input-error' : ''}`}><Mail size={17} /><input id="email" type="email" value={email} onChange={(event) => { setEmail(event.target.value); setErrors((current) => ({ ...current, email: undefined, form: undefined })); }} placeholder="you@example.com" autoComplete="email" aria-invalid={Boolean(errors.email)} /> </div>{errors.email && <span className="field-error">{errors.email}</span>}</div><div className="field-group"><div className="field-label-row"><label htmlFor="password">Password</label><Link to="/password-reset">Forgot password?</Link></div><div className={`auth-input ${errors.password ? 'input-error' : ''}`}><LockKeyhole size={17} /><input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => { setPassword(event.target.value); setErrors((current) => ({ ...current, password: undefined, form: undefined })); }} placeholder="Enter your password" autoComplete="current-password" aria-invalid={Boolean(errors.password)} /><button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>{errors.password && <span className="field-error">{errors.password}</span>}</div>{errors.form && <div className="form-error">{errors.form}</div>}{resetMessage && <div className="form-info">{resetMessage}</div>}<Button className="auth-submit" onClick={() => undefined}>{loading ? <><span className="loading-spinner" /> Signing in...</> : <>Sign in <ArrowRight size={16} /></>}</Button><div className="auth-divider"><span>or</span></div><button type="button" className="demo-button" onClick={() => { setEmail('maya@waymark.events'); setPassword('waymark-demo'); setErrors({}); }}>Use demo account <span>maya@waymark.events</span></button></form>}<div className="auth-switch">New to WayMark? <Link to="/signup">Create an account <ArrowRight size={14} /></Link></div>{resetMessage === '' && <button className="auth-help" onClick={() => setResetMessage('Password reset is ready for the next authentication step. You can continue exploring the frontend for now.')}>Need help signing in?</button>}</AuthShell>;
}

import { SignupForm } from '@/pages/forms/ProfileForms';

export function SignupPage() {
  return (
    <AuthShell>
      <div className="auth-heading">
        <div className="auth-mobile-brand">
          <WaymarkBrand />
        </div>
        <div className="eyebrow">Start your journey</div>
        <h2>Create your WayMark account</h2>
        <p>One account for discovering, hosting, and showing up.</p>
      </div>
      <SignupForm />
      <div className="auth-switch">
        Already have a WayMark account? <Link to="/login">Sign in <ArrowRight size={14} /></Link>
      </div>
    </AuthShell>
  );
}

export function PasswordResetPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  return (
    <AuthShell>
      <div className="auth-heading">
        <div className="auth-mobile-brand">
          <WaymarkBrand />
        </div>
        <div className="eyebrow">Account recovery</div>
        <h2>Reset your password</h2>
        <p>Enter your email address to receive a secure password reset link.</p>
      </div>
      {sent ? (
        <div className="auth-success">
          <div className="success-icon"><Mail size={24} /></div>
          <h3>Reset link sent</h3>
          <p>We've sent a password reset email to <strong>{email}</strong>. Check your inbox to continue.</p>
          <Link className="button button-primary" to="/login"><ArrowLeft size={16} /> Return to sign in</Link>
        </div>
      ) : (
        <form className="auth-form" onSubmit={(e) => { e.preventDefault(); if (email) setSent(true); }}>
          <div className="field-group">
            <label htmlFor="reset-email">Email address</label>
            <div className="auth-input">
              <Mail size={17} />
              <input id="reset-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
            </div>
          </div>
          <Button className="auth-submit">Send reset link <ArrowRight size={16} /></Button>
        </form>
      )}
      <div className="auth-switch">
        Remembered your password? <Link to="/login">Sign in <ArrowRight size={14} /></Link>
      </div>
    </AuthShell>
  );
}

export function AuthPlaceholder({ mode }: { mode: 'signup' | 'reset' }) {
  if (mode === 'signup') return <SignupPage />;
  return <PasswordResetPage />;
}

