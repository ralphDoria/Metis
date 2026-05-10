import { captureChunk, videoKey } from './capture'
import { observeVideos } from './observers'
import { reelsAdapter, type PlatformAdapter } from './platforms/reels'
import { hideOverlay, setOverlay } from './overlay'
import type { Msg, ProcessResponse, Settings } from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/settings'
import { shouldSkip } from '../shared/threshold'

const MIN_DURATION_FOR_CAPTURE = 1.5 // seconds
const VERDICT_TTL_MS = 90_000
const SKIP_THROTTLE_MS = 1500

interface VerdictEntry {
  result: ProcessResponse
  cachedAt: number
}

const verdictCache = new Map<string, VerdictEntry>()
const inflightCaptures = new Set<string>()
let captureSemaphore = 2
let lastSkipAt = 0
let settings: Settings = DEFAULT_SETTINGS
let activeAdapter: PlatformAdapter | null = null

function pickAdapter(): PlatformAdapter | null {
  for (const a of [reelsAdapter]) {
    if (a.matchHost(location.hostname)) return a
  }
  return null
}

async function fetchSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ kind: 'settings_get' } satisfies Msg, (s: Settings) => {
      if (chrome.runtime.lastError) resolve(DEFAULT_SETTINGS)
      else resolve(s ?? DEFAULT_SETTINGS)
    })
  })
}

function isExtensionActive(): boolean {
  if (!settings.enabled) return false
  if (settings.pausedUntil && Date.now() < settings.pausedUntil) return false
  if (!activeAdapter) return false
  if (!activeAdapter.isFeed()) return false
  if (!settings.perPlatform[activeAdapter.platform]) return false
  if (document.visibilityState !== 'visible') return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  return true
}

async function maybeStartCapture(video: HTMLVideoElement): Promise<void> {
  if (!isExtensionActive()) return
  if (captureSemaphore <= 0) return
  if (!video.isConnected) return
  if (video.readyState < 2) return // HAVE_CURRENT_DATA

  const key = videoKey(video)
  if (inflightCaptures.has(key)) return
  if (verdictCache.has(key)) return

  inflightCaptures.add(key)
  captureSemaphore--
  try {
    if (video.dataset.metisActive === '1') {
      setOverlay({ status: 'analyzing' })
    }
    const { blob, durationSeconds, mime } = await captureChunk(video)
    if (durationSeconds < MIN_DURATION_FOR_CAPTURE && !blob.size) return
    const bytes = await blob.arrayBuffer()
    const message: Msg = {
      kind: 'capture_done',
      videoKey: key,
      bytes,
      mime,
      platform: activeAdapter!.platform,
      url: video.currentSrc || video.src || location.href,
      durationSeconds,
    }
    chrome.runtime.sendMessage(message)
  } catch (e) {
    // Swallow capture errors silently; only surface persistent failures via overlay.
    if (video.dataset.metisActive === '1') {
      setOverlay({ status: 'failed', message: e instanceof Error ? e.message : 'capture_error' })
    }
  } finally {
    inflightCaptures.delete(key)
    captureSemaphore++
  }
}

function applyVerdict(video: HTMLVideoElement, result: ProcessResponse): void {
  if (video.dataset.metisActive !== '1') return
  const primary = result.patterns?.[0]?.label
  setOverlay({
    status: 'verdict',
    label: result.label,
    score: result.score,
    primaryPattern: primary,
    message: result.feedback,
  })
  if (shouldSkip(result, settings.sensitivity)) triggerSkip(video, result)
}

async function triggerSkip(video: HTMLVideoElement, result: ProcessResponse): Promise<void> {
  if (!activeAdapter) return
  const now = Date.now()
  if (now - lastSkipAt < SKIP_THROTTLE_MS) return
  lastSkipAt = now
  setOverlay({
    status: 'skipped',
    label: result.label,
    score: result.score,
    primaryPattern: result.patterns?.[0]?.label,
    message: 'Detrimental loop bypassed',
  })
  const key = videoKey(video)
  chrome.runtime.sendMessage({ kind: 'mark_skipped', videoKey: key } satisfies Msg)
  await activeAdapter.skip()
}

function init() {
  activeAdapter = pickAdapter()
  if (!activeAdapter) return

  fetchSettings().then((s) => {
    settings = s
  })
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return
    fetchSettings().then((s) => {
      settings = s
    })
  })

  chrome.runtime.onMessage.addListener((msg: Msg) => {
    if (msg.kind === 'verdict') {
      const cached: VerdictEntry = { result: msg.result, cachedAt: Date.now() }
      verdictCache.set(msg.videoKey, cached)
      // Sweep stale entries
      for (const [k, v] of verdictCache) {
        if (Date.now() - v.cachedAt > VERDICT_TTL_MS) verdictCache.delete(k)
      }
      const v = document.querySelector<HTMLVideoElement>('video[data-metis-active="1"]')
      if (v && videoKey(v) === msg.videoKey) applyVerdict(v, msg.result)
    } else if (msg.kind === 'verdict_failed') {
      const v = document.querySelector<HTMLVideoElement>('video[data-metis-active="1"]')
      if (v && videoKey(v) === msg.videoKey) {
        setOverlay({ status: 'failed', message: msg.error })
      }
    }
  })

  observeVideos(document, () => isExtensionActive(), (kind, video) => {
    if (!isExtensionActive()) return
    if (kind === 'prefetch') {
      maybeStartCapture(video)
    } else if (kind === 'active') {
      const key = videoKey(video)
      const cached = verdictCache.get(key)
      if (cached) applyVerdict(video, cached.result)
      else {
        setOverlay({ status: 'analyzing' })
        maybeStartCapture(video)
      }
    } else if (kind === 'lost') {
      // The user scrolled past this reel. If we have an inflight analysis
      // for it that we never showed a verdict for, cancel the Modal job.
      const key = videoKey(video)
      if (!verdictCache.has(key)) {
        chrome.runtime.sendMessage({
          kind: 'cancel_capture',
          videoKey: key,
          reason: 'user_skipped',
        } satisfies Msg)
      }
      hideOverlay()
    }
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') hideOverlay()
  })

  // SPA navigation guard for instagram.com — re-evaluate isFeed on URL changes.
  let lastPath = location.pathname
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname
      if (!activeAdapter?.isFeed()) hideOverlay()
    }
  }, 1000)
}

init()
