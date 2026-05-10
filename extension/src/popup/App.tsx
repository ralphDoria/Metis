import { useEffect, useMemo, useState } from 'react'
import type {
  ProcessedVideo,
  Sensitivity,
  SessionState,
  Settings,
} from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/settings'

const SENSITIVITY_OPTIONS: Array<{ value: Sensitivity; label: string; hint: string }> = [
  { value: 'gentle', label: 'Gentle', hint: 'Skip only the loudest spikes' },
  { value: 'balanced', label: 'Balanced', hint: 'Default — high-only intervention' },
  { value: 'strict', label: 'Strict', hint: 'Skip elevated + high responses' },
]

function sendMessage<T = unknown>(msg: unknown): Promise<T> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp: T) => resolve(resp))
  })
}

function formatMinutes(seconds: number): string {
  const mins = Math.round(seconds / 60)
  if (mins < 1) return '<1m'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function formatClock(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [session, setSession] = useState<SessionState | null>(null)
  const [now, setNow] = useState<number>(Date.now())

  useEffect(() => {
    void refresh()
    const onChange = () => void refresh()
    chrome.storage.onChanged.addListener(onChange)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      chrome.storage.onChanged.removeListener(onChange)
      clearInterval(tick)
    }
  }, [])

  async function refresh() {
    const [s, sess] = await Promise.all([
      sendMessage<Settings>({ kind: 'settings_get' }),
      sendMessage<SessionState>({ kind: 'session_get' }),
    ])
    setSettings({ ...DEFAULT_SETTINGS, ...s })
    setSession(sess)
  }

  async function patchSettings(patch: Partial<Settings>) {
    const next = await sendMessage<Settings>({ kind: 'settings_set', patch })
    setSettings({ ...DEFAULT_SETTINGS, ...next })
  }

  const skipped = useMemo(
    () => (session?.processedVideos ?? []).filter((v) => v.action === 'skipped'),
    [session],
  )

  const totalSecondsSaved = useMemo(
    () => skipped.reduce((acc, v) => acc + (v.durationSeconds || 0), 0),
    [skipped],
  )

  const taxonomy = useMemo(() => buildTaxonomy(session?.processedVideos ?? []), [session])

  const sessionElapsed = session ? Math.max(0, now - session.sessionStart) : 0
  const paused =
    !settings.enabled || (settings.pausedUntil !== undefined && now < settings.pausedUntil)

  return (
    <div className="metis-popup-body p-4 flex flex-col gap-3">
      <Header paused={paused} elapsedMs={sessionElapsed} />

      <Hero secondsSaved={totalSecondsSaved} skippedCount={skipped.length} />

      <TaxonomyBar slices={taxonomy} />

      <SkippedFeed items={skipped.slice(-3).reverse()} />

      <SensitivitySelector
        value={settings.sensitivity}
        onChange={(sensitivity) => patchSettings({ sensitivity })}
      />

      <PauseControls
        enabled={settings.enabled}
        pausedUntil={settings.pausedUntil}
        now={now}
        onTogglePower={() => patchSettings({ enabled: !settings.enabled })}
        onSnooze={(ms) => patchSettings({ pausedUntil: ms ? Date.now() + ms : undefined })}
      />

      <a className="metis-cta" href="https://metis.mnkjoshi.ca/agora" target="_blank" rel="noreferrer">
        Enter The Agora →
      </a>
    </div>
  )
}

function Header({ paused, elapsedMs }: { paused: boolean; elapsedMs: number }) {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`metis-pulse-dot ${paused ? 'muted' : ''}`} />
        <span className="metis-tag">{paused ? 'Paused' : 'Active monitoring'}</span>
      </div>
      <span className="font-mono text-xs text-text-soft">{formatClock(elapsedMs)}</span>
    </header>
  )
}

function Hero({ secondsSaved, skippedCount }: { secondsSaved: number; skippedCount: number }) {
  return (
    <section className="metis-card p-4">
      <div className="metis-tag mb-2">Time reclaimed today</div>
      <div className="text-4xl font-semibold tracking-tight metis-shimmer-text">
        {formatMinutes(secondsSaved)}
      </div>
      <div className="text-xs text-text-soft mt-2">
        {skippedCount} detrimental loop{skippedCount === 1 ? '' : 's'} bypassed
      </div>
    </section>
  )
}

interface TaxonomySlice {
  key: string
  label: string
  pct: number
  color: string
}

