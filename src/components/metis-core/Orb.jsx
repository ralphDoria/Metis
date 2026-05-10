import { useEffect, useRef, useState } from 'react'
import './Orb.css'

export default function Orb({ size = 320, intensity = 1, tone = 'amethyst' }) {
  const wrapRef = useRef(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onMove = (e) => {
      const r = el.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const dx = (e.clientX - cx) / r.width
      const dy = (e.clientY - cy) / r.height
      setTilt({ x: Math.max(-1, Math.min(1, dx)), y: Math.max(-1, Math.min(1, dy)) })
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  const style = {
    '--orb-size': `${size}px`,
    '--orb-intensity': intensity,
    '--orb-tx': `${tilt.x * 14}px`,
    '--orb-ty': `${tilt.y * 14}px`,
    '--orb-rot-x': `${-tilt.y * 8}deg`,
    '--orb-rot-y': `${tilt.x * 8}deg`,
  }

  return (
    <div ref={wrapRef} className={`metis-orb metis-orb--${tone}`} style={style} aria-hidden>
      <div className="metis-orb__halo" />
      <div className="metis-orb__shell">
        <div className="metis-orb__core" />
        <div className="metis-orb__ring metis-orb__ring--a" />
        <div className="metis-orb__ring metis-orb__ring--b" />
        <div className="metis-orb__ring metis-orb__ring--c" />
        <div className="metis-orb__sheen" />
      </div>
      <div className="metis-orb__shadow" />
    </div>
  )
}
