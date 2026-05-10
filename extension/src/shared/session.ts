import type { ProcessedVideo, SessionState } from './types'

const KEY = 'session'
const ERROR_RING_SIZE = 50
const VIDEO_RING_SIZE = 200

async function readState(): Promise<SessionState> {
  const stored = (await chrome.storage.session.get(KEY)) as { session?: SessionState }
  if (stored.session) return stored.session
  const fresh: SessionState = { sessionStart: Date.now(), processedVideos: [], errors: [] }
  await chrome.storage.session.set({ [KEY]: fresh })
  return fresh
}

async function writeState(s: SessionState): Promise<void> {
  await chrome.storage.session.set({ [KEY]: s })
}

export async function getSession(): Promise<SessionState> {
  return readState()
}

export async function resetSession(): Promise<void> {
  const fresh: SessionState = { sessionStart: Date.now(), processedVideos: [], errors: [] }
  await writeState(fresh)
}

export async function recordVideo(v: ProcessedVideo): Promise<void> {
  const s = await readState()
  const existing = s.processedVideos.findIndex((x) => x.videoKey === v.videoKey)
  if (existing >= 0) {
    s.processedVideos[existing] = { ...s.processedVideos[existing], ...v }
  } else {
    s.processedVideos.push(v)
  }
  if (s.processedVideos.length > VIDEO_RING_SIZE) {
    s.processedVideos.splice(0, s.processedVideos.length - VIDEO_RING_SIZE)
  }
  await writeState(s)
}

export async function recordError(message: string): Promise<void> {
  const s = await readState()
  s.errors.push({ at: Date.now(), message })
  if (s.errors.length > ERROR_RING_SIZE) {
    s.errors.splice(0, s.errors.length - ERROR_RING_SIZE)
  }
  await writeState(s)
}
