// Service worker: orchestrates tab capture across content script ↔ offscreen doc.
//
// Service workers can't host MediaRecorder (no DOM), so we stand up an offscreen
// document on demand and brokerage the chrome.tabCapture stream id over to it.
// The offscreen doc does the actual recording and ships the blob back here, which
// we then forward to the originating Instagram tab's content script.

import {
  ExtensionMsg,
  OFFSCREEN_PATH,
  RecordingErrorMsg,
  RecordingResultMsg,
  StartRecordingMsg,
  StreamReadyMsg,
} from './messages'

const RECORDING_DURATION_MS = 10_000

async function ensureOffscreenDocument(): Promise<void> {
  // chrome.offscreen.hasDocument is gone as of Chrome 116-ish; use getContexts.
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
  })
  if (existing.length > 0) return

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['USER_MEDIA' as chrome.offscreen.Reason],
    justification:
      'Hosts MediaRecorder for Metaware tab-capture recording (cannot run in service worker).',
  })
}

async function getMediaStreamIdForTab(targetTabId: number): Promise<string> {
  // consumerTabId must be the offscreen document's tab id, which is implicit
  // when the offscreen doc is the only consumer in the extension. Passing
  // undefined makes Chrome scope the stream to the current extension context,
  // which the offscreen doc can then claim via getUserMedia.
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId(
      { targetTabId },
      (streamId) => {
        const err = chrome.runtime.lastError
        if (err || !streamId) {
          reject(new Error(err?.message ?? 'getMediaStreamId returned no id'))
          return
        }
        resolve(streamId)
      },
    )
  })
}

async function handleStartRecording(
  _msg: StartRecordingMsg,
  sender: chrome.runtime.MessageSender,
): Promise<void> {
  const tabId = sender.tab?.id
  if (typeof tabId !== 'number') {
    throw new Error('start-recording came from a sender with no tab id')
  }

  await ensureOffscreenDocument()
  const streamId = await getMediaStreamIdForTab(tabId)

  const ready: StreamReadyMsg = {
    type: 'metaware/stream-ready',
    streamId,
    durationMs: RECORDING_DURATION_MS,
    originTabId: tabId,
  }
  // Service worker → offscreen doc. Offscreen has chrome.runtime.onMessage
  // listeners attached when its DOM loads.
  await chrome.runtime.sendMessage(ready)
}

function forwardToTab(
  tabId: number,
  msg: RecordingResultMsg | RecordingErrorMsg,
): void {
  chrome.tabs.sendMessage(tabId, msg).catch((err) => {
    // Tab might have been closed mid-recording; not fatal.
    console.warn('[metaware/bg] forward to tab failed', err)
  })
}

chrome.runtime.onMessage.addListener((message: ExtensionMsg, sender, sendResponse) => {
  if (message.type === 'metaware/start-recording') {
    handleStartRecording(message, sender)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        console.error('[metaware/bg] start-recording failed', err)
        sendResponse({ ok: false, error: String(err?.message ?? err) })
        // Also surface the failure to the originating tab so the modal can
        // re-enable its button.
        const tabId = sender.tab?.id
        if (typeof tabId === 'number') {
          forwardToTab(tabId, {
            type: 'metaware/recording-error',
            message: String(err?.message ?? err),
          })
        }
      })
    return true // keep the message channel alive for async sendResponse
  }

  if (
    message.type === 'metaware/recording-result' ||
    message.type === 'metaware/recording-error'
  ) {
    // These come from the offscreen doc; route to the tab that started the session.
    // The offscreen doc echoes originTabId from the stream-ready payload it
    // received, so we just relay.
    if (typeof message.originTabId === 'number') {
      forwardToTab(message.originTabId, message)
    } else {
      console.warn('[metaware/bg] recording message lacked originTabId', message)
    }
    sendResponse({ ok: true })
    return false
  }

  return false
})

// Single 10s recording is well within the SW idle window, so no keepalive
// needed for this iteration. When we move to rolling-buffer sessions, add
// chrome.alarms-based keepalive here.
