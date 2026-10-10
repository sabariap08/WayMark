import { useState } from 'react';
import { Award, Check, Gavel, Plus, Search, Trash2, User, X } from 'lucide-react';
import { Badge, SectionHeading } from '@/components/ui';
import { FormActions, FormSection, FormStatus, ScoreInput, SelectInput, TextField, ToggleField } from '@/components/FormFields';

type FormStatusState = 'idle' | 'loading' | 'success' | 'error';

// =================== Jury Management Form ===================

type JuryMember = { id: string; name: string; email: string; expertise: string; status: string };

export function JuryManagementForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [expertise, setExpertise] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [status, setStatus] = useState<FormStatusState>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<JuryMember[]>([
    { id: '1', name: 'Dr. Sarah Lin', email: 'sarah.lin@univ.edu', expertise: 'AI & Machine Learning', status: 'Confirmed' },
    { id: '2', name: 'Marcus Webb', email: 'marcus.webb@studio.co', expertise: 'Product Design', status: 'Pending' },
    { id: '3', name: 'Prof. Aisha Rahman', email: 'a.rahman@inst.org', expertise: 'Sustainability', status: 'Confirmed' },
  ]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required.';
    if (!email.trim()) e.email = 'Email is required.';
    else if (!/^\S+@\S+\.\S+$/.test(email)) e.email = 'Enter a valid email address.';
    if (!expertise) e.expertise = 'Please select an area of expertise.';
    return e;
  };

  const handleAdd = () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      setMembers((prev) => [...prev, { id: String(Date.now()), name, email, expertise, status: 'Pending' }]);
      setName(''); setEmail(''); setExpertise('');
      setStatus('success'); setStatusMsg('Jury member added and invitation sent.');
    }, 600);
  };

  const handleRemove = (id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <div className="page-stack">
      <SectionHeading eyebrow="Administration" title="Jury management" />
      <FormSection title="Add jury member" eyebrow="Invite">
        <div className="form-grid-2">
          <TextField id="jm-name" label="Full name" value={name} onChange={(v) => { setName(v); setErrors((c) => ({ ...c, name: undefined })); }}
            required error={errors.name} icon={<User size={16} />} />
          <TextField id="jm-email" label="Email address" value={email} onChange={(v) => { setEmail(v); setErrors((c) => ({ ...c, email: undefined })); }}
            required type="email" error={errors.email} />
        </div>
        <SelectInput id="jm-expertise" label="Area of expertise" value={expertise}
          onChange={(v) => { setExpertise(v); setErrors((c) => ({ ...c, expertise: undefined })); }}
          required error={errors.expertise}
          options={['Select...', 'AI & Machine Learning', 'Product Design', 'Sustainability', 'Civic Tech', 'Business & Strategy', 'Research', 'Other']} />
        <FormStatus status={status} message={statusMsg} />
        <button type="button" className="button button-primary" onClick={handleAdd} disabled={loading}>
          <Plus size={15} /> Add member
        </button>
      </FormSection>
      <FormSection title="Current jury" eyebrow="Roster">
        <div className="jury-list">
          {members.map((m) => (
            <div className="jury-row" key={m.id}>
              <div className="jury-avatar">{m.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}</div>
              <div className="jury-info">
                <strong>{m.name}</strong>
                <span>{m.email} · {m.expertise}</span>
              </div>
              <Badge tone={m.status === 'Confirmed' ? 'green' : 'amber'}>{m.status}</Badge>
              <button className="jury-remove" onClick={() => handleRemove(m.id)} aria-label="Remove member"><X size={16} /></button>
            </div>
          ))}
        </div>
      </FormSection>
    </div>
  );
}

// =================== Jury Assignment Form ===================

