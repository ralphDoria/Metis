export const API_BASE = 'http://localhost:8000'

export async function fetchSessions(limit = 20) {
  const res = await fetch(`${API_BASE}/sessions?limit=${limit}`)
  if (!res.ok) throw new Error(`sessions request failed: ${res.status}`)
  const data = await res.json()
  return data.sessions ?? []
}

export async function fetchSession(id) {
  const res = await fetch(`${API_BASE}/sessions/${id}`)
  if (!res.ok) throw new Error(`session ${id} fetch failed: ${res.status}`)
  return res.json()
}
