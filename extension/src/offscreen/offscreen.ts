// Offscreen document — owns the tab MediaStream + MediaRecorder and runs the
// sequential capture loop. Service workers can't host MediaRecorder (no DOM)
// and we deliberately POST /process from here too, so binary clip data never
// has to traverse runtime.sendMessage (which JSON-serialises and corrupts
// Blobs / ArrayBuffers in some Chrome builds).
//
// Lifecycle:
//   1. Background sends `offscreen_start` once with a tab streamId.
//   2. We claim the stream via getUserMedia, then loop:
//        record durationMs → assemble Blob → POST /process →
//        forward `recording_result` to background → repeat
//      strictly sequential: no overlap between recording and upload.
//   3. On `offscreen_stop` (URL leave / tab hidden / disabled): clear the
//      `running` flag; the in-flight recorder is stopped early; loop exits
//      after the current iteration.

import { postProcessWithRetry } from '../shared/api'
import type { Msg, Platform } from '../shared/types'

const MIME_CANDIDATES = [
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
] as const

const MIN_BLOB_BYTES = 50_000

interface LoopContext {
  stream: MediaStream
  audioCtx: AudioContext
  durationMs: number
  originTabId: number
  platform: Platform
  url: string
}

let running = false
let activeRecorder: MediaRecorder | null = null
let ctx: LoopContext | null = null

function chooseMime(): { mime: string; ext: 'mp4' | 'webm' } {
  for (const m of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(m)) {
      return { mime: m, ext: m.startsWith('video/mp4') ? 'mp4' : 'webm' }
    }
  }
  // Fallback — should never hit on Chrome 126+.
  return { mime: 'video/webm', ext: 'webm' }
}

function clipFilename(ext: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  return `metis-${ts}.${ext}`
}

async function magicHex(blob: Blob): Promise<string> {
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer())
  return Array.from(head, (b) => b.toString(16).padStart(2, '0')).join(' ')
}

function clipId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

async function recordOneClip(c: LoopContext): Promise<Blob> {
  const { mime, ext } = chooseMime()
  void ext
  const recorder = new MediaRecorder(c.stream, {
    mimeType: mime,
    videoBitsPerSecond: 2_500_000,
    audioBitsPerSecond: 128_000,
  })
  activeRecorder = recorder

  const chunks: BlobPart[] = []
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data)
  }

  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve()
  })

  recorder.start()
  // Wall-clock window. If the loop is asked to stop early, the stop_loop
  // handler calls recorder.stop() directly; this timeout becomes a no-op.
  const timer = setTimeout(() => {
    if (recorder.state === 'recording') recorder.stop()
  }, c.durationMs)

  await stopped
  clearTimeout(timer)
  activeRecorder = null

  return new Blob(chunks, { type: mime })
}

async function loop(c: LoopContext): Promise<void> {
  while (running) {
    const id = clipId()
    const t0 = performance.now()
    let blob: Blob
    try {
      blob = await recordOneClip(c)
    } catch (e) {
      reportError(id, c, `record_failed: ${(e as Error).message}`)
      break
    }

    if (!running) break // stop arrived during recording

    const sizeBytes = blob.size
    const durationSeconds = (performance.now() - t0) / 1000

    console.log(
      '[metis/offscreen] clip',
      'id=', id,
      'size=', sizeBytes,
      'mime=', blob.type,
      'magic=', await magicHex(blob),
    )

    if (sizeBytes < MIN_BLOB_BYTES) {
      reportError(
        id,
        c,
        `clip_too_small: ${sizeBytes} bytes — capture produced no frames`,
      )
      // Don't tight-loop on a degenerate stream.
      await sleep(500)
      continue
    }

    try {
      const result = await postProcessWithRetry(blob, clipFilename(blob.type.includes('mp4') ? 'mp4' : 'webm'))
      const msg: Msg = {
        kind: 'recording_result',
        clipId: id,
        result,
        mime: blob.type,
        sizeBytes,
        durationSeconds,
        originTabId: c.originTabId,
        platform: c.platform,
        url: c.url,
      }
      chrome.runtime.sendMessage(msg).catch(() => {})
    } catch (e) {
      reportError(id, c, `upload_failed: ${(e as Error).message}`)
    }
  }

  // Loop exited — clean up.
  teardown()
}

function reportError(id: string, c: LoopContext, message: string): void {
  const msg: Msg = {
    kind: 'recording_error',
    clipId: id,
    message,
    originTabId: c.originTabId,
    platform: c.platform,
    url: c.url,
  }
  chrome.runtime.sendMessage(msg).catch(() => {})
}

function teardown(): void {
  if (ctx) {
    ctx.stream.getTracks().forEach((t) => t.stop())
    ctx.audioCtx.close().catch(() => {})
    ctx = null
  }
  activeRecorder = null
  running = false
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function start(streamId: string, durationMs: number, originTabId: number, platform: Platform, url: string): Promise<void> {
  if (running) return // idempotent — already looping

  const constraints = {
    video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
  } as unknown as MediaStreamConstraints

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints)
  } catch (e) {
    chrome.runtime
      .sendMessage({
        kind: 'recording_error',
        clipId: '',
        message: `getUserMedia_failed: ${(e as Error).message}`,
        originTabId,
        platform,
        url,
      } satisfies Msg)
      .catch(() => {})
    return
  }

  // tabCapture mutes the source tab by default; pipe back to speakers so the
  // user keeps hearing reels while we record.
  const audioCtx = new AudioContext()
  audioCtx.createMediaStreamSource(stream).connect(audioCtx.destination)

  ctx = { stream, audioCtx, durationMs, originTabId, platform, url }
  running = true
  loop(ctx).catch((e) => {
    console.error('[metis/offscreen] loop crashed', e)
    teardown()
  })
}

function stop(): void {
  running = false
  if (activeRecorder && activeRecorder.state === 'recording') {
    try {
      activeRecorder.stop()
    } catch {
      // ignored
    }
  }
}

chrome.runtime.onMessage.addListener((message: Msg) => {
  if (message.kind === 'offscreen_start') {
    void start(
      message.streamId,
      message.durationMs,
      message.originTabId,
      message.platform,
      message.url,
    )
  } else if (message.kind === 'offscreen_stop') {
    stop()
  }
  return false
})
