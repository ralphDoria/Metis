// Top-level overlay component. Listens for runtime messages from the SW and
// renders the brain panel + status + card stack.
//
// Message contract:
//   - `demo_result` { result }: full /demo response. We split the response
//     into a verdict card + per-pattern cards and stagger them in.
//   - `reset_demo`: wipe local state.
//   - `verdict` / `verdict_failed`: legacy live-recording hooks; routed into
//     the same card stack so this overlay still works if recording is
//     re-enabled.
//   - `loop_status`: live status passthrough.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Msg, ProcessResponse } from '../shared/types'
import { BrainPanel } from './BrainPanel'
import { CardList, MAX_CARDS, type Card } from './CardList'
import { StatusBadge, type LoopStatus } from './StatusBadge'

const STAGGER_MS = 700

function clipId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function fanOut(result: ProcessResponse): Card[] {
  const cards: Card[] = []
  cards.push({
    id: clipId(),
    label: result.label,
    score: result.score,
    primaryPattern: 'Overall verdict',
    feedback: result.feedback,
    action: 'watched',
    at: Date.now(),
  })
  for (const p of result.patterns ?? []) {
    cards.push({
      id: clipId(),
      label: result.label,
      score: p.confidence,
      primaryPattern: p.label,
      feedback: p.description,
      action: 'watched',
      at: Date.now(),
    })
  }
  return cards
}

export function App() {
  const [cards, setCards] = useState<Card[]>([])
  const [brain, setBrain] = useState<Record<string, unknown> | null>(null)
  const [status, setStatus] = useState<LoopStatus>('idle')
  // Pending stagger timers — kept in a ref so re-renders don't drop them and
  // so a `reset_demo` can cancel everything cleanly.
  const timersRef = useRef<number[]>([])

  const clearTimers = () => {
    for (const t of timersRef.current) window.clearTimeout(t)
    timersRef.current = []
  }

  useEffect(() => {
    const onMessage = (msg: Msg) => {
      if (msg.kind === 'demo_result') {
        // Wipe before replay so the brain remounts and cards animate fresh.
        clearTimers()
        setCards([])
        setBrain(null)
        setStatus('analyzing')

        const fanned = fanOut(msg.result)
        // Brain payload becomes the *first* visible artifact (so the user sees
        // it spinning while cards stream in).
        const brainTimer = window.setTimeout(() => {
          setBrain((msg.result.brain as Record<string, unknown>) ?? null)
          setStatus('recording')
        }, 200)
        timersRef.current.push(brainTimer)

        fanned.forEach((card, i) => {
          const t = window.setTimeout(
            () => {
              setCards((prev) => [card, ...prev].slice(0, MAX_CARDS))
              if (i === fanned.length - 1) setStatus('analyzing')
            },
            400 + i * STAGGER_MS,
          )
          timersRef.current.push(t)
        })
        // After last card, drop back to idle.
        const tailTimer = window.setTimeout(
          () => setStatus('idle'),
          400 + fanned.length * STAGGER_MS + 800,
        )
        timersRef.current.push(tailTimer)
      } else if (msg.kind === 'reset_demo') {
        clearTimers()
        setCards([])
        setBrain(null)
        setStatus('idle')
      } else if (msg.kind === 'verdict') {
        const card: Card = {
          id: msg.clipId || clipId(),
          label: msg.result.label,
          score: msg.result.score,
          primaryPattern: msg.result.patterns?.[0]?.label ?? 'Captured response',
          feedback: msg.result.feedback,
          action: msg.action,
          at: Date.now(),
        }
        setCards((prev) => [card, ...prev].slice(0, MAX_CARDS))
      } else if (msg.kind === 'verdict_failed') {
        setCards((prev) =>
          [
            {
              id: msg.clipId || clipId(),
              label: 'low' as const,
              score: 0,
              primaryPattern: 'Analysis failed',
              feedback: msg.error,
              action: 'failed' as const,
              at: Date.now(),
            },
            ...prev,
          ].slice(0, MAX_CARDS),
        )
      } else if (msg.kind === 'loop_status') {
        setStatus(msg.status)
      }
      return false
    }
    chrome.runtime.onMessage.addListener(onMessage)
    return () => {
      chrome.runtime.onMessage.removeListener(onMessage)
      clearTimers()
    }
  }, [])

  const visible = useMemo(() => cards.length > 0 || brain !== null || status !== 'idle', [cards, brain, status])

  return (
    <div className={`metis-overlay__panel${visible ? ' metis-overlay__panel--show' : ''}`}>
      <BrainPanel brain={brain} />
      <StatusBadge status={status} />
      <CardList cards={cards} />
    </div>
  )
}
