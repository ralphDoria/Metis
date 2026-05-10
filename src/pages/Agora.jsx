import { useMemo, useState } from 'react'
import { useOutletContext, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import TribeCard from '../components/metis-core/TribeCard.jsx'
import GlassButton from '../components/metis-core/GlassButton.jsx'
import { fadeUp, slowStagger, stagger } from '../lib/motion.js'
import { DEMO_AGGREGATE, formatMinutes } from '../lib/demo-stats.js'

const TRIBES = [
  {
    name: 'Mechatronics Enthusiasts',
    blurb:
      'Builders, tinkerers, robotics. Trade prints, sensor specs, and post-mortems of Sunday workshop projects.',
    members: 4128,
    liveNow: 27,
    tags: ['Hardware', 'CAD', 'IRL meet-ups'],
    glyph: '⚙',
    category: 'craft',
  },
  {
    name: 'Cybersec CTF Team',
    blurb:
      'Weekly capture-the-flag drills and writeups. Long-form discussion replaces shallow infosec dunking.',
    members: 2310,
    liveNow: 12,
    tags: ['CTF', 'Reverse-eng', 'Weekly'],
    glyph: '⚑',
    category: 'mind',
  },
  {
    name: 'Slow Cinema Society',
    blurb:
      'A space for 90-minute attention spans. Pick a film, watch on your own time, then a deep thread.',
    members: 1894,
    liveNow: 0,
    tags: ['Film', 'Async', 'Long-form'],
    glyph: '◐',
    category: 'mind',
  },
  {
    name: 'Outdoor Cartographers',
    blurb:
      'Trail mapping, route notes, gear talk. Translate scroll-time into trail-time — share photos from the actual trail.',
    members: 3502,
    liveNow: 41,
    tags: ['IRL', 'Outdoors', 'Maps'],
    glyph: '◬',
    category: 'irl',
  },
  {
    name: 'Letterpress & Print',
    blurb:
      'Slow craft. Type setting, paper grain, ink mixing. Members ship physical zines four times a year.',
    members: 920,
    liveNow: 4,
    tags: ['Craft', 'Analog'],
    glyph: '◧',
    category: 'craft',
  },
  {
    name: 'Synthesis Reading Group',
    blurb:
      'One book a month, read solo, discussed live on Sundays. Currently on Deutsch — The Beginning of Infinity.',
    members: 2208,
    liveNow: 19,
    tags: ['Reading', 'Weekly call'],
    glyph: '✺',
    category: 'mind',
  },
  {
    name: 'Daybreak Runners',
    blurb:
      'Pre-dawn runs in 14 cities. Log your route, drop your pace, find someone within a 4-block radius.',
    members: 5670,
    liveNow: 33,
    tags: ['IRL', 'Body', 'Daily'],
    glyph: '☉',
    category: 'body',
  },
  {
    name: 'Quiet Coders',
    blurb:
      'No hot takes. Long-form code reviews, pair-programming sessions, and a strict no-screenshot-of-tweets rule.',
    members: 3041,
    liveNow: 22,
    tags: ['Code', 'Async', 'Pair-prog'],
    glyph: '∿',
    category: 'mind',
  },
  {
    name: 'Ceramics & Throwing',
    blurb:
      'Studio-share network. Find a wheel within an hour of you, swap glaze recipes, schedule co-firings.',
    members: 814,
    liveNow: 6,
    tags: ['Craft', 'IRL', 'Studio'],
    glyph: '◉',
    category: 'craft',
  },
]

const CATEGORIES = [
  { key: 'all',   label: 'All tribes' },
  { key: 'mind',  label: 'Mind' },
  { key: 'body',  label: 'Body' },
  { key: 'craft', label: 'Craft' },
  { key: 'irl',   label: 'IRL' },
]

const LIVE_SPOTLIGHT = {
  tribe: 'Outdoor Cartographers',
  topic: 'Mapping the unmarked Eastshore wetlands — bring GPX files',
  host: 'Aanya R.',
  hostInitials: 'AR',
  attending: 41,
  startedMinutesAgo: 8,
  participants: ['MJ', 'TS', 'KP', 'HD', 'LO', 'NV'],
}

const IRL_MEETUPS = [
  {
    id: 'irl-1',
    tribe: 'Outdoor Cartographers',
    title: 'Oakland Hills route survey',
    when: 'Sat · 7:30 AM',
    where: 'Sibley Volcanic Preserve · Bay Area',
    going: 14,
    glyph: '◬',
  },
  {
    id: 'irl-2',
    tribe: 'Letterpress & Print',
    title: 'Zine swap + open studio',
    when: 'Sun · 1:00 PM',
    where: 'Mission Press · SF',
    going: 22,
    glyph: '◧',
  },
  {
    id: 'irl-3',
    tribe: 'Mechatronics Enthusiasts',
    title: 'Workshop teardown — vintage CNC',
    when: 'Tue · 6:30 PM',
    where: 'Noisebridge · SF',
    going: 31,
    glyph: '⚙',
  },
  {
    id: 'irl-4',
    tribe: 'Daybreak Runners',
    title: 'Bridge-to-bridge sunrise loop',
    when: 'Wed · 5:45 AM',
    where: 'Embarcadero · SF',
    going: 47,
    glyph: '☉',
  },
]

const OPEN_THREADS = [
  {
    id: 'thr-1',
    tribe: 'Synthesis Reading Group',
    title: 'Ch. 4 — does Deutsch over-rotate on universality?',
    excerpt:
      'I keep getting hung up on the leap from “explanation has reach” to “any sufficiently good explanation must…” It feels like he’s smuggling in a metaphysical claim.',
    replies: 86,
    lastActive: '12 min ago',
  },
  {
    id: 'thr-2',
    tribe: 'Cybersec CTF Team',
    title: 'Writeup: heap-feng-shui in last weekend’s pwn challenge',
    excerpt:
      'Walking through the tcache poisoning step-by-step. The trick was realizing the chunk size was being read after our overflow but before the free.',
    replies: 41,
    lastActive: '38 min ago',
  },
  {
    id: 'thr-3',
    tribe: 'Slow Cinema Society',
    title: 'Tarkovsky — Stalker, the long take at the threshold',
    excerpt:
      'Why the camera holds for 47 seconds before they cross. I think it’s less about suspense and more about asking the audience to step in alongside them.',
    replies: 29,
    lastActive: '1 hr ago',
  },
  {
    id: 'thr-4',
    tribe: 'Quiet Coders',
    title: 'PR review: replacing Redux with a zustand sliver',
    excerpt:
      'Looking for a second pair of eyes on the migration. Specifically the selector-memoization part — am I leaning too hard on shallow comparisons?',
    replies: 17,
    lastActive: '2 hr ago',
  },
]

export default function Agora() {
  const ctx = useOutletContext()
  const parental = ctx?.parental ?? false
  const [filter, setFilter] = useState('all')

  const visibleTribes = useMemo(
    () => (filter === 'all' ? TRIBES : TRIBES.filter((t) => t.category === filter)),
    [filter],
  )

  const totalLive = TRIBES.reduce((sum, t) => sum + t.liveNow, 0)
  const reclaimedMinutes = DEMO_AGGREGATE.timeSavedMinutes
  const tribeMinutes = Math.round(reclaimedMinutes * 0.62)
  const irlMinutes = reclaimedMinutes - tribeMinutes

  return (
    <section id="agora" className="metis-section">
      <motion.header
        className="metis-section__head"
        variants={slowStagger}
        initial="hidden"
        animate="show"
      >
        <motion.span variants={fadeUp} className="metis-section__eyebrow">
          The Agora
        </motion.span>
        <motion.h2 variants={fadeUp} className="metis-section__title">
          An antidote to isolation.
        </motion.h2>
        <motion.p variants={fadeUp} className="metis-section__sub">
          Long-form discussions and offline activities. Pick a tribe — Metis surfaces the live
          conversations and IRL meet-ups happening right now.
        </motion.p>
      </motion.header>

      {/* ---------- Live spotlight ---------- */}
      <motion.article
        className="metis-panel metis-agora-spotlight"
        variants={fadeUp}
        initial="hidden"
        animate="show"
      >
        <div className="metis-agora-spotlight__head">
          <span className="metis-agora-spotlight__pulse">
            <span className="metis-agora-spotlight__pulse-dot" />
            Live now
          </span>
          <span className="metis-agora-spotlight__totals">
            {totalLive} conversations across {TRIBES.length} tribes
          </span>
        </div>

        <div className="metis-agora-spotlight__body">
          <div className="metis-agora-spotlight__copy">
            <p className="metis-agora-spotlight__tribe">{LIVE_SPOTLIGHT.tribe}</p>
            <h3 className="metis-agora-spotlight__topic">{LIVE_SPOTLIGHT.topic}</h3>
            <p className="metis-agora-spotlight__meta">
              Hosted by <strong>{LIVE_SPOTLIGHT.host}</strong> ·{' '}
              started {LIVE_SPOTLIGHT.startedMinutesAgo} min ago ·{' '}
              {LIVE_SPOTLIGHT.attending} listening
            </p>
          </div>

          <div className="metis-agora-spotlight__cluster">
            <div className="metis-avatar-stack">
              {LIVE_SPOTLIGHT.participants.map((p, i) => (
                <span
                  key={p}
                  className="metis-avatar"
                  style={{ '--i': i }}
                  aria-hidden
                >
                  {p}
                </span>
              ))}
              <span className="metis-avatar metis-avatar--more" aria-hidden>
                +{LIVE_SPOTLIGHT.attending - LIVE_SPOTLIGHT.participants.length}
              </span>
            </div>
            <GlassButton tone="amethyst" size="md">
              Drop in →
            </GlassButton>
          </div>
        </div>
      </motion.article>

      {/* ---------- Reclaim ledger ---------- */}
      <motion.article
        className="metis-panel metis-agora-ledger"
        variants={fadeUp}
        initial="hidden"
        animate="show"
      >
        <header className="metis-panel__row">
          <div>
            <h4 className="metis-panel__h4">Reclaim ledger</h4>
            <p className="metis-panel__caption">
              Where the time the shield bought back has gone. Feed-minutes
              prevented this month — and how they were re-spent inside the Agora.
            </p>
          </div>
          <span className="metis-agora-ledger__total">
            {formatMinutes(reclaimedMinutes)}
            <span className="metis-agora-ledger__total-sub">reclaimed · 30d</span>
          </span>
        </header>

        <div className="metis-agora-ledger__bar" aria-hidden>
          <span
            className="metis-agora-ledger__bar-seg metis-agora-ledger__bar-seg--tribes"
            style={{ flex: tribeMinutes }}
          />
          <span
            className="metis-agora-ledger__bar-seg metis-agora-ledger__bar-seg--irl"
            style={{ flex: irlMinutes }}
          />
        </div>

        <div className="metis-agora-ledger__legend">
          <span className="metis-agora-ledger__leg metis-agora-ledger__leg--tribes">
            <span className="metis-agora-ledger__swatch" />
            Tribe discussions
            <strong>{formatMinutes(tribeMinutes)}</strong>
          </span>
          <span className="metis-agora-ledger__leg metis-agora-ledger__leg--irl">
            <span className="metis-agora-ledger__swatch" />
            IRL meet-ups
            <strong>{formatMinutes(irlMinutes)}</strong>
          </span>
          <Link to="/dashboard" className="metis-agora-ledger__link">
            See full session history →
          </Link>
        </div>
      </motion.article>

      {/* ---------- Category filter ---------- */}
      <motion.div
        className="metis-agora-filters"
        variants={fadeUp}
        initial="hidden"
        animate="show"
        role="tablist"
        aria-label="Tribe category"
      >
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={filter === c.key}
            className={`metis-agora-filter ${filter === c.key ? 'is-active' : ''}`}
            onClick={() => setFilter(c.key)}
          >
            {c.label}
            <span className="metis-agora-filter__count">
              {c.key === 'all'
                ? TRIBES.length
                : TRIBES.filter((t) => t.category === c.key).length}
            </span>
          </button>
        ))}
      </motion.div>

      {/* ---------- Tribes grid ---------- */}
      <motion.div
        className="metis-grid metis-grid--tribes"
        variants={stagger}
        initial="hidden"
        animate="show"
        key={filter}
      >
        {visibleTribes.map((t) => (
          <motion.div key={t.name} variants={fadeUp}>
            <TribeCard {...t} />
          </motion.div>
        ))}
      </motion.div>

      {/* ---------- IRL meet-ups + Open threads ---------- */}
      <motion.div
        className="metis-agora-twocol"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        <motion.article variants={fadeUp} className="metis-panel metis-agora-meetups">
          <header className="metis-panel__row">
            <div>
              <h4 className="metis-panel__h4">IRL this week</h4>
              <p className="metis-panel__caption">
                Real rooms, real trails, real wheels. Translate scroll-time into
                somewhere your body can show up.
              </p>
            </div>
          </header>

          <ul className="metis-agora-meetups__list">
            {IRL_MEETUPS.map((m) => (
              <li key={m.id} className="metis-agora-meetup">
                <div className="metis-agora-meetup__glyph" aria-hidden>
                  {m.glyph}
                </div>
                <div className="metis-agora-meetup__body">
                  <div className="metis-agora-meetup__row">
                    <span className="metis-agora-meetup__when">{m.when}</span>
                    <span className="metis-agora-meetup__going">
                      {m.going} going
                    </span>
                  </div>
                  <p className="metis-agora-meetup__title">{m.title}</p>
                  <p className="metis-agora-meetup__where">
                    {m.tribe} · {m.where}
                  </p>
                </div>
                <button
                  type="button"
                  className="metis-agora-meetup__rsvp"
                  aria-label={`RSVP to ${m.title}`}
                >
                  RSVP
                </button>
              </li>
            ))}
          </ul>
        </motion.article>

        <motion.article variants={fadeUp} className="metis-panel metis-agora-threads">
          <header className="metis-panel__row">
            <div>
              <h4 className="metis-panel__h4">Open threads</h4>
              <p className="metis-panel__caption">
                Long-form conversations the platform refuses to flatten into
                sixty-second clips.
              </p>
            </div>
          </header>

          <ul className="metis-agora-threads__list">
            {OPEN_THREADS.map((t) => (
              <li key={t.id} className="metis-agora-thread">
                <div className="metis-agora-thread__head">
                  <span className="metis-agora-thread__tribe">{t.tribe}</span>
                  <span className="metis-agora-thread__time">
                    {t.lastActive}
                  </span>
                </div>
                <p className="metis-agora-thread__title">{t.title}</p>
                <p className="metis-agora-thread__excerpt">“{t.excerpt}”</p>
                <div className="metis-agora-thread__foot">
                  <span className="metis-agora-thread__replies">
                    {t.replies} replies
                  </span>
                  <button type="button" className="metis-agora-thread__open">
                    Read thread →
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </motion.article>
      </motion.div>

      {/* ---------- Bottom CTA ---------- */}
      <motion.aside
        className={`metis-agora-cta ${parental ? 'is-parental' : ''}`}
        variants={fadeUp}
        initial="hidden"
        animate="show"
      >
        <div className="metis-agora-cta__copy">
          <p className="metis-agora-cta__eyebrow">After the shield</p>
          <h3 className="metis-agora-cta__title">
            Every skipped clip is a vote for somewhere else to be.
          </h3>
          <p className="metis-agora-cta__sub">
            When Metis shields a doomscroll, the next screen offers a tribe — a
            slow conversation, an IRL meet-up, a long-form thread. The Agora is
            where reclaimed time gets re-spent.
          </p>
        </div>
        <div className="metis-agora-cta__actions">
          <GlassButton tone="amethyst" size="md" as={Link} to="/dashboard">
            See your reclaim
          </GlassButton>
          <GlassButton tone="amber" size="md" as={Link} to="/shield">
            How the shield works
          </GlassButton>
        </div>
      </motion.aside>
    </section>
  )
}
