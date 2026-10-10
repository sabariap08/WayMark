import type { ReactNode } from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { BadgeTone, EventItem } from '@/types';

export function Badge({ children, tone = 'slate' }: { children: string; tone?: BadgeTone }) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}

export function Button({ children, variant = 'primary', onClick, icon, className = '' }: { children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; onClick?: () => void; icon?: ReactNode; className?: string }) {
  return <button className={`button button-${variant} ${className}`} onClick={onClick}>{icon}{children}</button>;
}

export function StatCard({ label, value, detail, icon: Icon, accent }: { label: string; value: string; detail: string; icon: LucideIcon; accent: 'blue' | 'teal' | 'amber' | 'rose' }) {
  return <div className="stat-card"><div className={`stat-icon stat-${accent}`}><Icon size={19} strokeWidth={2} /></div><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div><ChevronRight className="stat-arrow" size={17} /></div>;
}

export function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return <div className="section-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2>{title}</h2></div>{action}</div>;
}

export function EventRow({ event, onOpen }: { event: EventItem; onOpen: () => void }) {
  return <button className="event-row" onClick={onOpen}><div className={`event-thumb ${event.color}`}>{event.initials}</div><div className="event-row-main"><div className="event-row-title"><strong>{event.title}</strong><Badge tone={event.tone}>{event.status}</Badge></div><span>{event.category} · {event.date} · {event.time}</span><small>{event.location} · {event.seats}</small></div><ChevronRight size={18} className="row-chevron" /></button>;
}

export function EmptyView({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-view"><div className="empty-icon"><FileText size={22} /></div><h3>{title}</h3><p>{description}</p>{action}</div>;
}
