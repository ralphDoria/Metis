/**
 * Floating overlay anchored to the active video. Surfaces verdict + skip
 * status without injecting into the host page's React tree.
 */

const HOST_ID = 'metis-overlay-host'

interface OverlayState {
  status: 'idle' | 'analyzing' | 'verdict' | 'skipped' | 'failed'
  label?: string
  score?: number
  primaryPattern?: string
  message?: string
}

let host: HTMLDivElement | null = null
let shadow: ShadowRoot | null = null
let panel: HTMLDivElement | null = null
let lastState: OverlayState = { status: 'idle' }

function ensureHost(): { host: HTMLDivElement; shadow: ShadowRoot; panel: HTMLDivElement } {
  if (host && shadow && panel) return { host, shadow, panel }
  host = document.createElement('div')
  host.id = HOST_ID
  Object.assign(host.style, {
    position: 'fixed',
    top: '24px',
    right: '24px',
    zIndex: '2147483647',
    pointerEvents: 'none',
  } as Partial<CSSStyleDeclaration>)
  shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = `
    <style>
      :host { all: initial; font-family: 'Inter', system-ui, sans-serif; }
      .panel {
        pointer-events: auto;
        min-width: 220px;
        padding: 12px 14px;
        border-radius: 18px;
        background: linear-gradient(160deg, rgba(11,11,18,0.92) 0%, rgba(5,5,5,0.86) 100%);
        border: 1px solid rgba(138, 43, 226, 0.35);
        box-shadow: 0 18px 60px -12px rgba(138, 43, 226, 0.45), 0 4px 24px -6px rgba(0,0,0,0.6);
        color: #f5f3ff;
        backdrop-filter: blur(22px);
        transform: translateY(-6px);
        opacity: 0;
        transition: opacity 220ms ease, transform 220ms ease;
      }
      .panel.show { opacity: 1; transform: translateY(0); }
      .row { display: flex; align-items: center; gap: 10px; }
      .dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: #a06bf0;
        box-shadow: 0 0 0 4px rgba(160, 107, 240, 0.18);
        animation: pulse 1.6s ease-in-out infinite;
      }
      .dot.amber { background: #ff8c00; box-shadow: 0 0 0 4px rgba(255,140,0,0.22); }
      .dot.idle { animation: none; opacity: 0.5; }
      .label {
        font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
        color: rgba(245,243,255,0.6);
      }
      .title {
        font-size: 14px; font-weight: 600; margin-top: 4px;
      }
      .desc {
        font-size: 12px; margin-top: 4px; color: rgba(245,243,255,0.72);
      }
      .meter {
        margin-top: 10px; height: 4px; border-radius: 999px;
        background: rgba(255,255,255,0.08);
        overflow: hidden;
      }
      .meter > span {
        display: block; height: 100%;
        background: linear-gradient(90deg, #a06bf0, #f472b6, #ff8c00);
        width: 0%; transition: width 320ms ease;
      }
      @keyframes pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50%      { transform: scale(1.18); opacity: 0.78; }
      }
    </style>
    <div class="panel" part="panel">
      <div class="row">
        <span class="dot idle" id="dot"></span>
        <span class="label" id="label">Metis</span>
      </div>
      <div class="title" id="title">Idle</div>
      <div class="desc" id="desc"></div>
      <div class="meter"><span id="bar"></span></div>
    </div>
  `
  panel = shadow.querySelector('.panel')!
  document.documentElement.appendChild(host)
  return { host, shadow, panel }
}

export function setOverlay(state: OverlayState): void {
  lastState = state
  const { shadow, panel } = ensureHost()
  const dot = shadow.querySelector<HTMLElement>('#dot')!
  const label = shadow.querySelector<HTMLElement>('#label')!
  const title = shadow.querySelector<HTMLElement>('#title')!
  const desc = shadow.querySelector<HTMLElement>('#desc')!
  const bar = shadow.querySelector<HTMLElement>('#bar')!

  panel.classList.add('show')
  dot.classList.remove('idle', 'amber')

  switch (state.status) {
    case 'idle':
      dot.classList.add('idle')
      label.textContent = 'Metis'
      title.textContent = 'Watching this reel'
      desc.textContent = ''
      bar.style.width = '0%'
      break
    case 'analyzing':
      label.textContent = 'Analyzing'
      title.textContent = 'Reading neural response…'
      desc.textContent = ''
      bar.style.width = '15%'
      break
    case 'verdict':
      if (state.label === 'high' || state.label === 'elevated') dot.classList.add('amber')
      label.textContent = state.label?.toUpperCase() ?? 'VERDICT'
      title.textContent = state.primaryPattern ?? 'Captured response'
      desc.textContent = state.message ?? ''
      bar.style.width = `${Math.max(8, Math.min(100, Math.round((state.score ?? 0) * 100)))}%`
      break
    case 'skipped':
      dot.classList.add('amber')
      label.textContent = 'Skipped'
      title.textContent = state.primaryPattern ?? 'Detrimental loop bypassed'
      desc.textContent = state.message ?? 'Moving on for you.'
      bar.style.width = `${Math.max(50, Math.min(100, Math.round((state.score ?? 0.8) * 100)))}%`
      break
    case 'failed':
      label.textContent = 'Offline'
      title.textContent = 'Verdict unavailable'
      desc.textContent = state.message ?? ''
      bar.style.width = '0%'
      break
  }
}

export function hideOverlay(): void {
  if (!panel) return
  panel.classList.remove('show')
  lastState = { status: 'idle' }
}

export function getOverlayState(): OverlayState {
  return lastState
}
