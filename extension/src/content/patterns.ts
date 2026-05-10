// Hardcoded pattern pool used by the demo simulation. Picked at random for
// each newly-streamed card so labels look plausible without depending on the
// /demo response shape.
//
// Loosely modeled on the cortical-response taxonomy in server/parser.py —
// reward / salience / control / DMN compositions. Tweak text freely; the demo
// doesn't ground-truth these.

export interface DemoPattern {
  key: string
  label: string
  description: string
}

export const DEMO_PATTERNS: DemoPattern[] = [
  {
    key: 'reward_spike',
    label: 'Reward spike',
    description:
      'Ventral striatum firing well above session baseline — anticipation of a strong payoff.',
  },
  {
    key: 'salience_cascade',
    label: 'Salience cascade',
    description:
      'Insula + ACC co-activation. Stimulus is hijacking attention faster than top-down control can settle.',
  },
  {
    key: 'social_lock',
    label: 'Social-lock',
    description:
      'Face network + medial PFC sustained engagement. Comparative-self processing engaged.',
  },
  {
    key: 'novelty_chase',
    label: 'Novelty chase',
    description:
      'Hippocampal + dopaminergic surge with sub-100 ms decay between scrolls — classic loop bait.',
  },
  {
    key: 'control_collapse',
    label: 'Control collapse',
    description:
      'Lateral PFC suppression. Executive override is offline; reflexive scrolling is now in charge.',
  },
  {
    key: 'dmn_flicker',
    label: 'DMN flicker',
    description:
      'Default-mode network rebounding between reels — short-form mind-wandering with no closure.',
  },
  {
    key: 'affect_swing',
    label: 'Affect swing',
    description:
      'Amygdala band oscillating at the cut between reels. Emotional context-switching tax.',
  },
  {
    key: 'reward_drought',
    label: 'Reward drought',
    description:
      'Striatal trough. The system is hunting for a hit; engagement is high but reward is not landing.',
  },
]

export function pickPattern(rand: () => number = Math.random): DemoPattern {
  return DEMO_PATTERNS[Math.floor(rand() * DEMO_PATTERNS.length)]
}
