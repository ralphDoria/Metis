import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { motion } from 'framer-motion'
import ProgressRing from '../components/metis-core/ProgressRing.jsx'
import MetricCard from '../components/metis-core/MetricCard.jsx'
import GlassButton from '../components/metis-core/GlassButton.jsx'
import EmptyHint from '../components/metis-core/EmptyHint.jsx'
import { Link } from 'react-router-dom'
import BrainView from '../BrainView.jsx'
import { impactFromResult } from '../lib/impact.js'
import { fadeUp, slowStagger, stagger } from '../lib/motion.js'
import { fetchSessions } from '../lib/api.js'

export default function Dashboard() {
  const { result, parental } = useOutletContext()
  const impact = impactFromResult(result)

  const [sessions, setSessions] = useState([])
  const [sessionsError, setSessionsError] = useState(null)
  const [sessionsLoading, setSessionsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setSessionsLoading(true)
    fetchSessions(20)
      .then((rows) => {
        if (!cancelled) {
          setSessions(rows)
          setSessionsError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) setSessionsError(err.message)
      })
      .finally(() => {
        if (!cancelled) setSessionsLoading(false)
      })
    return () => {
      cancelled = true
    }
    // Re-fetch when a new result comes in (i.e. after /process completes).
  }, [result?.session_id])

  return (
    <section id="dashboard" className="metis-section">
      <motion.header
        className="metis-section__head"
        variants={slowStagger}
        initial="hidden"
        animate="show"
      >
        <motion.span variants={fadeUp} className="metis-section__eyebrow">
          {parental ? 'Monitoring Mode' : 'Cognitive Wellness Hub'}
        </motion.span>
        <motion.h2 variants={fadeUp} className="metis-section__title">
          {result ? 'Your last session, decoded.' : 'Awaiting your first session.'}
        </motion.h2>
        <motion.p variants={fadeUp} className="metis-section__sub">
          {result
            ? `Metis surfaced ${impact.coeff}% of viewing time as high-activation. The shield raises ` +
              `as the warmer band grows — your goal is to push the ring toward amber.`
            : 'No session yet. Drop a clip on the lander; the dashboard fills with your impact coefficient, addiction-trigger trend, and feed-health breakdown.'}
        </motion.p>
      </motion.header>

      {!result && (
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          <EmptyHint
            title="Run the pipeline to populate your dashboard"
            body="Drop a feed clip on the lander. Once the parser returns, the rings, sparkline, feed-health bars, and brain view come alive here."
            ctaLabel="Go to lander"
            to="/"
          />
        </motion.div>
      )}

      {result && (
        <motion.div
          className="metis-grid metis-grid--dashboard"
          variants={stagger}
          initial="hidden"
          animate="show"
        >
          <motion.div variants={fadeUp} className="metis-panel metis-panel--ring">
            <ProgressRing
              size={260}
              thickness={16}
              value={impact.reclaimed}
              primary={`${result.total_minutes - result.high_activation_minutes}m`}
              secondary={`of ${result.total_minutes}m sampled`}
              label="Time reclaimed"
            />
            <div className="metis-panel__legend">
              <span className="metis-legend metis-legend--cool">
                <span className="metis-legend__swatch metis-legend__swatch--cool" />
                Protective shield
              </span>
              <span className="metis-legend metis-legend--warm">
                <span className="metis-legend__swatch metis-legend__swatch--warm" />
                Return to clarity
              </span>
            </div>
          </motion.div>

          <motion.div variants={fadeUp}>
            <MetricCard
              title="Addiction score"
              caption="Trailing 7-session reduction in doomscroll triggers."
              value={Math.max(8, 100 - impact.coeff)}
              delta={-12}
              variant="spark"
              points={[78, 74, 70, 71, 65, 62, 100 - impact.coeff]}
              tone={parental ? 'amber' : 'amethyst'}
            />
          </motion.div>

          <motion.div variants={fadeUp}>
            <MetricCard
              title="Feed health"
              caption="ML categorisation of skipped vs. accepted content."
              variant="bars"
              tone="rose"
              buckets={[
                { label: 'High dopamine',  value: Math.round(impact.ratio * 70) || 22, tone: 'amber' },
                { label: 'Cortisol spike', value: Math.round(impact.ratio * 40) || 14, tone: 'amber' },
                { label: 'Long-form',      value: Math.max(20, 70 - impact.coeff), tone: 'amethyst' },
                { label: 'Educational',    value: Math.max(18, 60 - impact.coeff), tone: 'rose' },
              ]}
            />
          </motion.div>

          <motion.article variants={fadeUp} className="metis-panel metis-panel--brain">
            <header className="metis-panel__row">
              <div>
                <h4 className="metis-panel__h4">Predicted neural response</h4>
                <p className="metis-panel__caption">{result.feedback}</p>
              </div>
            </header>
            <BrainView brain={result.brain ?? null} />
            <div className="metis-panel__row metis-panel__row--end">
              <span className="metis-impact-coeff">
                Impact coefficient
                <strong> {impact.coeff}</strong>
                <span className="metis-impact-coeff__scale"> / 100</span>
              </span>
              <GlassButton tone="amber" size="sm" as={Link} to="/agora">
                Join group discussion
              </GlassButton>
            </div>
          </motion.article>

          {(result.score != null ||
            result.variables ||
            result.score_breakdown ||
            result.patterns) && (
            <motion.article
              variants={fadeUp}
              className="metis-panel"
              style={{ gridColumn: 'span 2' }}
            >
              <header className="metis-panel__row">
                <div>
                  <h4 className="metis-panel__h4">Session breakdown</h4>
                  <p className="metis-panel__caption">
                    Composite addictiveness score, contributing brain regions, and the
                    response patterns the parser detected.
                  </p>
                </div>
              </header>

              {result.score != null && (
                <div className="metis-result-summary">
                  <p className="metis-result-summary__score">
                    Score: <strong>{result.score?.toFixed(2)}</strong>
                    {result.label && (
                      <span className={`metis-result-label metis-result-label--${result.label}`}>
                        {result.label}
                      </span>
                    )}
                  </p>
                  {result.feedback && (
                    <p className="metis-result-summary__feedback">{result.feedback}</p>
                  )}
                </div>
              )}

              {result.variables && (
                <div className="metis-block">
                  <h5 className="metis-block__heading">Brain regions</h5>
                  <div className="metis-vars">
                    {result.variables.map((v) => (
                      <div key={v.key} className="metis-var">
                        <span className="metis-var__name">{v.name}</span>
                        <span className="metis-var__value">{v.value.toFixed(3)}</span>
                        <span className={`metis-qualifier metis-qualifier--${v.qualifier}`}>
                          {v.qualifier}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="metis-block__caveat">
                    Qualifiers are per-session percentile (top third = high, bottom third = low) —
                    relative within this clip until a neutral-footage baseline is computed.
                  </p>
                </div>
              )}

              {result.score_breakdown && (
                <div className="metis-block">
                  <h5 className="metis-block__heading">Addictiveness score</h5>
                  <div className="metis-breakdown__formula">
                    {result.score_breakdown.formula}
                  </div>
                  <div className="metis-breakdown__grid">
                    <div className="metis-breakdown__row">
                      <span>Reward composite</span>
                      <span>{result.score_breakdown.reward_composite.toFixed(3)}</span>
                    </div>
                    <div className="metis-breakdown__row">
                      <span>Salience composite</span>
                      <span>{result.score_breakdown.salience_composite.toFixed(3)}</span>
                    </div>
                    <div className="metis-breakdown__row">
                      <span>Control composite</span>
                      <span>{result.score_breakdown.control_composite.toFixed(3)}</span>
                    </div>
                    <div className="metis-breakdown__row metis-breakdown__row--total">
                      <span>Raw score</span>
                      <span>{result.score_breakdown.raw_score.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              {result.patterns && (
                <div className="metis-block">
                  <h5 className="metis-block__heading">Detected patterns</h5>
                  {result.patterns.length === 0 ? (
                    <p className="metis-block__empty">
                      No clear pattern emerged — variables are mixed without a strong signature.
                    </p>
                  ) : (
                    <ul className="metis-patterns">
                      {result.patterns.map((p) => (
                        <li key={p.key} className="metis-pattern">
                          <div className="metis-pattern__header">
                            <span className="metis-pattern__label">{p.label}</span>
                            <span className={`metis-confidence metis-confidence--${p.confidence_label}`}>
                              {p.confidence_label} confidence
                            </span>
                          </div>
                          <p className="metis-pattern__description">{p.description}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="metis-block__caveat">
                    Reverse inference is approximate — brain regions serve multiple functions.
                    Confidence reflects pattern plausibility, not data certainty.
                  </p>
                </div>
              )}
            </motion.article>
          )}
        </motion.div>
      )}

      <motion.article
        className="metis-panel"
        variants={fadeUp}
        initial="hidden"
        animate="show"
        style={{ marginTop: 32 }}
      >
        <header className="metis-panel__row">
          <div>
            <h4 className="metis-panel__h4">Session history</h4>
            <p className="metis-panel__caption">
              Past sessions stored in Firestore (user: test-user).
            </p>
          </div>
        </header>

        {sessionsLoading && <p className="metis-panel__caption">Loading…</p>}
        {sessionsError && (
          <p className="metis-panel__caption" style={{ color: '#f87171' }}>
            Could not load sessions: {sessionsError}
          </p>
        )}
        {!sessionsLoading && !sessionsError && sessions.length === 0 && (
          <p className="metis-panel__caption">No sessions yet.</p>
        )}
        {sessions.length > 0 && (
          <ul className="metis-session-list">
            {sessions.map((s) => (
              <li key={s.id} className="metis-session-row">
                <div>
                  <div className="metis-session-row__title">
                    {s.video_filename || 'demo session'}
                  </div>
                  <div className="metis-session-row__meta">
                    {s.created_at ? new Date(s.created_at).toLocaleString() : '—'}
                    {' · '}
                    {s.high_activation_minutes ?? 0}/{s.total_minutes ?? 0} min high-activation
                  </div>
                </div>
                <div className="metis-session-row__feedback">{s.feedback}</div>
              </li>
            ))}
          </ul>
        )}
      </motion.article>
    </section>
  )
}
