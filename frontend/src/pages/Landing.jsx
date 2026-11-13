import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Award,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  ClipboardCheck,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
} from 'lucide-react'
import Brand from '../components/Brand'

const features = [
  {
    icon: CalendarDays,
    title: 'Events without the busywork',
    copy: 'Hosting requests, approvals, registration, waitlists, and attendance in one clean workflow.',
    span: 'wide',
  },
  {
    icon: Users,
    title: 'Every team in sync',
    copy: 'Volunteers, judges, hosts, and admins work from scoped views instead of shared spreadsheets.',
  },
  {
    icon: Workflow,
    title: 'A schedule that holds up',
    copy: 'Rooms, speakers, resources, and dependencies are checked for conflicts before you publish.',
  },
  {
    icon: Award,
    title: 'Certificates with proof',
    copy: 'Eligibility rules, batch issuing, and public verification without manual follow-up.',
  },
  {
    icon: ChartNoAxesCombined,
    title: 'Decisions, not dashboards',
    copy: 'Registration trends, attendance, budgets, and results surfaced where the work happens.',
    span: 'wide',
  },
  {
    icon: ShieldCheck,
    title: 'Built for real operations',
    copy: 'Audit trails, role separation, scoped guest links, and server-side payment verification.',
  },
]

const steps = [
  {
    number: '01',
    title: 'Set the stage',
    copy: 'Create the event, open registration, and give every team member the view they need.',
  },
  {
    number: '02',
    title: 'Run the day',
    copy: 'Check people in, manage sessions, resolve conflicts, and keep volunteers moving.',
  },
  {
    number: '03',
    title: 'Close the loop',
    copy: 'Release results, issue certificates, export reports, and learn from the numbers.',
  },
]

