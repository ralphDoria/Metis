import './BrainWireframe.css'

export default function BrainWireframe({
  highlight = 'none',  // 'none' | 'amygdala' | 'dopamine' | 'both'
  size = 280,
}) {
  const showAmy = highlight === 'amygdala' || highlight === 'both'
  const showDop = highlight === 'dopamine' || highlight === 'both'

  return (
    <div className="metis-brain" style={{ width: size, height: size * 0.78 }}>
      <svg viewBox="0 0 320 250" width="100%" height="100%" aria-hidden>
        <defs>
          <radialGradient id="metis-brain-glow-warn" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff8c00" stopOpacity="0.85" />
            <stop offset="60%" stopColor="#f472b6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#f472b6" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="metis-brain-glow-violet" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#a06bf0" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#8a2be2" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="metis-brain-stroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(160, 107, 240, 0.6)" />
            <stop offset="100%" stopColor="rgba(244, 114, 182, 0.4)" />
          </linearGradient>
        </defs>

        {/* Outer cortex contour */}
        <g stroke="url(#metis-brain-stroke)" fill="none" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M75,135 C55,105 65,55 110,42 C140,32 175,32 205,42 C250,55 265,100 245,135 C260,160 245,195 210,200 C195,225 140,225 120,200 C85,200 65,170 75,135 Z" opacity="0.85" />
          {/* Central fissure */}
          <path d="M160,40 C158,80 162,120 158,160 C156,180 162,200 160,215" opacity="0.6" />
          {/* Sulci — left hemisphere */}
          <path d="M95,80 C115,90 130,85 138,100" opacity="0.5" />
          <path d="M85,115 C110,120 130,115 140,130" opacity="0.5" />
          <path d="M90,150 C115,150 135,145 142,160" opacity="0.5" />
          <path d="M105,180 C125,178 140,175 145,190" opacity="0.5" />
          {/* Sulci — right hemisphere */}
          <path d="M225,80 C205,90 190,85 182,100" opacity="0.5" />
          <path d="M235,115 C210,120 190,115 180,130" opacity="0.5" />
          <path d="M230,150 C205,150 185,145 178,160" opacity="0.5" />
          <path d="M215,180 C195,178 180,175 175,190" opacity="0.5" />
          {/* Brainstem hint */}
          <path d="M150,210 C155,225 165,225 170,210" opacity="0.55" />
        </g>

        {/* Wireframe lattice — gives the 3D feel */}
        <g stroke="rgba(160, 107, 240, 0.18)" strokeWidth="0.8" fill="none">
          <ellipse cx="160" cy="125" rx="100" ry="80" />
          <ellipse cx="160" cy="125" rx="80" ry="80" />
          <ellipse cx="160" cy="125" rx="60" ry="80" />
          <ellipse cx="160" cy="125" rx="100" ry="60" />
          <ellipse cx="160" cy="125" rx="100" ry="40" />
        </g>

        {/* Dopamine pathways (mid-brain → cortex) */}
        <g
          className={`metis-brain__pathway ${showDop ? 'is-on' : ''}`}
          fill="none"
          strokeLinecap="round"
        >
          <circle cx="160" cy="155" r="14" fill="url(#metis-brain-glow-warn)" opacity={showDop ? 0.95 : 0} />
          <path d="M160,155 C140,140 130,115 120,95" stroke="#ff8c00" strokeWidth="1.6" />
          <path d="M160,155 C180,140 190,115 200,95" stroke="#ff8c00" strokeWidth="1.6" />
          <path d="M160,155 C155,135 152,110 150,80" stroke="#f472b6" strokeWidth="1.4" opacity="0.75" />
          <path d="M160,155 C165,135 168,110 170,80" stroke="#f472b6" strokeWidth="1.4" opacity="0.75" />
        </g>

        {/* Amygdala (bilateral, deep/medial) */}
        <g className={`metis-brain__amygdala ${showAmy ? 'is-on' : ''}`}>
          <circle cx="135" cy="160" r="11" fill="url(#metis-brain-glow-warn)" />
          <circle cx="135" cy="160" r="4.5" fill="#ff8c00" />
          <circle cx="185" cy="160" r="11" fill="url(#metis-brain-glow-warn)" />
          <circle cx="185" cy="160" r="4.5" fill="#ff8c00" />
        </g>

        {/* Ambient violet field if nothing flagged */}
        {highlight === 'none' && (
          <circle cx="160" cy="125" r="60" fill="url(#metis-brain-glow-violet)" />
        )}
      </svg>

      {(showAmy || showDop) && (
        <div className="metis-brain__legend">
          {showAmy && <span className="metis-brain__chip metis-brain__chip--warn">Amygdala</span>}
          {showDop && <span className="metis-brain__chip metis-brain__chip--warn">Dopamine pathways</span>}
        </div>
      )}
    </div>
  )
}
