import { cancelProcess, postProcessWithRetry } from './shared/api'
import { getSettings, isPaused, setSettings } from './shared/settings'
import { getSession, recordError, recordVideo, resetSession } from './shared/session'
import type { Msg, ProcessedVideo } from './shared/types'

const MAX_INFLIGHT = 2
let inflight = 0
const queue: Array<() => void> = []

interface InflightJob {
  jobId: string
  abort: AbortController
}

const inflightByVideo = new Map<string, InflightJob>()

async function acquire(): Promise<() => void> {
  if (inflight < MAX_INFLIGHT) {
    inflight++
    return () => {
      inflight--
      const next = queue.shift()
      if (next) next()
    }
  }
  return new Promise((resolve) => {
    queue.push(() => {
      inflight++
      resolve(() => {
        inflight--
        const next = queue.shift()
        if (next) next()
      })
    })
  })
}

function makeJobId(): string {
  // Crypto.randomUUID is available in MV3 service workers.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

async function handleCapture(
  msg: Extract<Msg, { kind: 'capture_done' }>,
  sender: chrome.runtime.MessageSender,
): Promise<void> {
  const tabId = sender.tab?.id
  const settings = await getSettings()
  if (isPaused(settings)) return
  if (!settings.perPlatform[msg.platform]) return

  const video: ProcessedVideo = {
    videoKey: msg.videoKey,
    platform: msg.platform,
    url: msg.url,
    capturedAt: Date.now(),
    durationSeconds: msg.durationSeconds,
    action: 'pending',
  }
  await recordVideo(video)

  const release = await acquire()
  const jobId = makeJobId()
  const abort = new AbortController()
  inflightByVideo.set(msg.videoKey, { jobId, abort })

  try {
    const blob = new Blob([msg.bytes], { type: msg.mime || 'video/webm' })
    const result = await postProcessWithRetry(blob, { jobId, signal: abort.signal })
    const primary = result.patterns?.[0]
    await recordVideo({
      ...video,
      action: 'watched',
      score: result.score,
      label: result.label,
      primaryPattern: primary?.label,
      feedback: result.feedback,
    })
    if (tabId !== undefined) {
      const verdict: Msg = { kind: 'verdict', videoKey: msg.videoKey, result }
      chrome.tabs.sendMessage(tabId, verdict).catch(() => {})
    }
  } catch (e) {
    const aborted = abort.signal.aborted
    const message = aborted ? 'cancelled_by_user' : e instanceof Error ? e.message : String(e)
    if (!aborted) await recordError(message)
    await recordVideo({ ...video, action: aborted ? 'watched' : 'failed' })
    if (tabId !== undefined && !aborted) {
      const failed: Msg = { kind: 'verdict_failed', videoKey: msg.videoKey, error: message }
      chrome.tabs.sendMessage(tabId, failed).catch(() => {})
    }
  } finally {
    inflightByVideo.delete(msg.videoKey)
    release()
  }
}

function cancelInflight(videoKey: string): boolean {
  const job = inflightByVideo.get(videoKey)
  if (!job) return false
  inflightByVideo.delete(videoKey)
  job.abort.abort()
  // Fire-and-forget; the server-side endpoint deregisters the FunctionCall.
  void cancelProcess(job.jobId)
  return true
}

chrome.runtime.onMessage.addListener((msg: Msg, sender, sendResponse) => {
  ;(async () => {
    try {
      switch (msg.kind) {
        case 'ping':
          sendResponse({ ok: true })
          return
        case 'capture_done':
          await handleCapture(msg, sender)
          sendResponse({ ok: true })
          return
        case 'cancel_capture': {
          const ok = cancelInflight(msg.videoKey)
          sendResponse({ ok })
          return
        }
        case 'mark_skipped': {
          const session = await getSession()
          const v = session.processedVideos.find((x) => x.videoKey === msg.videoKey)
          if (v) await recordVideo({ ...v, action: 'skipped' })
          sendResponse({ ok: true })
          return
        }
        case 'mark_watched': {
          const session = await getSession()
          const v = session.processedVideos.find((x) => x.videoKey === msg.videoKey)
          if (v && v.action !== 'skipped') await recordVideo({ ...v, action: 'watched' })
          sendResponse({ ok: true })
          return
        }
        case 'settings_get':
          sendResponse(await getSettings())
          return
        case 'settings_set':
          sendResponse(await setSettings(msg.patch))
          return
        case 'session_get':
          sendResponse(await getSession())
          return
        case 'session_reset':
          await resetSession()
          sendResponse({ ok: true })
          return
      }
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  })()
  return true
})

chrome.runtime.onInstalled.addListener(async () => {
  // Seed defaults on first install
  await getSettings()
  await getSession()
})