function ProductPreview() {
  return (
    <div className="product-preview" aria-label="WayMark dashboard preview">
      <div className="preview-chrome">
        <span className="preview-dot" />
        <span className="preview-dot" />
        <span className="preview-dot" />
        <span className="preview-url">waymark / overview</span>
      </div>
      <div className="preview-body">
        <div className="preview-rail">
          <span className="preview-brand-mark">
            <i />
            <i />
            <i />
          </span>
          <span className="preview-rail-line is-active" />
          <span className="preview-rail-line" />
          <span className="preview-rail-line" />
          <span className="preview-rail-line short" />
          <span className="preview-rail-line" />
        </div>
        <div className="preview-content">
          <div className="preview-topline">
            <div>
              <span className="preview-kicker">Overview</span>
              <strong>Good morning, Maya</strong>
            </div>
            <span className="preview-avatar">MK</span>
          </div>
          <div className="preview-stats">
            {[
              ['Events', '24', '+6 this month'],
              ['Registrations', '1,284', '82% capacity'],
              ['Check-ins', '936', '73% attended'],
            ].map(([label, value, detail]) => (
              <div className="preview-stat" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{detail}</small>
              </div>
            ))}
          </div>
          <div className="preview-chart-card">
            <div className="preview-card-head">
              <span>Registration trend</span>
              <span className="preview-pill">Last 6 months</span>
            </div>
            <div className="preview-chart">
              {[34, 48, 42, 63, 58, 82, 74, 92, 81, 100, 88, 96].map((height, index) => (
                <span key={index} style={{ height: `${height}%` }} />
              ))}
            </div>
          </div>
          <div className="preview-events">
            {[
              ['Design Systems Summit', 'May 18', 'Published', '82%'],
              ['Robotics Open Lab', 'May 24', 'Registration open', '64%'],
            ].map(([title, date, status, fill]) => (
              <div className="preview-event" key={title}>
                <span className="preview-event-mark" />
                <div>
                  <strong>{title}</strong>
                  <small>{date}</small>
                </div>
                <span className="preview-status">{status}</span>
                <span className="preview-progress">
                  <i style={{ width: fill }} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Landing() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <Brand />
        <nav className="landing-links" aria-label="Landing navigation">
          <a href="#product">Product</a>
          <a href="#workflow">Workflow</a>
          <a href="#security">Security</a>
        </nav>
        <div className="landing-actions">
          <Link className="btn btn-ghost" to="/login">
            Sign in
          </Link>
          <Link className="btn btn-primary" to="/signup">
            Get started
            <ArrowRight size={15} />
          </Link>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="hero-pill">
              <Sparkles size={14} />
              The operating system for intentional events
            </span>
            <h1>
              Run events like a <span className="hero-accent">product team.</span>
            </h1>
            <p className="hero-lede">
              WayMark brings hosting, registration, scheduling, volunteers, judging, certificates,
              and reporting into one calm workspace. Less chasing. More signal.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-primary btn-lg" to="/signup">
                Start with a demo workspace
                <ArrowRight size={16} />
              </Link>
              <a className="btn btn-secondary btn-lg" href="#product">
                See the product
              </a>
            </div>
            <div className="hero-proof">
              <span>
                <Check size={14} /> No credit card
              </span>
              <span>
                <Check size={14} /> Demo data included
              </span>
              <span>
                <Check size={14} /> Admin and member roles
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="hero-glow" />
            <ProductPreview />
            <div className="floating-card floating-card-one">
              <span className="floating-icon">
                <ClipboardCheck size={16} />
              </span>
              <div>
                <strong>Conflict checks</strong>
                <small>Schedules stay clean</small>
              </div>
            </div>
            <div className="floating-card floating-card-two">
              <span className="floating-icon is-green">
                <Award size={16} />
              </span>
              <div>
                <strong>Batch certificates</strong>
                <small>Issue and verify in one place</small>
              </div>
            </div>
          </div>
        </section>

        <section className="logo-strip" aria-label="Platform capabilities">
          <span>Hosting</span>
          <span>Registration</span>
          <span>Scheduling</span>
          <span>Volunteers</span>
          <span>Judging</span>
          <span>Certificates</span>
          <span>Analytics</span>
        </section>

        <section className="section-block" id="product">
          <div className="section-intro">
            <span className="eyebrow">One operating system</span>
            <h2>Everything the event needs. Nothing it doesn't.</h2>
            <p>
              The work is already complex. The tools shouldn't be. WayMark keeps each workflow
              focused, connected, and visible to the people who need it.
            </p>
          </div>

          <div className="feature-grid">
            {features.map((feature) => {
              const Icon = feature.icon
              return (
                <article className={`feature-card ${feature.span === 'wide' ? 'is-wide' : ''}`} key={feature.title}>
                  <span className="feature-icon">
                    <Icon size={19} strokeWidth={1.8} />
                  </span>
                  <h3>{feature.title}</h3>
                  <p>{feature.copy}</p>
                  <span className="feature-line" />
                </article>
              )
            })}
          </div>
        </section>

        <section className="workflow-block" id="workflow">
          <div className="workflow-copy">
            <span className="eyebrow">How it works</span>
            <h2>From first request to final report.</h2>
            <p>
              A single source of truth for the entire event lifecycle, with a human approval
              step wherever it matters.
            </p>
            <Link className="text-link" to="/login">
              Open the demo workspace <ArrowRight size={15} />
            </Link>
          </div>
          <div className="workflow-steps">
            {steps.map((step) => (
              <div className="workflow-step" key={step.number}>
                <span className="workflow-number">{step.number}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="security-block" id="security">
          <div className="security-panel">
            <span className="security-badge">
              <ShieldCheck size={16} />
              Operations-grade foundations
            </span>
            <h2>Designed for the messy middle.</h2>
            <p>
              Scoped guest access, role separation, audit history, and server-side verification
              are part of the product, not an afterthought.
            </p>
            <div className="security-list">
              <span>
                <Check size={15} /> Admin and normal-user roles
              </span>
              <span>
                <Check size={15} /> Scoped jury and volunteer links
              </span>
              <span>
                <Check size={15} /> Server-side payment checks
              </span>
              <span>
                <Check size={15} /> Complete audit trail
              </span>
            </div>
          </div>
          <div className="security-card">
            <span className="eyebrow">A calmer close</span>
            <strong>Results released</strong>
            <p>Certificates, reports, and feedback land in one place, ready to share.</p>
            <div className="security-bars">
              {[92, 74, 58, 86].map((width, index) => (
                <span key={index}>
                  <i style={{ width: `${width}%` }} />
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="cta-block">
          <div>
            <span className="eyebrow">Ready when you are</span>
            <h2>Give your events a better operating rhythm.</h2>
          </div>
          <div className="cta-actions">
            <Link className="btn btn-primary btn-lg" to="/signup">
              Create your workspace
              <ArrowRight size={16} />
            </Link>
            <Link className="btn btn-secondary btn-lg" to="/login">
              Sign in
            </Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <Brand />
        <span>Events with intention.</span>
        <span>Built with Flask, React, and a lot of checklists.</span>
      </footer>
    </div>
  )
}
