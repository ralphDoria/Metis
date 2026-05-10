// Hard-coded demo data so the dashboard looks populated without a backend.
// Swap to live data once Firestore session history is wired up end-to-end.

export const DEMO_AGGREGATE = {
  totalSessions: 47,
  totalWatchMinutes: 612,
  timeSavedMinutes: 184,
  highActivationMinutes: 268,
  currentStreakDays: 9,
  weeklyDelta: -18, // percent change in addiction score vs prior week
}

export const DEMO_WEEKLY_TREND = [82, 78, 74, 71, 68, 64, 58]

export const DEMO_SESSIONS = [
  {
    id: 'demo-1',
    video_filename: 'reels-evening-scroll.mp4',
    created_at: '2026-05-10T21:42:00Z',
    high_activation_minutes: 7,
    total_minutes: 12,
    feedback: 'High dopamine + cortisol spikes. Recommend a 20-minute break.',
  },
  {
    id: 'demo-2',
    video_filename: 'tiktok-lunch-break.mp4',
    created_at: '2026-05-10T13:18:00Z',
    high_activation_minutes: 4,
    total_minutes: 15,
    feedback: 'Mostly long-form content — protective shield held.',
  },
  {
    id: 'demo-3',
    video_filename: 'reels-morning.mp4',
    created_at: '2026-05-09T08:05:00Z',
    high_activation_minutes: 9,
    total_minutes: 14,
    feedback: 'Amygdala flagged repeatedly. Outrage-bait pattern detected.',
  },
  {
    id: 'demo-4',
    video_filename: 'reels-commute.mp4',
    created_at: '2026-05-08T18:32:00Z',
    high_activation_minutes: 3,
    total_minutes: 11,
    feedback: 'Educational + slow-cinema mix. Healthy session.',
  },
  {
    id: 'demo-5',
    video_filename: 'tiktok-late-night.mp4',
    created_at: '2026-05-07T23:51:00Z',
    high_activation_minutes: 11,
    total_minutes: 18,
    feedback: 'Doomscroll signature. Shield interventions: 6.',
  },
  {
    id: 'demo-6',
    video_filename: 'reels-weekend.mp4',
    created_at: '2026-05-06T15:14:00Z',
    high_activation_minutes: 5,
    total_minutes: 13,
    feedback: 'Mixed reward signal — borderline addictive loop.',
  },
  {
    id: 'demo-7',
    video_filename: 'tiktok-creators.mp4',
    created_at: '2026-05-05T11:27:00Z',
    high_activation_minutes: 2,
    total_minutes: 9,
    feedback: 'Craft & maker content — minimal cortisol load.',
  },
]

export function formatMinutes(mins) {
  if (mins == null) return '0m'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
