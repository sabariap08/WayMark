import { ShieldAlert } from 'lucide-react'

export default function ModuleAccess({ title = 'Host access required', description, action }) {
  return (
    <section className="panel module-access">
      <span className="module-access-icon">
        <ShieldAlert size={21} />
      </span>
      <div className="module-access-copy">
        <h2>{title}</h2>
        <p>
          {description ||
            'This workspace is available to event hosts and administrators. Ask an admin for access or host an event to get started.'}
        </p>
      </div>
      {action}
    </section>
  )
}
