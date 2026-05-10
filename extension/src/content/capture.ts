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

function pickMime(): string {
  for (const m of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return 'video/webm'
}

export async function captureChunk(
  videoEl: HTMLVideoElement,
  ms = 4500,
): Promise<CaptureResult> {
  const stream =
    (videoEl as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.()
  if (!stream) throw new Error('capturestream_unavailable')

  const mime = pickMime()
  const rec = new MediaRecorder(stream, { mimeType: mime })
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data)
  }

  const t0 = performance.now()
  rec.start()

  const wasPaused = videoEl.paused
  if (wasPaused) {
    videoEl.muted = true
    try {
      await videoEl.play()
    } catch {
      // ignored: autoplay may be blocked; recorder still gets prior frames
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
  const timer = new Promise<void>((resolve) => setTimeout(resolve, ms))
  await Promise.race([timer, ended])

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
