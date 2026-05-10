import type { ProcessResponse } from './types'

const BASE_URL = 'https://metis.mnkjoshi.ca'
const TIMEOUT_MS = 12_000

export async function postProcess(blob: Blob, opts: { signal?: AbortSignal } = {}): Promise<ProcessResponse> {
  const form = new FormData()
  form.append('video', blob, 'chunk.webm')

  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort('timeout'), TIMEOUT_MS)
  const signal = mergeSignals(ctl.signal, opts.signal)
  try {
    const res = await fetch(`${BASE_URL}/process`, { method: 'POST', body: form, signal })
    if (!res.ok) throw new Error(`process_http_${res.status}`)
    return (await res.json()) as ProcessResponse
  } finally {
    clearTimeout(t)
  }
}

export async function postProcessWithRetry(blob: Blob): Promise<ProcessResponse> {
  try {
    return await postProcess(blob)
  } catch (e) {
    await new Promise((r) => setTimeout(r, 1500))
    return await postProcess(blob)
  }
}

function mergeSignals(a: AbortSignal, b?: AbortSignal): AbortSignal {
  if (!b) return a
  const ctl = new AbortController()
  const onAbort = () => ctl.abort()
  a.addEventListener('abort', onAbort)
  b.addEventListener('abort', onAbort)
  return ctl.signal
}
