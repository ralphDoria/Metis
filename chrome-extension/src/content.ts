// Content script: injects the Metaware modal into instagram.com.
//
// Modal lives in a shadow root so Instagram's CSS can't bleed in. The button
// asks the service worker to start a 10s tab capture; the resulting blob comes
// back via chrome.runtime.onMessage and is appended as a download row.

import {
  ExtensionMsg,
  RecordingErrorMsg,
  RecordingResultMsg,
  StartRecordingMsg,
} from './messages'

const RECORDING_DURATION_MS = 10_000
const HOST_ID = 'metaware-modal-host'

type Result = {
  filename: string
  sizeBytes: number
  result: unknown
}

let results: Result[] = []
let isRecording = false
let countdownTimer: number | null = null
let secondsRemaining = 0

// --- DOM scaffolding ----------------------------------------------------

function ensureHost(): ShadowRoot {
  let host = document.getElementById(HOST_ID)
  if (host && host.shadowRoot) return host.shadowRoot

  host = document.createElement('div')
  host.id = HOST_ID
  // Pin to top-right; very high z-index to sit above IG's UI without DOM injection.
  host.style.cssText = [
    'position: fixed',
    'top: 16px',
    'right: 16px',
    'width: 320px',
    'z-index: 2147483647',
    'pointer-events: auto',
  ].join('; ')
  document.documentElement.appendChild(host)

  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = `
    <style>
      :host, * { box-sizing: border-box; }
      .panel {
        font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: rgba(15, 15, 18, 0.92);
        color: #f5f5f7;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
        overflow: hidden;
      }
      .header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        font-weight: 600; letter-spacing: 0.02em;
      }
      .header .dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: #4ade80; margin-right: 8px;
        display: inline-block; vertical-align: middle;
      }
      .header .dot.recording { background: #ef4444; animation: pulse 1s infinite; }
      @keyframes pulse {
        0%, 100% { opacity: 1; } 50% { opacity: 0.4; }
      }
      .body { padding: 12px; }
      button.record {
        width: 100%;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: linear-gradient(180deg, #4f46e5 0%, #4338ca 100%);
        color: white;
        font-weight: 600;
        font-size: 13px;
        cursor: pointer;
        transition: filter 0.12s ease;
      }
      button.record:hover:not(:disabled) { filter: brightness(1.1); }
      button.record:disabled { opacity: 0.6; cursor: progress; }
      .list-label {
        margin: 14px 0 6px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: rgba(245, 245, 247, 0.55);
      }
      .empty {
        font-size: 12px;
        color: rgba(245, 245, 247, 0.5);
        padding: 8px 0;
      }
      ul.list { list-style: none; margin: 0; padding: 0; max-height: 220px; overflow-y: auto; }
      ul.list li {
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px;
        padding: 8px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      }
      ul.list li:last-child { border-bottom: none; }
      ul.list a {
        color: #93c5fd;
        text-decoration: none;
        font-size: 12px;
        word-break: break-all;
        flex: 1;
      }
      ul.list a:hover { text-decoration: underline; }
      ul.list .size {
        font-size: 11px;
        color: rgba(245, 245, 247, 0.5);
        flex-shrink: 0;
      }
      .error {
        margin-top: 10px;
        padding: 8px 10px;
        border-radius: 6px;
        background: rgba(239, 68, 68, 0.12);
        border: 1px solid rgba(239, 68, 68, 0.32);
        color: #fecaca;
        font-size: 12px;
      }
    </style>
    <div class="panel">
      <div class="header">
        <span><span class="dot" id="status-dot"></span>Metaware</span>
        <span style="opacity: 0.5; font-weight: 400; font-size: 11px;">recording test</span>
      </div>
      <div class="body">
        <button class="record" id="record-btn">Record 10s</button>
        <div class="list-label">Results</div>
        <ul class="list" id="list"></ul>
        <div class="empty" id="empty">No results yet.</div>
        <div class="error" id="error" style="display: none;"></div>
      </div>
    </div>
  `
  return shadow
}

function $(shadow: ShadowRoot, selector: string): HTMLElement {
  const el = shadow.querySelector(selector)
  if (!el) throw new Error(`[metaware/content] missing element: ${selector}`)
  return el as HTMLElement
}