export function JuryAssignmentForm() {
  const [event, setEvent] = useState('Zero Origin Hackathon');
  const [track, setTrack] = useState('All tracks');
  const [panelSize, setPanelSize] = useState('3');
  const [search, setSearch] = useState('');
  const [assigned, setAssigned] = useState<string[]>(['1', '3']);
  const [status, setStatus] = useState<FormStatusState>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const pool: JuryMember[] = [
    { id: '1', name: 'Dr. Sarah Lin', email: 'sarah.lin@univ.edu', expertise: 'AI & Machine Learning', status: 'Confirmed' },
    { id: '2', name: 'Marcus Webb', email: 'marcus.webb@studio.co', expertise: 'Product Design', status: 'Pending' },
    { id: '3', name: 'Prof. Aisha Rahman', email: 'a.rahman@inst.org', expertise: 'Sustainability', status: 'Confirmed' },
    { id: '4', name: 'Daniel Cho', email: 'daniel.cho@tech.io', expertise: 'Civic Tech', status: 'Confirmed' },
    { id: '5', name: 'Elena Vasquez', email: 'elena@startup.co', expertise: 'Business & Strategy', status: 'Confirmed' },
  ];

  const filtered = pool.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));
  const toggleAssign = (id: string) => {
    setAssigned((prev) => prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]);
  };

  const handleSubmit = () => {
    if (assigned.length === 0) { setStatus('error'); setStatusMsg('At least one jury member must be assigned.'); return; }
    setLoading(true); setStatus('loading');
    window.setTimeout(() => { setLoading(false); setStatus('success'); setStatusMsg(`${assigned.length} jury members assigned to ${event}.`); }, 800);
  };

  if (status === 'success') {
    return (
      <div className="form-success-screen">
        <div className="success-icon"><Gavel size={24} /></div>
        <h3>Jury panel assigned</h3>
        <p>{statusMsg}</p>
        <button className="button button-secondary" onClick={() => { setStatus('idle'); setStatusMsg(''); }}>Assign another panel</button>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <SectionHeading eyebrow="Administration" title="Jury assignment" />
      <FormSection title="Assignment details" eyebrow="Configure">
        <div className="form-grid-2">
          <SelectInput id="ja-event" label="Event" value={event} onChange={setEvent}
            options={['Zero Origin Hackathon', 'Campus Sustainability Summit', 'AI Ethics Roundtable']} />
          <SelectInput id="ja-track" label="Track / category" value={track} onChange={setTrack}
            options={['All tracks', 'AI & ML', 'Sustainability', 'Civic tech']} />
          <SelectInput id="ja-panel" label="Panel size" value={panelSize} onChange={setPanelSize}
            options={['1', '2', '3', '4', '5', '6']} />
        </div>
      </FormSection>
      <FormSection title="Select jury members" eyebrow="Assign">
        <div className="form-input-wrap jury-search">
          <Search size={16} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search jury members..." />
        </div>
        <div className="jury-assign-list">
          {filtered.map((m) => (
            <button type="button" key={m.id} className={`jury-assign-row ${assigned.includes(m.id) ? 'assigned' : ''}`}
              onClick={() => toggleAssign(m.id)}>
              <div className="jury-avatar">{m.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}</div>
              <div className="jury-info">
                <strong>{m.name}</strong>
                <span>{m.expertise}</span>
              </div>
              <span className={`jury-check ${assigned.includes(m.id) ? 'checked' : ''}`}>
                {assigned.includes(m.id) && <Check size={14} strokeWidth={3} />}
              </span>
            </button>
          ))}
        </div>
        <div className="jury-assign-count">
          <strong>{assigned.length}</strong> member(s) assigned
        </div>
      </FormSection>
      <FormStatus status={status} message={statusMsg} />
      <FormActions onSubmit={handleSubmit} loading={loading} submitLabel="Assign jury panel" showSave={false} />
    </div>
  );
}

// =================== Rubric Creation Form ===================

type Criterion = { id: string; name: string; description: string; weight: number; maxScore: number };

