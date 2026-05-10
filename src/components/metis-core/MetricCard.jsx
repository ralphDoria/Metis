import './MetricCard.css'

function Sparkline({ points = [], stroke = '#a06bf0' }) {
  if (!points.length) return null
  const w = 200, h = 56, pad = 4
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const step = (w - pad * 2) / (points.length - 1)
  const path = points
    .map((v, i) => {
      const x = pad + i * step
      const y = h - pad - ((v - min) / range) * (h - pad * 2)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
  const last = points[points.length - 1]
  const lastX = pad + (points.length - 1) * step
  const lastY = h - pad - ((last - min) / range) * (h - pad * 2)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="metis-metric__spark" aria-hidden>
      <path d={`${path} L ${w - pad} ${h} L ${pad} ${h} Z`} fill={stroke} opacity="0.10" />
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="3" fill={stroke} />
      <circle cx={lastX} cy={lastY} r="6" fill={stroke} opacity="0.25" />
    </svg>
  )
}

function Bars({ buckets = [] }) {
  const max = Math.max(...buckets.map((b) => b.value), 1)
  return (
    <div className="metis-metric__bars">
      {buckets.map((b) => (
        <div key={b.label} className="metis-metric__bar-row">
          <span className="metis-metric__bar-label">{b.label}</span>
          <span className="metis-metric__bar-track">
            <span
              className={`metis-metric__bar-fill metis-metric__bar-fill--${b.tone || 'amethyst'}`}
              style={{ width: `${(b.value / max) * 100}%` }}
            />
          </span>
          <span className="metis-metric__bar-value">{b.value}%</span>
        </div>
      ))}
    </div>
  )
}

export default function MetricCard({
  title,
  caption,
  value,
  delta,
  variant = 'spark', // 'spark' | 'bars'
  points,
  buckets,
  tone = 'amethyst',
}) {
  const stroke = tone === 'amber' ? '#ff8c00' : tone === 'rose' ? '#f472b6' : '#a06bf0'
  const deltaTone = (delta ?? 0) <= 0 ? 'good' : 'warn'
  return (
    <article className={`metis-metric metis-metric--${tone}`}>
      <header className="metis-metric__head">
        <div>
          <h4 className="metis-metric__title">{title}</h4>
          {caption && <p className="metis-metric__caption">{caption}</p>}
        </div>
        {value !== undefined && (
          <div className="metis-metric__value-wrap">
            <span className="metis-metric__value">{value}</span>
            {delta !== undefined && (
              <span className={`metis-metric__delta metis-metric__delta--${deltaTone}`}>
                {delta > 0 ? '+' : ''}
                {delta}%
              </span>
            )}
          </div>
        )}
      </header>
      {variant === 'spark' && <Sparkline points={points} stroke={stroke} />}
      {variant === 'bars' && <Bars buckets={buckets} />}
    </article>
  )
}
