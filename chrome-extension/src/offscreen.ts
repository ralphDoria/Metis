// Offscreen document: hosts MediaRecorder + the MediaStream from chrome.tabCapture,
// and POSTs the resulting clip directly to the Metaware /process endpoint.
//
// The service worker drives this via chrome.runtime messages. Flow:
//   1. SW gets a stream id from chrome.tabCapture.getMediaStreamId.
//   2. SW posts {stream-ready, streamId, durationMs, originTabId} to us.
//   3. We claim the stream via getUserMedia({chromeMediaSource:'tab'}).
//   4. New MediaRecorder, start(), setTimeout(stop, durationMs).
//   5. On stop: assemble Blob, POST multipart to API_BASE/process.
//   6. Send the JSON result (or an error) back through the SW to the
//      originating Instagram tab's content script.
//
// We POST from here rather than from the content script because:
//   - Chrome SW ↔ content runtime messages JSON-serialise; Blob/ArrayBuffer
//     transport across that boundary is fragile and previously corrupted clips
//     into ascii garbage that ffmpeg mis-sniffed as `lrc` subtitle.
//   - Offscreen has fetch + DOM + structured-clone-safe Blob locally.

import {
  API_BASE,
  ExtensionMsg,
  RecordingErrorMsg,
  RecordingResultMsg,
  StreamReadyMsg,
} from './messages'

const MP4_MIME = 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"'
const WEBM_MIME = 'video/webm;codecs="vp8,opus"'

function chooseMime(): { mime: string; ext: 'mp4' | 'webm' } {
  if (MediaRecorder.isTypeSupported(MP4_MIME)) return { mime: MP4_MIME, ext: 'mp4' }
  if (MediaRecorder.isTypeSupported(WEBM_MIME)) return { mime: WEBM_MIME, ext: 'webm' }
  throw new Error('No supported MediaRecorder mime type in this Chrome build.')
}

function timestampedFilename(ext: string): string {
  // Avoid colons (illegal on Windows + awkward in URLs).
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  return `metaware-${ts}.${ext}`
}

async function magicBytes(blob: Blob): Promise<string> {
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer())
  return Array.from(head, (b) => b.toString(16).padStart(2, '0')).join(' ')
}

async function postClip(blob: Blob, filename: string, mime: string): Promise<unknown> {
  const form = new FormData()
  form.append('video', blob, filename)
  const url = `${API_BASE}/process`
  const res = await fetch(url, { method: 'POST', body: form })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`POST ${url} → ${res.status} ${res.statusText}: ${body.slice(0, 500)}`)
  }
  return res.json()
}

async function recordOnce(streamId: string, durationMs: number, originTabId: number): Promise<void> {
  const constraints = {
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    },
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    },
  } as unknown as MediaStreamConstraints

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints)
  } catch (err) {
    sendError(`getUserMedia failed: ${(err as Error).message}`, originTabId)
    return
  }

  // tabCapture returns a stream that mutes tab audio by default. Restore it
  // so the user can still hear Instagram while we record.
  const audioCtx = new AudioContext()
  const source = audioCtx.createMediaStreamSource(stream)
  source.connect(audioCtx.destination)

  const { mime, ext } = chooseMime()
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 2_500_000,
    audioBitsPerSecond: 128_000,
  })

  const chunks: BlobPart[] = []
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data)
  }

  recorder.onstop = async () => {
    // Tear down stream tracks first — frees the tab capture so the user sees
    // no recording indicator beyond the duration window.
    stream.getTracks().forEach((track) => track.stop())
    audioCtx.close().catch(() => {})

    const blob = new Blob(chunks, { type: mime })
    const filename = timestampedFilename(ext)

    // Sanity log: lets us tell at a glance whether the recorder produced a
    // real container vs. an empty/text blob.
    console.log(
      '[metaware/offscreen] clip ready',
      'size=',
      blob.size,
      'mime=',
      mime,
      'magic=',
      await magicBytes(blob),
    )

    if (blob.size < 50_000) {
      sendError(
        `recording too small (${blob.size} bytes) — capture probably never produced a keyframe`,
        originTabId,
      )
      return
    }

    try {
      const result = await postClip(blob, filename, mime)
      const msg: RecordingResultMsg = {
        type: 'metaware/recording-result',
        result,
        filename,
        mimeType: mime,
        sizeBytes: blob.size,
        originTabId,
      }
      await chrome.runtime.sendMessage(msg)
    } catch (err) {
      sendError(`upload failed: ${(err as Error).message}`, originTabId)
    }
  }

  recorder.onerror = (event) => {
    sendError(`MediaRecorder error: ${(event as ErrorEvent).message ?? 'unknown'}`, originTabId)
  }

  recorder.start()
  // Single shot: stop after durationMs. Rolling buffer comes later.
  setTimeout(() => {
    if (recorder.state === 'recording') recorder.stop()
  }, durationMs)
}

function sendError(message: string, originTabId: number) {
  const err: RecordingErrorMsg = {
    type: 'metaware/recording-error',
    message,
    originTabId,
  }
  chrome.runtime.sendMessage(err).catch(() => {})
}

chrome.runtime.onMessage.addListener((message: ExtensionMsg) => {
  if (message.type === 'metaware/stream-ready') {
    const m = message as StreamReadyMsg
    recordOnce(m.streamId, m.durationMs, m.originTabId).catch((err) => {
      console.error('[metaware/offscreen] recordOnce threw', err)
      sendError(String(err?.message ?? err), m.originTabId)
    })
  }
  return false
})
