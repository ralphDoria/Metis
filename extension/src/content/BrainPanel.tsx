// Wraps the shared `<BrainView />` from the React webapp so it can render
// inside the extension's content-script shadow DOM. We pass `apiBase` so the
// BrainView fetches geometry + colors.bin from the same FastAPI deployment
// the rest of the extension talks to (defaults to https://metis.mnkjoshi.ca,
// override with VITE_METIS_API at build time).

import BrainView from '../../../src/BrainView.jsx'
import { API_BASE } from '../shared/api'

interface BrainPanelProps {
  brain: Record<string, unknown> | null | undefined
}

export function BrainPanel({ brain }: BrainPanelProps) {
  return (
    <div className="metis-overlay__brain-wrap">
      <BrainView brain={brain ?? null} compact apiBase={API_BASE} />
    </div>
  )
}
