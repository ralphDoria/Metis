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

// Each entry corresponds to one 10s clip. videoKey is now a per-clip uuid.
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

// New message protocol — sequential capture loop, no cancellation.
export type Msg =
  // content → background
  | { kind: 'start_loop'; platform: Platform; url: string }
  | { kind: 'stop_loop'; reason: 'navigation' | 'tab_hidden' | 'user_disabled' | 'tab_closed' }
  // background → offscreen
  | {
      kind: 'offscreen_start'
      streamId: string
      durationMs: number
      originTabId: number
      platform: Platform
      url: string
    }
  | { kind: 'offscreen_stop' }
  // offscreen → background
  | {
      kind: 'recording_result'
      clipId: string
      result: ProcessResponse
      mime: string
      sizeBytes: number
      durationSeconds: number
      originTabId: number
      platform: Platform
      url: string
    }
  | {
      kind: 'recording_error'
      clipId: string
      message: string
      originTabId: number
      platform: Platform
      url: string
    }
  // background → content
  | { kind: 'verdict'; clipId: string; result: ProcessResponse; action: 'watched' | 'skipped' }
  | { kind: 'verdict_failed'; clipId: string; error: string }
  | { kind: 'loop_status'; status: 'recording' | 'analyzing' | 'idle' }
  // popup ↔ background
  | { kind: 'settings_get' }
  | { kind: 'settings_set'; patch: Partial<Settings> }
  | { kind: 'session_get' }
  | { kind: 'session_reset' }
  | { kind: 'loop_state_get' }
  // Demo mode — bypass tabCapture, hit /demo and fan out cards + brain.
  | { kind: 'run_demo' }
  | { kind: 'demo_result'; result: ProcessResponse }
  | { kind: 'reset_demo' }
  | { kind: 'ping' }
