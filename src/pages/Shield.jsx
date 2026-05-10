import { useOutletContext } from 'react-router-dom'
import { motion } from 'framer-motion'
import ExtensionOverlayPreview from '../components/metis-core/ExtensionOverlayPreview.jsx'
import { impactFromResult, highlightFromImpact } from '../lib/impact.js'
import { fadeUp, slowStagger, easeOut } from '../lib/motion.js'

const SHIELD_FACETS = [
  {
    title: 'Real-time skip',
    body:
      'When TribeV2 flags an inbound clip as high cortisol or shallow-dopamine, Metis advances the feed before the spike registers.',
  },
  {
    title: 'Cognitive impact card',
    body:
      'A glassy, non-intrusive overlay names what was flagged — Amygdala, Dopamine pathways — so the user keeps a model of the system, not just the result.',
  },
  {
    title: 'Habit redirect',
    body:
      'Every shield event surfaces a one-tap exit ramp into the Agora — a tribe discussion, an offline activity, or a saved-time tally.',
  },
]

export default function Shield() {
  const { result } = useOutletContext()
  const impact = impactFromResult(result)
  const highlight = highlightFromImpact(impact)

  return (
    <section id="shield" className="metis-section">
      <motion.header
        className="metis-section__head"
        variants={slowStagger}
        initial="hidden"
        animate="show"
      >
        <motion.span variants={fadeUp} className="metis-section__eyebrow">Active Shield</motion.span>
        <motion.h2 variants={fadeUp} className="metis-section__title">
          When Metis intervenes, this is what you see.
        </motion.h2>
        <motion.p variants={fadeUp} className="metis-section__sub">
          The browser extension overlays a quiet, glassy pane the moment it skips an addictive
          clip — naming the system flagged, offering a redirect into something restorative.
        </motion.p>
      </motion.header>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: easeOut }}
      >
        <ExtensionOverlayPreview
          highlight={highlight === 'none' ? 'amygdala' : highlight}
          impact={impact ? impact.ratio : 0.74}
          reason={
            result
              ? `Predicted high activation across ${impact.coeff}% of the clip. Take a deep breath.`
              : 'Content flagged for inducing cortisol spikes. Take a deep breath.'
          }
        />
      </motion.div>

      <motion.div
        className="metis-shield__facets"
        variants={slowStagger}
        initial="hidden"
        animate="show"
      >
        {SHIELD_FACETS.map((f) => (
          <motion.article key={f.title} variants={fadeUp} className="metis-panel metis-shield__facet">
            <h4 className="metis-panel__h4">{f.title}</h4>
            <p className="metis-panel__caption">{f.body}</p>
          </motion.article>
        ))}
      </motion.div>
    </section>
  )
}
