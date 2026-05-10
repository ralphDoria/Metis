import type { ProcessResponse, Sensitivity } from './types'

const FLOORS: Record<Sensitivity, number> = {
  gentle: 0.85,
  balanced: 0.78,
  strict: 0.7,
}

export function shouldSkip(result: ProcessResponse, sensitivity: Sensitivity): boolean {
  const floor = FLOORS[sensitivity]
  if (result.label === 'high' && result.score >= floor) return true
  if (sensitivity === 'strict' && result.label === 'elevated' && result.score >= 0.8) return true
  return false
}
