import type { Settings } from './types'

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  sensitivity: 'balanced',
  perPlatform: { reels: true },
  showOverlay: true,
}

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS)
  return { ...DEFAULT_SETTINGS, ...stored } as Settings
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings()
  const next = { ...current, ...patch, perPlatform: { ...current.perPlatform, ...(patch.perPlatform ?? {}) } }
  await chrome.storage.sync.set(next)
  return next
}

export function isPaused(s: Settings): boolean {
  if (!s.enabled) return true
  if (s.pausedUntil && Date.now() < s.pausedUntil) return true
  return false
}
