// Shared message contract between content script, service worker, and offscreen doc.
// Keeping these in one file means a TS error if any participant goes out of sync.

export type StartRecordingMsg = {
  type: 'metaware/start-recording'
  durationMs: number
}

export type StreamReadyMsg = {
  type: 'metaware/stream-ready'
  streamId: string
  durationMs: number
  // Original tab id so background can route the resulting payload back to it.
  originTabId: number
}

// Offscreen doc POSTs the recording straight to the /process endpoint and
// reports the parsed JSON back. Going through chrome.runtime.sendMessage with
// a Blob is unreliable across SW ↔ offscreen ↔ content (Chrome JSON-serialises
// it and the bytes silently turn into `{}`), so we keep the binary inside the
// offscreen doc and only pass small JSON across runtime messages.
export type RecordingResultMsg = {
  type: 'metaware/recording-result'
  // Whatever /process returns. Server contract: { feedback, high_activation_minutes,
  // total_minutes, brain, session_id }. Kept loose here so server changes don't
  // ripple into the message types.
  result: unknown
  filename: string
  mimeType: string
  sizeBytes: number
  originTabId: number
}

export type RecordingErrorMsg = {
  type: 'metaware/recording-error'
  message: string
  originTabId?: number
}

export type ExtensionMsg =
  | StartRecordingMsg
  | StreamReadyMsg
  | RecordingResultMsg
  | RecordingErrorMsg

export const OFFSCREEN_PATH = 'src/offscreen.html'

// /process endpoint. Default to the hosted FastAPI deployment so a sideloaded
// extension works zero-config. Override at build time via VITE_METAWARE_API
// (e.g. `VITE_METAWARE_API=http://localhost:8000 npx vite build`) when iterating
// against a local uvicorn.
export const API_BASE: string =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (import.meta as any).env?.VITE_METAWARE_API ?? 'https://metis.mnkjoshi.ca'
