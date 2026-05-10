import { motion } from 'framer-motion'
import TribeCard from '../components/metis-core/TribeCard.jsx'
import { fadeUp, slowStagger, stagger } from '../lib/motion.js'

const TRIBES = [
  {
    name: 'Mechatronics Enthusiasts',
    blurb:
      'Builders, tinkerers, robotics. Trade prints, sensor specs, and post-mortem of Sunday workshop projects.',
    members: 4128,
    liveNow: 27,
    tags: ['Hardware', 'CAD', 'IRL meet-ups'],
    glyph: '⚙',
  },
  {
    name: 'Cybersec CTF Team',
    blurb:
      'Weekly capture-the-flag drills and writeups. Long-form discussion replaces shallow infosec dunking.',
    members: 2310,
    liveNow: 12,
    tags: ['CTF', 'Reverse-eng', 'Weekly'],
    glyph: '⚑',
  },
  {
    name: 'Slow Cinema Society',
    blurb:
      'A space for 90-minute attention spans. Pick a film, watch on your own time, then a deep thread.',
    members: 1894,
    liveNow: 0,
    tags: ['Film', 'Async', 'Long-form'],
    glyph: '◐',
  },
  {
    name: 'Outdoor Cartographers',
    blurb:
      'Trail mapping, route notes, gear talk. Translate scroll-time into trail-time — share photos from the actual trail.',
    members: 3502,
    liveNow: 41,
    tags: ['IRL', 'Outdoors', 'Maps'],
    glyph: '◬',
  },
  {
    name: 'Letterpress & Print',
    blurb:
      'Slow craft. Type setting, paper grain, ink mixing. Members ship physical zines four times a year.',
    members: 920,
    liveNow: 4,
    tags: ['Craft', 'Analog'],
    glyph: '◧',
  },
  {
    name: 'Synthesis Reading Group',
    blurb:
      'One book a month, read solo, discussed live on Sundays. Currently on Deutsch — The Beginning of Infinity.',
    members: 2208,
    liveNow: 19,
    tags: ['Reading', 'Weekly call'],
    glyph: '✺',
  },
]

export default function Agora() {
  return (
    <section id="agora" className="metis-section">
      <motion.header
        className="metis-section__head"
        variants={slowStagger}
        initial="hidden"
        animate="show"
      >
        <motion.span variants={fadeUp} className="metis-section__eyebrow">The Agora</motion.span>
        <motion.h2 variants={fadeUp} className="metis-section__title">An antidote to isolation.</motion.h2>
        <motion.p variants={fadeUp} className="metis-section__sub">
          Long-form discussions and offline activities. Pick a tribe — Metis surfaces the live
          conversations and IRL meet-ups happening right now.
        </motion.p>
      </motion.header>
      <motion.div
        className="metis-grid metis-grid--tribes"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        {TRIBES.map((t) => (
          <motion.div key={t.name} variants={fadeUp}>
            <TribeCard {...t} />
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}
