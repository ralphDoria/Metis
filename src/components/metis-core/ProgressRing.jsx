import './ProgressRing.css'

export default function ProgressRing({
  value = 0,           // 0..1
  size = 220,
  thickness = 14,
  label = 'Time Reclaimed',
  primary,             // big number (string)
  secondary,           // sub label
}) {
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(1, value))
  const dash = c * clamped
  const tone = clamped >= 0.85 ? 'amber' : clamped >= 0.55 ? 'transition' : 'amethyst'

  return (
    <div className={`metis-ring metis-ring--${tone}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <defs>
          <linearGradient id="metis-ring-amethyst" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#a06bf0" />
            <stop offset="60%" stopColor="#8a2be2" />
            <stop offset="100%" stopColor="#5b1aa6" />
          </linearGradient>
          <linearGradient id="metis-ring-transition" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#a06bf0" />
            <stop offset="55%" stopColor="#f472b6" />
            <stop offset="100%" stopColor="#ff8c00" />
          </linearGradient>
          <linearGradient id="metis-ring-amber" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffd9a8" />
            <stop offset="50%" stopColor="#ff8c00" />
            <stop offset="100%" stopColor="#f472b6" />
          </linearGradient>
          <filter id="metis-ring-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#metis-ring-${tone})`}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          filter="url(#metis-ring-glow)"
        />
      </svg>
      <div className="metis-ring__center">
        <span className="metis-ring__primary">{primary}</span>
        {secondary && <span className="metis-ring__secondary">{secondary}</span>}
        <span className="metis-ring__label">{label}</span>
      </div>
    </div>
  )
}
