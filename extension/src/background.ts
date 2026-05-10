import { postProcessWithRetry } from './shared/api'
import { getSettings, isPaused, setSettings } from './shared/settings'
import { getSession, recordError, recordVideo, resetSession } from './shared/session'
import type { Msg, ProcessedVideo } from './shared/types'

const MAX_INFLIGHT = 2
let inflight = 0
const queue: Array<() => void> = []

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
  try {
    const blob = new Blob([msg.bytes], { type: msg.mime || 'video/webm' })
    const result = await postProcessWithRetry(blob)
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
    const message = e instanceof Error ? e.message : String(e)
    await recordError(message)
    await recordVideo({ ...video, action: 'failed' })
    if (tabId !== undefined) {
      const failed: Msg = { kind: 'verdict_failed', videoKey: msg.videoKey, error: message }
      chrome.tabs.sendMessage(tabId, failed).catch(() => {})
    }
  } finally {
    release()
  }
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
