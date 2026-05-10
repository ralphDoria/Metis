import type { ProcessResponse } from './types'

const BASE_URL = 'https://metis.mnkjoshi.ca'
const TIMEOUT_MS = 30_000

interface PostProcessOpts {
  jobId?: string
  signal?: AbortSignal
}

export async function postProcess(blob: Blob, opts: PostProcessOpts = {}): Promise<ProcessResponse> {
  const form = new FormData()
  form.append('video', blob, 'chunk.webm')

  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort('timeout'), TIMEOUT_MS)
  const signal = mergeSignals(ctl.signal, opts.signal)
  const url = opts.jobId
    ? `${BASE_URL}/process?job_id=${encodeURIComponent(opts.jobId)}`
    : `${BASE_URL}/process`
  try {
    const res = await fetch(url, { method: 'POST', body: form, signal })
    if (!res.ok) throw new Error(`process_http_${res.status}`)
    return (await res.json()) as ProcessResponse
  } finally {
    clearTimeout(t)
  }
}

export async function postProcessWithRetry(blob: Blob, opts: PostProcessOpts = {}): Promise<ProcessResponse> {
  try {
    return await postProcess(blob, opts)
  } catch (e) {
    if (opts.signal?.aborted) throw e
    await new Promise((r) => setTimeout(r, 1500))
    return await postProcess(blob, opts)
  }
}

export async function cancelProcess(jobId: string): Promise<void> {
  try {
    await fetch(`${BASE_URL}/process/cancel/${encodeURIComponent(jobId)}`, {
      method: 'POST',
      keepalive: true,
    })
  } catch {
    // best-effort — the network round-trip itself may fail; nothing to do.
  }
}

function mergeSignals(a: AbortSignal, b?: AbortSignal): AbortSignal {
  if (!b) return a
  if (b.aborted) {
    const ctl = new AbortController()
    ctl.abort()
    return ctl.signal
  }
  const ctl = new AbortController()
  const onAbort = () => ctl.abort()
  a.addEventListener('abort', onAbort)
  b.addEventListener('abort', onAbort)
  return ctl.signal
}
