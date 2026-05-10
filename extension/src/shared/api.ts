import type { ProcessResponse } from './types'

// Override at build time, e.g.
//   VITE_METIS_API=http://localhost:8000 npm run build:ext
// Default points at the hosted FastAPI deployment so a sideloaded build
// works zero-config.
const BASE_URL: string =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (import.meta as any).env?.VITE_METIS_API ?? 'https://metis.mnkjoshi.ca'
const TIMEOUT_MS = 60_000

export async function postProcess(blob: Blob, filename = 'chunk.webm'): Promise<ProcessResponse> {
  const form = new FormData()
  form.append('video', blob, filename)

  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort('timeout'), TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE_URL}/process`, {
      method: 'POST',
      body: form,
      signal: ctl.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`process_http_${res.status}: ${body.slice(0, 200)}`)
    }
    return (await res.json()) as ProcessResponse
  } finally {
    clearTimeout(t)
  }
}

export async function postProcessWithRetry(blob: Blob, filename?: string): Promise<ProcessResponse> {
  try {
    return await postProcess(blob, filename)
  } catch {
    await new Promise((r) => setTimeout(r, 1500))
    return await postProcess(blob, filename)
  }
}

// GET /demo — server-side runs `parse_preds` against the bundled
// tribev2_sample_predictions.csv and returns the same shape as /process,
// including a baked colors.bin + geometry URLs in `brain`.
export async function getDemo(): Promise<ProcessResponse> {
  const res = await fetch(`${BASE_URL}/demo`, { method: 'GET' })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`demo_http_${res.status}: ${body.slice(0, 200)}`)
  }
  return (await res.json()) as ProcessResponse
}

// Re-export so other modules know which host the extension is targeting
// (e.g. BrainView needs the same origin to load /static/*.glb + colors.bin).
export const API_BASE = BASE_URL
