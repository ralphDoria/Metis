import './ParentalToggle.css'

export default function ParentalToggle({ enabled, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={`metis-parental ${enabled ? 'is-on' : ''}`}
    >
      <span className="metis-parental__track">
        <span className="metis-parental__thumb" />
      </span>
      <span className="metis-parental__label">
        <span className="metis-parental__title">
          {enabled ? 'Monitoring Mode' : 'Personal View'}
        </span>
        <span className="metis-parental__sub">
          {enabled ? 'Managed sub-account' : 'Switch to view a child profile'}
        </span>
      </span>
    </button>
  )
}
