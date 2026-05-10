export function impactFromResult(result) {
  if (!result) return null
  const total = result.total_minutes || 1
  const high = result.high_activation_minutes || 0
  const ratio = Math.max(0, Math.min(1, high / total))
  const coeff = Math.round(ratio * 100)
  // Time reclaimed = inverse of high-activation share.
  const reclaimed = 1 - ratio
  return { ratio, coeff, reclaimed }
}

export function highlightFromImpact(impact) {
  if (!impact) return 'none'
  if (impact.ratio >= 0.7) return 'both'
  if (impact.ratio >= 0.4) return 'amygdala'
  return 'none'
}
