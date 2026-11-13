export default function EventSelect({
  events = [],
  value,
  onChange,
  label = 'Event',
  placeholder = 'Select an event',
  allowAll = false,
  allLabel = 'All events',
}) {
  const known = events.some((event) => String(event.id) === String(value))

  return (
    <label className="module-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {allowAll && <option value="">{allLabel}</option>}
        {!allowAll && !known && <option value="">{placeholder}</option>}
        {events.map((event) => (
          <option key={event.id} value={event.id}>
            {event.title}
          </option>
        ))}
      </select>
    </label>
  )
}
