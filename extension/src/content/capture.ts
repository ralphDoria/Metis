export interface CaptureResult {
  blob: Blob
  durationSeconds: number
  mime: string
}

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

// Hard cap: only the first N seconds of any reel get analyzed. Anything past
// this is treated as "too late" — the user is already settled into the loop
// and the verdict can no longer drive a useful intervention.
export const FIRST_N_SECONDS = 10
const MIN_CAPTURE_MS = 1500

function pickMime(): string {
  for (const m of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return 'video/webm'
}

export async function captureChunk(videoEl: HTMLVideoElement): Promise<CaptureResult> {
  const stream =
    (videoEl as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.()
  if (!stream) throw new Error('capturestream_unavailable')

  // Where in the reel are we? `currentTime` may be NaN before metadata loads.
  const startedAt = Number.isFinite(videoEl.currentTime) ? videoEl.currentTime : 0
  if (startedAt >= FIRST_N_SECONDS) {
    throw new Error('past_first_window')
  }

  // For prefetched (paused) reels we can rewind to start so we always capture
  // the very first seconds. For active reels we never seek — yanking the
  // playhead back would be an obvious UI glitch.
  const wasPaused = videoEl.paused
  let captureStartTime = startedAt
  if (wasPaused && startedAt > 0.5) {
    try {
      videoEl.currentTime = 0
      captureStartTime = 0
    } catch {
      // seek may fail mid-load; fall through with whatever currentTime is.
    }
  }

  const remainingMs = Math.max(0, (FIRST_N_SECONDS - captureStartTime) * 1000)
  const ms = Math.min(FIRST_N_SECONDS * 1000, remainingMs)
  if (ms < MIN_CAPTURE_MS) throw new Error('first_window_too_short')

  const mime = pickMime()
  const rec = new MediaRecorder(stream, { mimeType: mime })
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data)
  }

  const t0 = performance.now()
  rec.start()

  if (wasPaused) {
    videoEl.muted = true
    try {
      await videoEl.play()
    } catch {
      // ignored: autoplay may be blocked; recorder still receives any frames.
    }
  }

  const stopped = new Promise<void>((resolve) => {
    rec.onstop = () => resolve()
  })
  const ended = new Promise<void>((resolve) => {
    const onEnded = () => {
      videoEl.removeEventListener('ended', onEnded)
      resolve()
    }
    videoEl.addEventListener('ended', onEnded, { once: true })
  })
  // Stop early if playhead reaches the first-N-seconds boundary, even if the
  // wall-clock timer hasn't expired (covers fast playback or seek-aheads).
  const reachedWindow = new Promise<void>((resolve) => {
    const tick = () => {
      if (videoEl.currentTime >= FIRST_N_SECONDS) return resolve()
      if (rec.state === 'inactive') return resolve()
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const timer = new Promise<void>((resolve) => setTimeout(resolve, ms))
  await Promise.race([timer, ended, reachedWindow])

  if (rec.state !== 'inactive') rec.stop()
  await stopped

  if (wasPaused) {
    try {
      videoEl.pause()
    } catch {
      // ignored
    }
  }

  const blob = new Blob(chunks, { type: mime })
  const durationSeconds = (performance.now() - t0) / 1000
  if (blob.size === 0) throw new Error('empty_capture')
  return { blob, durationSeconds, mime }
}

export function videoKey(el: HTMLVideoElement): string {
  const src = el.currentSrc || el.src || ''
  const id = el.dataset.metisId ?? (el.dataset.metisId = Math.random().toString(36).slice(2, 10))
  return `${id}::${hashString(src)}`
}

function hashString(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}
