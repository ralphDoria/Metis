export type LoopStatus = 'recording' | 'analyzing' | 'idle'

export function StatusBadge({ status }: { status: LoopStatus }) {
  return (
    <header className="metis-overlay__header">
      <span className={`metis-overlay__dot metis-overlay__dot--${status}`} />
      <span className="metis-overlay__badge-text">{labelFor(status)}</span>
      <span className="metis-overlay__brand">Metis · Demo</span>
    </header>
  )
}

function labelFor(s: LoopStatus): string {
  switch (s) {
    case 'recording':
      return 'Live'
    case 'analyzing':
      return 'Analyzing'
    case 'idle':
      return 'Idle'
  }
}