function buildTaxonomy(videos: ProcessedVideo[]): TaxonomySlice[] {
  const counts = new Map<string, number>()
  for (const v of videos) {
    if (!v.primaryPattern) continue
    counts.set(v.primaryPattern, (counts.get(v.primaryPattern) ?? 0) + 1)
  }
  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0)
  if (!total) return []
  const palette = ['#a06bf0', '#f472b6', '#ff8c00', '#f87171', '#6ee7b7', '#fbbf24']
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  return sorted.slice(0, 5).map(([label, count], i) => ({
    key: label,
    label,
    pct: (count / total) * 100,
    color: palette[i % palette.length],
  }))
}

function TaxonomyBar({ slices }: { slices: TaxonomySlice[] }) {
  if (slices.length === 0) {
    return (
      <section className="metis-card p-3">
        <div className="metis-tag mb-2">Emotional taxonomy</div>
        <div className="text-xs text-text-soft">
          Open Instagram Reels to start collecting verdicts.
        </div>
      </section>
    )
  }
  return (
    <section className="metis-card p-3">
      <div className="metis-tag mb-2">Emotional taxonomy</div>
      <div className="metis-meter">
        {slices.map((s) => (
          <span key={s.key} style={{ width: `${s.pct}%`, background: s.color }} title={`${s.label} ${Math.round(s.pct)}%`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {slices.map((s) => (
          <div key={s.key} className="text-[11px] text-text-soft flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
            <span>{s.label}</span>
            <span className="text-text-faint">{Math.round(s.pct)}%</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function SkippedFeed({ items }: { items: ProcessedVideo[] }) {
  if (items.length === 0) {
    return (
      <section className="metis-card p-3">
        <div className="metis-tag mb-2">Recent skips</div>
        <div className="text-xs text-text-soft">Nothing skipped yet.</div>
      </section>
    )
  }
  return (
    <section className="metis-card p-3">
      <div className="metis-tag mb-2">Recent skips</div>
      <ul className="flex flex-col gap-2">
        {items.map((v) => (
          <li key={v.videoKey} className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl flex-shrink-0" style={{ background: skipGradient(v.label) }} />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-text-primary truncate">{v.primaryPattern ?? 'High response'}</div>
              <div className="text-[10px] tracking-widest uppercase text-text-faint">
                {v.label ?? 'high'} · {Math.round((v.score ?? 0) * 100)}%
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function skipGradient(label?: string): string {
  if (label === 'high') return 'linear-gradient(135deg,#ff8c00,#f472b6)'
  if (label === 'elevated') return 'linear-gradient(135deg,#f472b6,#a06bf0)'
  return 'linear-gradient(135deg,#a06bf0,#5b1aa6)'
}

function SensitivitySelector({
  value,
  onChange,
}: {
  value: Sensitivity
  onChange: (v: Sensitivity) => void
}) {
  const hint = SENSITIVITY_OPTIONS.find((o) => o.value === value)?.hint ?? ''
  return (
    <section className="metis-card p-3">
      <div className="metis-tag mb-2">Skip sensitivity</div>
      <div className="flex gap-2 mb-2">
        {SENSITIVITY_OPTIONS.map((o) => (
          <button
            key={o.value}
            className={`metis-pill ${value === o.value ? 'is-active' : ''}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="text-[11px] text-text-soft">{hint}</div>
    </section>
  )
}

function PauseControls({
  enabled,
  pausedUntil,
  now,
  onTogglePower,
  onSnooze,
}: {
  enabled: boolean
  pausedUntil?: number
  now: number
  onTogglePower: () => void
  onSnooze: (ms: number) => void
}) {
  const snoozing = pausedUntil && pausedUntil > now
  const remaining = snoozing ? Math.max(0, pausedUntil! - now) : 0
  return (
    <section className="metis-card p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="metis-tag">Power</div>
        <button className={`metis-pill ${enabled ? 'is-active' : ''}`} onClick={onTogglePower}>
          {enabled ? 'On' : 'Off'}
        </button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="metis-tag">Snooze</div>
        <div className="flex gap-1">
          <button className="metis-pill" onClick={() => onSnooze(60 * 60 * 1000)}>1h</button>
          <button className="metis-pill" onClick={() => onSnooze(8 * 60 * 60 * 1000)}>8h</button>
          {snoozing ? (
            <button className="metis-pill is-active" onClick={() => onSnooze(0)}>
              Resume · {formatClock(remaining)}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  )
}
