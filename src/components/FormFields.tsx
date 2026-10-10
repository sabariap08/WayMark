import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, AlertCircle, Loader2 } from 'lucide-react';

type StatusState = 'idle' | 'loading' | 'success' | 'error';

export function FormStatus({ status, message }: { status: StatusState; message?: string }) {
  if (status === 'idle' || !message) return null;
  const cls = status === 'success' ? 'form-info' : 'form-error';
  const icon = status === 'success' ? <Check size={14} /> : <AlertCircle size={14} />;
  return <div className={cls}>{icon} {message}</div>;
}

export function FieldLabel({ label, required, hint, htmlFor }: { label: string; required?: boolean; hint?: string; htmlFor?: string }) {
  return (
    <div className="form-field-label-row">
      <label htmlFor={htmlFor}>{label}{required && <span className="form-req">*</span>}</label>
      {hint && <span className="form-hint">{hint}</span>}
    </div>
  );
}

export function TextField({
  id, label, value, onChange, placeholder, required, type = 'text',
  error, hint, disabled, icon,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; type?: string; error?: string;
  hint?: string; disabled?: boolean; icon?: ReactNode;
}) {
  return (
    <div className="form-field-group">
      <FieldLabel label={label} required={required} hint={hint} htmlFor={id} />
      <div className={`form-input-wrap ${error ? 'form-input-error' : ''} ${disabled ? 'form-input-disabled' : ''}`}>
        {icon}
        <input id={id} type={type} value={value} disabled={disabled}
          onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      </div>
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

export function TextArea({
  id, label, value, onChange, placeholder, required, rows = 4, error, hint, maxLength,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; rows?: number; error?: string;
  hint?: string; maxLength?: number;
}) {
  return (
    <div className="form-field-group">
      <FieldLabel label={label} required={required} hint={hint} htmlFor={id} />
      <textarea id={id} value={value} rows={rows} maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className={`form-textarea ${error ? 'form-textarea-error' : ''}`} />
      {maxLength && <span className="form-char-count">{value.length}/{maxLength}</span>}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

export function SelectInput({
  id, label, value, onChange, options, required, error, hint, disabled, icon,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  options: readonly string[] | string[]; required?: boolean; error?: string;
  hint?: string; disabled?: boolean; icon?: ReactNode;
}) {
  return (
    <div className="form-field-group">
      <FieldLabel label={label} required={required} hint={hint} htmlFor={id} />
      <div className={`form-input-wrap form-select-wrap ${error ? 'form-input-error' : ''} ${disabled ? 'form-input-disabled' : ''}`}>
        {icon}
        <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
        <ChevronDown size={16} className="form-select-chevron" />
      </div>
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

export function ToggleField({
  id, label, checked, onChange, hint,
}: {
  id: string; label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string;
}) {
  return (
    <div className="form-toggle-row">
      <button type="button" id={id} className={`form-toggle ${checked ? 'form-toggle-on' : ''}`}
        onClick={() => onChange(!checked)} aria-pressed={checked} aria-label={label}>
        <span className="form-toggle-knob" />
      </button>
      <div>
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </div>
    </div>
  );
}

export function RadioGroup({
  id, label, value, onChange, options, required, error, columns = 1,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string; detail?: string }[];
  required?: boolean; error?: string; columns?: 1 | 2 | 3 | 4;
}) {
  return (
    <div className="form-field-group">
      <FieldLabel label={label} required={required} />
      <div className={`form-radio-grid form-radio-cols-${columns}`}>
        {options.map((opt) => (
          <button type="button" key={opt.value} className={`form-radio-card ${value === opt.value ? 'form-radio-selected' : ''}`}
            onClick={() => onChange(opt.value)} data-group={id}>
            <span className={`form-radio-dot ${value === opt.value ? 'form-radio-dot-on' : ''}`} />
            <div>
              <strong>{opt.label}</strong>
              {opt.detail && <small>{opt.detail}</small>}
            </div>
          </button>
        ))}
      </div>
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

export function CheckboxField({
  id, label, checked, onChange, hint,
}: {
  id: string; label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string;
}) {
  return (
    <div className="form-checkbox-row">
      <button type="button" id={id} className={`form-checkbox ${checked ? 'form-checkbox-on' : ''}`}
        onClick={() => onChange(!checked)} aria-pressed={checked}>
        {checked && <Check size={13} strokeWidth={3} />}
      </button>
      <div>
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
    </div>
  );
}

export function ScoreInput({
  label, value, onChange, max = 10,
}: {
  label: string; value: number; onChange: (v: number) => void; max?: number;
}) {
  return (
    <div className="form-score-row">
      <span className="form-score-label">{label}</span>
      <div className="form-score-stars">
        {Array.from({ length: max }, (_, i) => (
          <button type="button" key={i} className={`form-score-btn ${i < value ? 'form-score-active' : ''}`}
            onClick={() => onChange(i + 1)} aria-label={`${i + 1} out of ${max}`}>
            <span className="form-score-pip" />
          </button>
        ))}
      </div>
      <span className="form-score-value">{value}/{max}</span>
    </div>
  );
}

export function FormActions({
  onSave, onCancel, onSubmit, submitLabel = 'Submit', saveLabel = 'Save draft',
  loading, showSave = true, showCancel = true, showSubmit = true,
}: {
  onSave?: () => void; onCancel?: () => void; onSubmit?: () => void;
  submitLabel?: string; saveLabel?: string;
  loading?: boolean; showSave?: boolean; showCancel?: boolean; showSubmit?: boolean;
}) {
  return (
    <div className="form-actions-bar">
      {showCancel && <button type="button" className="button button-secondary" onClick={onCancel}>Cancel</button>}
      <div className="form-actions-right">
        {showSave && <button type="button" className="button button-secondary" onClick={onSave} disabled={loading}>
          {loading ? <Loader2 size={15} className="form-spin" /> : null} {saveLabel}
        </button>}
        {showSubmit && <button type="button" className="button button-primary" onClick={onSubmit} disabled={loading}>
          {loading ? <Loader2 size={15} className="form-spin-light" /> : null} {submitLabel}
        </button>}
      </div>
    </div>
  );
}

export function FormSection({ title, children, eyebrow }: { title: string; children: ReactNode; eyebrow?: string }) {
  return (
    <div className="form-section">
      <div className="form-section-head">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h3>{title}</h3>
      </div>
      <div className="form-section-body">{children}</div>
    </div>
  );
}

export function FormPreviewCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="form-preview-card">
      <div className="form-preview-head">
        <span className="eyebrow">Preview</span>
        <h3>{title}</h3>
      </div>
      <div className="form-preview-body">{children}</div>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useValidation<T extends Record<string, string>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});

  const set = (key: keyof T, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const clearErrors = () => setErrors({});
  const setAllErrors = (errs: Partial<Record<keyof T, string>>) => setErrors(errs);

  return { values, errors, set, setAllErrors, clearErrors, setValues };
}
