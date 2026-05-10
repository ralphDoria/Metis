// Stacked insight cards rendered inside the in-page overlay. Newest on top,
// capped at MAX_CARDS so unlimited demo replays don't blow out memory.

import type { ScoreLabel } from '../shared/types'

export const MAX_CARDS = 20

export interface Card {
  id: string
  label: ScoreLabel
  score: number
  primaryPattern?: string
  feedback?: string
  action: 'watched' | 'skipped' | 'failed'
  at: number
}

export function CardList({ cards }: { cards: Card[] }) {
  if (cards.length === 0) {
    return (
      <div className="metis-overlay__empty">Click “Run demo” in the popup to begin.</div>
    )
  }
  return (
    <div className="metis-overlay__list">
      {cards.map((c) => (
        <CardRow key={c.id} card={c} />
      ))}
    </div>
  )
}

function CardRow({ card }: { card: Card }) {
  const cls = [
    'metis-overlay__card',
    `metis-overlay__card--${card.label}`,
    card.action === 'failed' ? 'metis-overlay__card--failed' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={cls}>
      <div className="metis-overlay__card-row">
        <span className="metis-overlay__card-label">
          {card.label.toUpperCase()} · {(card.score * 100).toFixed(0)}%
        </span>
        <span className={`metis-overlay__card-action metis-overlay__card-action--${card.action}`}>
          {card.action.toUpperCase()}
        </span>
      </div>
      <div className="metis-overlay__card-title">{card.primaryPattern ?? 'Captured response'}</div>
      {card.feedback && <div className="metis-overlay__card-feedback">{card.feedback}</div>}
      <div className="metis-overlay__meter">
        <span style={{ width: `${Math.max(8, Math.min(100, Math.round(card.score * 100)))}%` }} />
      </div>
    </div>
  )
}