// --- Render -------------------------------------------------------------

function render(shadow: ShadowRoot): void {
  const btn = $(shadow, '#record-btn') as HTMLButtonElement
  const dot = $(shadow, '#status-dot')
  const list = $(shadow, '#list') as HTMLUListElement
  const empty = $(shadow, '#empty')

  btn.disabled = isRecording
  btn.textContent = isRecording
    ? `Recording… ${secondsRemaining}s`
    : 'Record 10s'
  dot.classList.toggle('recording', isRecording)

  list.innerHTML = ''
  empty.style.display = results.length === 0 ? 'block' : 'none'
  for (const r of results) {
    const li = document.createElement('li')
    const label = document.createElement('span')
    label.style.flex = '1'
    label.style.fontSize = '12px'
    label.style.color = '#cbd5f5'
    label.textContent = `${r.filename} — ${summarise(r.result)}`
    const size = document.createElement('span')
    size.className = 'size'
    size.textContent = formatSize(r.sizeBytes)
    li.appendChild(label)
    li.appendChild(size)
    list.appendChild(li)
  }
}

function summarise(result: unknown): string {
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>
    if (typeof r.feedback === 'string') return r.feedback
    if (typeof r.high_activation_minutes === 'number' && typeof r.total_minutes === 'number') {
      return `${r.high_activation_minutes}/${r.total_minutes} min high-activation`
    }
  }
  return 'processed'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function showError(shadow: ShadowRoot, message: string): void {
  const el = $(shadow, '#error')
  el.style.display = 'block'
  el.textContent = message
  // Auto-hide after 6s.
  setTimeout(() => {
    el.style.display = 'none'
    el.textContent = ''
  }, 6_000)
}

// --- Recording lifecycle -----------------------------------------------

function startCountdown(shadow: ShadowRoot): void {
  secondsRemaining = Math.ceil(RECORDING_DURATION_MS / 1000)
  if (countdownTimer !== null) window.clearInterval(countdownTimer)
  countdownTimer = window.setInterval(() => {
    secondsRemaining = Math.max(0, secondsRemaining - 1)
    render(shadow)
    if (secondsRemaining <= 0 && countdownTimer !== null) {
      window.clearInterval(countdownTimer)
      countdownTimer = null
    }
  }, 1000)
}

function clickRecord(shadow: ShadowRoot): void {
  if (isRecording) return
  isRecording = true
  startCountdown(shadow)
  render(shadow)

  const msg: StartRecordingMsg = {
    type: 'metaware/start-recording',
    durationMs: RECORDING_DURATION_MS,
  }
  chrome.runtime.sendMessage(msg).catch((err) => {
    isRecording = false
    if (countdownTimer !== null) window.clearInterval(countdownTimer)
    showError(shadow, `Could not reach extension: ${err?.message ?? err}`)
    render(shadow)
  })
}

function onRecordingResult(shadow: ShadowRoot, message: RecordingResultMsg): void {
  results = [
    ...results,
    {
      filename: message.filename,
      sizeBytes: message.sizeBytes,
      result: message.result,
    },
  ]
  isRecording = false
  if (countdownTimer !== null) {
    window.clearInterval(countdownTimer)
    countdownTimer = null
  }
  render(shadow)
}

function onRecordingError(shadow: ShadowRoot, message: RecordingErrorMsg): void {
  isRecording = false
  if (countdownTimer !== null) {
    window.clearInterval(countdownTimer)
    countdownTimer = null
  }
  showError(shadow, message.message)
  render(shadow)
}

// --- Boot ---------------------------------------------------------------

function boot(): void {
  const shadow = ensureHost()
  const btn = $(shadow, '#record-btn')
  btn.addEventListener('click', () => clickRecord(shadow))
  render(shadow)

  chrome.runtime.onMessage.addListener((message: ExtensionMsg) => {
    if (message.type === 'metaware/recording-result') {
      onRecordingResult(shadow, message)
    } else if (message.type === 'metaware/recording-error') {
      onRecordingError(shadow, message)
    }
    return false
  })
}

// IG is a SPA; the content script runs once at document_idle. The modal is
// attached to documentElement so it survives IG's React re-renders. If IG ever
// nukes documentElement children (it doesn't today), wire a MutationObserver
// here to re-attach.
boot()
