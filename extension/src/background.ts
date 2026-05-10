// Service worker: brokers the tab capture stream id from chrome.tabCapture
// to the offscreen document, persists session state, and relays verdicts back
// to the originating tab's content script.
//
// This is the post-refactor build: no per-video tracking, no inflight
// semaphore, no cancellation. Capture is a single sequential loop owned by
// the offscreen doc; we only orchestrate start / stop / result-relay here.

import { getDemo } from './shared/api'
import { getSettings, isPaused, setSettings } from './shared/settings'
import { getSession, recordError, recordVideo, resetSession } from './shared/session'
import { shouldSkip } from './shared/threshold'
import type { Msg, ProcessedVideo } from './shared/types'

const OFFSCREEN_PATH = 'src/offscreen/offscreen.html'
const RECORDING_DURATION_MS = 10_000

interface ActiveLoop {
  tabId: number
}

let active: ActiveLoop | null = null

async function ensureOffscreenDocument(): Promise<void> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
  })
  if (existing.length > 0) return
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['USER_MEDIA' as chrome.offscreen.Reason],
    justification: 'Hosts MediaRecorder for sequential tab-capture analysis on Reels.',
  })
}

function getMediaStreamIdForTab(targetTabId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId }, (streamId) => {
      const err = chrome.runtime.lastError
      if (err || !streamId) {
        reject(new Error(err?.message ?? 'getMediaStreamId returned no id'))
        return
      }
      resolve(streamId)
    })
  })
}

async function resolveTargetTab(
  sender: chrome.runtime.MessageSender,
): Promise<{ tabId: number; url: string }> {
  // Content-script senders bring their own tab context. Popup senders don't —
  // we have to look up the currently-active tab. The popup invocation itself
  // grants activeTab on that tab, which is what tabCapture.getMediaStreamId
  // needs.
  if (typeof sender.tab?.id === 'number') {
    return { tabId: sender.tab.id, url: sender.tab.url ?? '' }
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('no_active_tab')
  return { tabId: tab.id, url: tab.url ?? '' }
}

async function handleStartLoop(
  msg: Extract<Msg, { kind: 'start_loop' }>,
  sender: chrome.runtime.MessageSender,
): Promise<void> {
  const { tabId, url: tabUrl } = await resolveTargetTab(sender)

  // Verify the active tab is actually a Reels feed before we burn a stream.
  if (!/^https:\/\/(www\.)?instagram\.com\/reels?(\/|$)/.test(tabUrl)) {
    throw new Error('active_tab_not_on_reels')
  }

  const settings = await getSettings()
  if (isPaused(settings)) return
  if (!settings.perPlatform[msg.platform]) return

  // Idempotent: if we're already looping for this tab, no-op.
  if (active && active.tabId === tabId) return

  // If a loop was running on a different tab, stop it first.
  if (active) await stopOffscreen()

  await ensureOffscreenDocument()
  const streamId = await getMediaStreamIdForTab(tabId)

  active = { tabId }

  const offscreenStart: Msg = {
    kind: 'offscreen_start',
    streamId,
    durationMs: RECORDING_DURATION_MS,
    originTabId: tabId,
    platform: msg.platform,
    url: msg.url || tabUrl,
  }
  await chrome.runtime.sendMessage(offscreenStart)

  pushStatus(tabId, 'recording')
}

async function handleStopLoop(): Promise<void> {
  if (!active) return
  const tabId = active.tabId
  active = null
  await stopOffscreen()
  pushStatus(tabId, 'idle')
}

async function stopOffscreen(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ kind: 'offscreen_stop' } satisfies Msg)
  } catch {
    // Offscreen doc may have torn down already; ignore.
  }
}

function pushStatus(
  tabId: number,
  status: 'recording' | 'analyzing' | 'idle',
): void {
  chrome.tabs.sendMessage(tabId, { kind: 'loop_status', status } satisfies Msg).catch(() => {})
}

async function handleRecordingResult(
  msg: Extract<Msg, { kind: 'recording_result' }>,
): Promise<void> {
  // With strict sequential sequencing the offscreen doc is now restarting
  // recording for the next 10s window, so flip the status back to recording.
  pushStatus(msg.originTabId, 'recording')

  const settings = await getSettings()
  const skip = shouldSkip(msg.result, settings.sensitivity)
  const action: ProcessedVideo['action'] = skip ? 'skipped' : 'watched'

  const entry: ProcessedVideo = {
    videoKey: msg.clipId,
    platform: msg.platform,
    url: msg.url,
    capturedAt: Date.now() - msg.durationSeconds * 1000,
    durationSeconds: msg.durationSeconds,
    action,
    score: msg.result.score,
    label: msg.result.label,
    primaryPattern: msg.result.patterns?.[0]?.label,
    feedback: msg.result.feedback,
  }
  await recordVideo(entry)

  const verdict: Msg = { kind: 'verdict', clipId: msg.clipId, result: msg.result, action }
  chrome.tabs.sendMessage(msg.originTabId, verdict).catch(() => {})
}

async function handleRunDemo(sender: chrome.runtime.MessageSender): Promise<void> {
  const { tabId } = await resolveTargetTab(sender)
  const result = await getDemo()
  // Single relay; the content script handles fan-out / staggering.
  chrome.tabs.sendMessage(tabId, { kind: 'demo_result', result } satisfies Msg).catch(() => {})
}

async function handleRecordingError(
  msg: Extract<Msg, { kind: 'recording_error' }>,
): Promise<void> {
  await recordError(msg.message)
  if (msg.clipId) {
    await recordVideo({
      videoKey: msg.clipId,
      platform: msg.platform,
      url: msg.url,
      capturedAt: Date.now(),
      durationSeconds: 0,
      action: 'failed',
    })
  }
  const failed: Msg = { kind: 'verdict_failed', clipId: msg.clipId, error: msg.message }
  chrome.tabs.sendMessage(msg.originTabId, failed).catch(() => {})
}

chrome.runtime.onMessage.addListener((msg: Msg, sender, sendResponse) => {
  ;(async () => {
    try {
      switch (msg.kind) {
        case 'ping':
          sendResponse({ ok: true })
          return
        case 'start_loop':
          await handleStartLoop(msg, sender)
          sendResponse({ ok: true })
          return
        case 'stop_loop':
          await handleStopLoop()
          sendResponse({ ok: true })
          return
        case 'recording_result':
          await handleRecordingResult(msg)
          sendResponse({ ok: true })
          return
        case 'recording_error':
          await handleRecordingError(msg)
          sendResponse({ ok: true })
          return
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
        case 'loop_state_get':
          sendResponse({ active: !!active, tabId: active?.tabId ?? null })
          return
        case 'run_demo':
          await handleRunDemo(sender)
          sendResponse({ ok: true })
          return
        case 'reset_demo': {
          const { tabId } = await resolveTargetTab(sender)
          chrome.tabs.sendMessage(tabId, { kind: 'reset_demo' } satisfies Msg).catch(() => {})
          sendResponse({ ok: true })
          return
        }
        default:
          // verdict / verdict_failed / loop_status / offscreen_* are sent FROM
          // here, not handled here.
          sendResponse({ ok: true })
          return
      }
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  })()
  return true
})

// Tear down the loop if the originating tab closes.
chrome.tabs.onRemoved.addListener((tabId) => {
  if (active?.tabId === tabId) {
    active = null
    void stopOffscreen()
  }
})

chrome.runtime.onInstalled.addListener(async () => {
  await getSettings()
  await getSession()
})
