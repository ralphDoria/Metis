export type Platform = 'reels'

export type ScoreLabel = 'low' | 'average' | 'elevated' | 'high'

export interface Roi {
  reward: number
  salience: number
  pcc: number
  insula: number
  face: number
  social: number
  control: number
}

export interface PatternHit {
  key: string
  label: string
  description: string
  plausibility: string
  confidence: number
  confidence_label: 'low' | 'medium' | 'high'
}

export interface ProcessResponse {
  score: number
  label: ScoreLabel
  feedback: string
  n_timesteps: number
  n_vertices: number
  rois: Roi
  reward_composite: number
  salience_composite: number
  control_composite: number
  baseline_normalized: boolean
  variables: Array<{
    key: keyof Roi
    name: string
    value: number
    qualifier: 'low' | 'medium' | 'high'
  }>
  score_breakdown: Record<string, unknown>
  patterns: PatternHit[]
  brain?: Record<string, unknown>
  session_id: string | null
}

export type Sensitivity = 'gentle' | 'balanced' | 'strict'

export interface Settings {
  enabled: boolean
  sensitivity: Sensitivity
  perPlatform: Record<Platform, boolean>
  showOverlay: boolean
  pausedUntil?: number
}

export interface ProcessedVideo {
  videoKey: string
  platform: Platform
  url: string
  capturedAt: number
  durationSeconds: number
  action: 'watched' | 'skipped' | 'pending' | 'failed'
  score?: number
  label?: ScoreLabel
  primaryPattern?: string
  feedback?: string
}

export interface SessionState {
  sessionStart: number
  processedVideos: ProcessedVideo[]
  errors: Array<{ at: number; message: string }>
}

export type Msg =
  | { kind: 'capture_done'; videoKey: string; bytes: ArrayBuffer; mime: string; platform: Platform; url: string; durationSeconds: number }
  | { kind: 'verdict'; videoKey: string; result: ProcessResponse }
  | { kind: 'verdict_failed'; videoKey: string; error: string }
  | { kind: 'mark_skipped'; videoKey: string }
  | { kind: 'mark_watched'; videoKey: string }
  | { kind: 'settings_get' }
  | { kind: 'settings_set'; patch: Partial<Settings> }
  | { kind: 'session_get' }
  | { kind: 'session_reset' }
  | { kind: 'ping' }
