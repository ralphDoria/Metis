// Top-level overlay component. Drives the fake real-time demo:
//
//   1. `run_demo` arrives → cards empty, brain empty (no data), status flips
//      to "analyzing" with the yellow pulse.
//   2. Wait a random 5–10 s, then load the brain payload (one-shot — never
//      re-rendered for the lifetime of the page).
//   3. After the brain reveal, schedule a recurring 5–10 s timer that pushes
//      one randomly-generated card onto the stack, capped at MAX_CARDS. The
//      bottom (oldest) card falls off when the cap is reached.
//   4. `reset_demo` clears the card stack only — brain stays loaded, the
//      streaming timer keeps firing.
//   5. Re-clicking "Run demo" while the simulation is already running is a
//      no-op (matches the "don't re-render the brain" rule).

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Msg, ScoreLabel } from '../shared/types'
import { BrainPanel } from './BrainPanel'
import { CardList, MAX_CARDS, type Card } from './CardList'
import { StatusBadge, type LoopStatus } from './StatusBadge'
import { pickPattern } from './patterns'

// Range used for both the initial brain-reveal delay and the inter-card delay.
const TICK_MIN_MS = 10_000
const TICK_MAX_MS = 20_000

function randMs(): number {
  return TICK_MIN_MS + Math.floor(Math.random() * (TICK_MAX_MS - TICK_MIN_MS))
}

function clipId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function scoreToLabel(score: number): ScoreLabel {
  if (score < 0.3) return 'low'
  if (score < 0.55) return 'average'
  if (score < 0.8) return 'elevated'
  return 'high'
}

function generateCard(): Card {
  const pattern = pickPattern()
  // Confidence skews high — the model "is sure" most of the time.
  const confidence = 0.55 + Math.random() * 0.4
  // Addictiveness score: ~U(0.15, 0.95) so we hit every label tier eventually.
  const score = 0.15 + Math.random() * 0.8
  const label = scoreToLabel(score)
  // Cards with high score visually flag as "skipped" so the action chip varies
  // — we're not actually skipping anything in demo mode.
  const action: Card['action'] = label === 'high' ? 'skipped' : 'watched'
  return {
    id: clipId(),
    label,
    score,
    primaryPattern: pattern.label,
    feedback: `${pattern.description} (confidence ${(confidence * 100).toFixed(0)}%)`,
    action,
    at: Date.now(),
  }
}

export function App() {
  const [cards, setCards] = useState<Card[]>([])
  const [brain, setBrain] = useState<Record<string, unknown> | null>(null)
  const [status, setStatus] = useState<LoopStatus>('idle')

  // Refs so re-renders don't drop pending timers and we can guard against
  // re-entrant `run_demo` clicks.
  const simRunningRef = useRef(false)
  const tickTimerRef = useRef<number | null>(null)
  const revealTimerRef = useRef<number | null>(null)

  const stopTimers = () => {
    if (tickTimerRef.current !== null) {
      window.clearTimeout(tickTimerRef.current)
      tickTimerRef.current = null
    }
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current)
      revealTimerRef.current = null
    }
  }

  useEffect(() => {
    function scheduleNextCard(): void {
      const ms = randMs()
      tickTimerRef.current = window.setTimeout(() => {
        // Newest on top; cap at MAX_CARDS so the oldest (bottom) falls off.
        setCards((prev) => [generateCard(), ...prev].slice(0, MAX_CARDS))
        scheduleNextCard()
      }, ms)
    }

    const onMessage = (msg: Msg) => {
      if (msg.kind === 'demo_result') {
        // Re-clicks while simulation is already running are intentional no-ops.
        if (simRunningRef.current) return
        simRunningRef.current = true

        setCards([])
        setBrain(null)
        setStatus('analyzing')

        // Brain reveal after a random 5–10 s wait. After this, we never touch
        // `brain` state again for the lifetime of the page — even on reset.
        const revealMs = randMs()
        revealTimerRef.current = window.setTimeout(() => {
          setBrain((msg.result.brain as Record<string, unknown>) ?? null)
          setStatus('recording')
          scheduleNextCard()
        }, revealMs)
      } else if (msg.kind === 'reset_demo') {
        // Clear cards only; brain stays. Streaming timer keeps firing so new
        // cards stream in on top of the empty list.
        setCards([])
      } else if (msg.kind === 'verdict') {
        setCards((prev) =>
          [
            {
              id: msg.clipId || clipId(),
              label: msg.result.label,
              score: msg.result.score,
              primaryPattern: msg.result.patterns?.[0]?.label ?? 'Captured response',
              feedback: msg.result.feedback,
              action: msg.action,
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
      stopTimers()
    }
  }, [])

  const visible = useMemo(
    () => cards.length > 0 || brain !== null || status !== 'idle',
    [cards, brain, status],
  )

  return (
    <div className={`metis-overlay__panel${visible ? ' metis-overlay__panel--show' : ''}`}>
      <BrainPanel brain={brain} />
      <StatusBadge status={status} />
      <CardList cards={cards} />
    </div>
  )
}
