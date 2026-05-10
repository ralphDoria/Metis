import BrainWireframe from './BrainWireframe.jsx'
import GlassButton from './GlassButton.jsx'
import './ExtensionOverlayPreview.css'

export default function ExtensionOverlayPreview({
  highlight = 'amygdala',
  reason = 'Content flagged for inducing cortisol spikes. Take a deep breath.',
  impact = 0.82,
}) {
  const pct = Math.round(impact * 100)
  return (
    <div className="metis-overlay">
      <div className="metis-overlay__chrome">
        <span className="metis-overlay__dot" />
        <span className="metis-overlay__dot" />
        <span className="metis-overlay__dot" />
        <span className="metis-overlay__url">instagram.com / reels</span>
      </div>
      <div className="metis-overlay__feed">
        <div className="metis-overlay__feed-card">
          <span className="metis-overlay__feed-skip">Skipped</span>
        </div>
        <div className="metis-overlay__overlay">
          <div className="metis-overlay__head">
            <span className="metis-overlay__badge">
              <span className="metis-overlay__badge-dot" /> Active Shield
            </span>
            <span className="metis-overlay__impact">
              Impact <strong>{pct}</strong>
            </span>
          </div>
          <div className="metis-overlay__body">
            <BrainWireframe highlight={highlight} size={200} />
            <div className="metis-overlay__copy">
              <p className="metis-overlay__why">Skipped: {reason}</p>
              <div className="metis-overlay__actions">
                <GlassButton tone="amethyst" size="sm">Join group discussion</GlassButton>
                <GlassButton tone="ghost" size="sm">View saved time</GlassButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