export function RubricForm() {
  const [rubricName, setRubricName] = useState('');
  const [event, setEvent] = useState('Zero Origin Hackathon');
  const [criteria, setCriteria] = useState<Criterion[]>([
    { id: '1', name: 'Innovation', description: 'Originality and creativity of the solution', weight: 30, maxScore: 10 },
    { id: '2', name: 'Technical execution', description: 'Quality of implementation and code', weight: 30, maxScore: 10 },
    { id: '3', name: 'Impact', description: 'Potential real-world impact', weight: 25, maxScore: 10 },
    { id: '4', name: 'Presentation', description: 'Clarity and effectiveness of the pitch', weight: 15, maxScore: 10 },
  ]);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [status, setStatus] = useState<FormStatusState>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);

  const addCriterion = () => {
    setCriteria((prev) => [...prev, { id: String(Date.now()), name: '', description: '', weight: 10, maxScore: 10 }]);
  };
  const updateCriterion = (id: string, field: keyof Criterion, value: string | number) => {
    setCriteria((prev) => prev.map((c) => c.id === id ? { ...c, [field]: value } : c));
  };
  const removeCriterion = (id: string) => {
    setCriteria((prev) => prev.filter((c) => c.id !== id));
  };

  const handleSubmit = () => {
    const e: Record<string, string> = {};
    if (!rubricName.trim()) e.rubricName = 'Rubric name is required.';
    if (criteria.length === 0) e.criteria = 'At least one criterion is required.';
    if (totalWeight !== 100) e.weight = `Weights must total 100% (currently ${totalWeight}%).`;
    if (criteria.some((c) => !c.name.trim())) e.criteriaName = 'All criteria must have a name.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setLoading(true); setStatus('loading');
    window.setTimeout(() => { setLoading(false); setStatus('success'); setStatusMsg('Rubric created and linked to event.'); }, 800);
  };

  if (status === 'success') {
    return (
      <div className="form-success-screen">
        <div className="success-icon"><Award size={24} /></div>
        <h3>Rubric created</h3>
        <p>{statusMsg}</p>
        <button className="button button-secondary" onClick={() => { setStatus('idle'); setRubricName(''); }}>Create another</button>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <SectionHeading eyebrow="Evaluation" title="Create rubric" />
      <FormSection title="Rubric details" eyebrow="Setup">
        <TextField id="rb-name" label="Rubric name" value={rubricName}
          onChange={(v) => { setRubricName(v); setErrors((c) => ({ ...c, rubricName: undefined })); }}
          required error={errors.rubricName} placeholder="e.g. Hackathon judging criteria" />
        <SelectInput id="rb-event" label="Linked event" value={event} onChange={setEvent}
          options={['Zero Origin Hackathon', 'Campus Sustainability Summit', 'AI Ethics Roundtable']} />
      </FormSection>
      <FormSection title="Scoring criteria" eyebrow="Dimensions">
        {errors.criteria && <div className="form-error">{errors.criteria}</div>}
        {errors.criteriaName && <div className="form-error">{errors.criteriaName}</div>}
        <div className="rubric-list">
          {criteria.map((c, i) => (
            <div className="rubric-row" key={c.id}>
              <div className="rubric-row-num">{i + 1}</div>
              <div className="rubric-row-body">
                <input className="rubric-input" value={c.name} placeholder="Criterion name"
                  onChange={(e) => updateCriterion(c.id, 'name', e.target.value)} />
                <input className="rubric-input rubric-input-desc" value={c.description} placeholder="Description"
                  onChange={(e) => updateCriterion(c.id, 'description', e.target.value)} />
                <div className="rubric-row-meta">
                  <label>Weight: <input type="number" value={c.weight} min={0} max={100}
                    onChange={(e) => updateCriterion(c.id, 'weight', Number(e.target.value))} />%</label>
                  <label>Max: <input type="number" value={c.maxScore} min={1} max={20}
                    onChange={(e) => updateCriterion(c.id, 'maxScore', Number(e.target.value))} /></label>
                </div>
              </div>
              <button className="jury-remove" onClick={() => removeCriterion(c.id)} aria-label="Remove criterion"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <div className={`rubric-weight-total ${totalWeight !== 100 ? 'weight-error' : ''}`}>
          Total weight: <strong>{totalWeight}%</strong> {totalWeight !== 100 && <span>(must equal 100%)</span>}
        </div>
        {errors.weight && <span className="field-error">{errors.weight}</span>}
        <button type="button" className="button button-secondary" onClick={addCriterion}><Plus size={15} /> Add criterion</button>
      </FormSection>
      <FormStatus status={status} message={statusMsg} />
      <FormActions onSubmit={handleSubmit} loading={loading} submitLabel="Create rubric" saveLabel="Save draft" />
    </div>
  );
}

// =================== Jury Scoring Form ===================

export function ScoringForm() {
  const [submission, setSubmission] = useState('Team Nexus — CarbonTrace');
  const [scores, setScores] = useState<Record<string, number>>({ '1': 0, '2': 0, '3': 0, '4': 0 });
  const [overallComment, setOverallComment] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [conflict, setConflict] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [status, setStatus] = useState<FormStatusState>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const criteria = [
    { id: '1', name: 'Innovation', max: 10, weight: '30%' },
    { id: '2', name: 'Technical execution', max: 10, weight: '30%' },
    { id: '3', name: 'Impact', max: 10, weight: '25%' },
    { id: '4', name: 'Presentation', max: 10, weight: '15%' },
  ];
  const totalScore = criteria.reduce((sum, c) => sum + (scores[c.id] || 0), 0);
  const maxTotal = criteria.reduce((sum, c) => sum + c.max, 0);

  const handleSubmit = () => {
    const e: Record<string, string> = {};
    criteria.forEach((c) => {
      if (!scores[c.id] || scores[c.id] === 0) e[`score-${c.id}`] = `Please score ${c.name}.`;
    });
    if (!recommendation) e.recommendation = 'Please select a recommendation.';
    if (!conflict && !overallComment.trim()) e.comment = 'Please provide overall feedback.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setLoading(true); setStatus('loading');
    window.setTimeout(() => { setLoading(false); setStatus('success'); setStatusMsg('Scores submitted successfully.'); }, 800);
  };

  const handleSave = () => {
    setLoading(true);
    window.setTimeout(() => { setLoading(false); setStatus('success'); setStatusMsg('Scores saved as draft.'); }, 500);
  };

  if (status === 'success') {
    return (
      <div className="form-success-screen">
        <div className="success-icon"><Check size={24} /></div>
        <h3>Scores submitted</h3>
        <p>{statusMsg}</p>
        <button className="button button-secondary" onClick={() => { setStatus('idle'); setScores({ '1': 0, '2': 0, '3': 0, '4': 0 }); setOverallComment(''); setRecommendation(''); }}>Score next submission</button>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <SectionHeading eyebrow="Evaluation" title="Score submission" />
      <FormSection title="Submission" eyebrow="Review">
        <SelectInput id="sc-submission" label="Submission" value={submission} onChange={setSubmission}
          options={['Team Nexus — CarbonTrace', 'Team Spark — EduFlow', 'Team Aurora — GreenGrid', 'Team Forge — CivicPulse']} />
        <div className="scoring-submission-info">
          <div><span className="eyebrow">Team</span><strong>Team Nexus</strong></div>
          <div><span className="eyebrow">Track</span><strong>Sustainability</strong></div>
          <div><span className="eyebrow">Submitted</span><strong>Oct 18, 6:02 PM</strong></div>
        </div>
      </FormSection>
      <FormSection title="Scoring" eyebrow="Rubric">
        <div className="scoring-list">
          {criteria.map((c) => (
            <div className="scoring-item" key={c.id}>
              <div className="scoring-item-head">
                <strong>{c.name}</strong>
                <span>Weight: {c.weight}</span>
              </div>
              <ScoreInput label="Score" value={scores[c.id] || 0} max={c.max}
                onChange={(v) => { setScores((prev) => ({ ...prev, [c.id]: v })); setErrors((prev) => ({ ...prev, [`score-${c.id}`]: undefined })); }} />
              {errors[`score-${c.id}`] && <span className="field-error">{errors[`score-${c.id}`]}</span>}
            </div>
          ))}
        </div>
        <div className="scoring-total">Total: <strong>{totalScore}/{maxTotal}</strong></div>
      </FormSection>
      <FormSection title="Overall assessment" eyebrow="Feedback">
        <div className="form-field-group">
          <div className="form-field-label-row"><label>Recommendation<span className="form-req">*</span></label></div>
          <div className="form-radio-grid form-radio-cols-3">
            {['Winner', 'Runner-up', 'Honorable mention'].map((r) => (
              <button type="button" key={r} className={`form-radio-card ${recommendation === r ? 'form-radio-selected' : ''}`}
                onClick={() => { setRecommendation(r); setErrors((c) => ({ ...c, recommendation: undefined })); }}>
                <span className={`form-radio-dot ${recommendation === r ? 'form-radio-dot-on' : ''}`} />
                <div><strong>{r}</strong></div>
              </button>
            ))}
          </div>
          {errors.recommendation && <span className="field-error">{errors.recommendation}</span>}
        </div>
        <div className="form-field-group">
          <div className="form-field-label-row"><label>Overall comments<span className="form-req">*</span></label></div>
          <textarea className="form-textarea" value={overallComment} rows={4}
            onChange={(e) => { setOverallComment(e.target.value); setErrors((c) => ({ ...c, comment: undefined })); }}
            placeholder="Provide summary feedback for the team..." />
          {errors.comment && <span className="field-error">{errors.comment}</span>}
        </div>
        <ToggleField id="sc-conflict" label="I have a conflict of interest with this team" checked={conflict} onChange={setConflict}
          hint="If yes, your scores will be excluded from the final tally." />
      </FormSection>
      <FormStatus status={status} message={statusMsg} />
      <FormActions onSave={handleSave} onSubmit={handleSubmit} loading={loading}
        submitLabel="Submit scores" saveLabel="Save draft" />
    </div>
  );
}
