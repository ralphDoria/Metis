import { lazy, Suspense, useRef, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import Orb from '../components/metis-core/Orb.jsx'
import GlassButton from '../components/metis-core/GlassButton.jsx'
import { impactFromResult } from '../lib/impact.js'
import { easeOut, fadeUp, slowStagger, stagger } from '../lib/motion.js'
import '../components/metis-core/Orb3D.css'

const Orb3D = lazy(() => import('../components/metis-core/Orb3D.jsx'))

const API_URL = 'http://localhost:8000/process'

const NOISE_ITEMS = [
  { id: 0,  x: 8,  y: 12, s: 0.9, d: 0.0, sym: '♥' },
  { id: 1,  x: 92, y: 18, s: 0.7, d: 1.2, sym: '↻' },
  { id: 2,  x: 18, y: 86, s: 1.1, d: 2.4, sym: '▶' },
  { id: 3,  x: 86, y: 74, s: 0.8, d: 3.6, sym: '✦' },
  { id: 4,  x: 50, y: 6,  s: 0.6, d: 4.8, sym: '◇' },
  { id: 5,  x: 4,  y: 52, s: 1.0, d: 0.6, sym: '✕' },
  { id: 6,  x: 96, y: 48, s: 0.7, d: 1.8, sym: '✉' },
  { id: 7,  x: 28, y: 28, s: 0.85, d: 3.0, sym: '♥' },
  { id: 8,  x: 72, y: 30, s: 1.05, d: 4.2, sym: '↻' },
  { id: 9,  x: 32, y: 70, s: 0.75, d: 5.4, sym: '▶' },
  { id: 10, x: 66, y: 88, s: 1.0,  d: 0.9, sym: '✦' },
  { id: 11, x: 12, y: 38, s: 0.65, d: 2.1, sym: '◇' },
  { id: 12, x: 80, y: 60, s: 0.95, d: 3.3, sym: '✕' },
  { id: 13, x: 44, y: 90, s: 0.7,  d: 4.5, sym: '✉' },
]

function NoiseField() {
  return (
    <div className="metis-noise" aria-hidden>
      {NOISE_ITEMS.map((it) => (
        <span
          key={it.id}
          className="metis-noise__item"
          style={{
            left: `${it.x}%`,
            top: `${it.y}%`,
            transform: `scale(${it.s})`,
            animationDelay: `${it.d}s`,
          }}
        >
          {it.sym}
        </span>
      ))}
    </div>
  )
}

function Manifesto() {
  return (
    <motion.div
      className="metis-manifesto"
      variants={slowStagger}
      initial="hidden"
      animate="show"
    >
      <motion.span variants={fadeUp} className="metis-manifesto__eyebrow">
        A digital intervention
      </motion.span>
      <motion.h1 variants={fadeUp} className="metis-manifesto__h1">
        Quiet the feed.
        <br />
        <span className="metis-manifesto__h1-accent">Hear yourself again.</span>
      </motion.h1>
      <motion.p variants={fadeUp} className="metis-manifesto__lead">
        Metis predicts the neural impact of short-form video before your nervous system pays the
        price. Upload a clip from your feed and see what your brain was doing while you watched.
      </motion.p>
    </motion.div>
  )
}

function Dropzone({ inputRef, dragging, onDragOver, onDragLeave, onDrop, onChange }) {
  return (
    <div
      className={`metis-drop ${dragging ? 'is-dragging' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4"
        onChange={onChange}
        hidden
      />
      <div className="metis-drop__inner">
        <div className="metis-drop__glyph" aria-hidden>
          <svg viewBox="0 0 32 32" width="28" height="28">
            <path
              d="M16 22V8M16 8l-5 5M16 8l5 5M6 24h20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div>
          <p className="metis-drop__title">Drop an MP4 here</p>
          <p className="metis-drop__hint">or click to browse — we never upload to a third party.</p>
        </div>
      </div>
    </div>
  )
}

export default function Lander() {
  const { result, setResult, parental } = useOutletContext()

  const inputRef = useRef(null)
  const urlRef = useRef(null)
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const replaceObjectUrl = (next) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = next
    setPreviewUrl(next)
  }

  const acceptFile = (f) => {
    if (!f) return
    if (f.type !== 'video/mp4') {
      setError('Only MP4 files are supported.')
      setFile(null)
      replaceObjectUrl(null)
      return
    }
    setError('')
    setFile(f)
    replaceObjectUrl(URL.createObjectURL(f))
  }

  const onDragOver = (e) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)
  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    acceptFile(e.dataTransfer.files?.[0])
  }
  const onChange = (e) => acceptFile(e.target.files?.[0])

  const onClear = () => {
    setFile(null)
    setError('')
    replaceObjectUrl(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const onAnalyze = async () => {
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('video', file)
      const res = await fetch(API_URL, { method: 'POST', body: formData })
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      const data = await res.json()
      console.log('Preds:', data.preds)
      console.log('Shape:', [data.n_timesteps, data.n_vertices])
      setResult(data)
    } catch (err) {
      setError(err.message || 'Analysis failed.')
    } finally {
      setLoading(false)
    }
  }

  const tone = parental ? 'amber' : 'amethyst'
  const orbIntensity = loading ? 1.4 : result && impactFromResult(result).ratio > 0.5 ? 1.2 : 1

  return (
    <section id="top" className="metis-hero">
      <div className="metis-hero__inner">
        <Manifesto />

        <motion.div
          className="metis-hero__stage"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.1, ease: easeOut, delay: 0.1 }}
        >
          <NoiseField />
          <div className="metis-hero__orb">
            <Suspense fallback={<Orb size={360} intensity={orbIntensity} tone={tone} />}>
              <Orb3D size={360} intensity={orbIntensity} tone={tone} />
            </Suspense>
          </div>
        </motion.div>

        <motion.div
          className="metis-hero__cta"
          variants={stagger}
          initial="hidden"
          animate="show"
        >
          <motion.div variants={fadeUp}>
            <GlassButton tone="amethyst" size="lg">
              Install Extension
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
                <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </GlassButton>
          </motion.div>
          <motion.div variants={fadeUp}>
            <GlassButton tone="amber" size="lg" as={Link} to="/dashboard">
              Go to Dashboard
            </GlassButton>
          </motion.div>
        </motion.div>
      </div>

      <motion.div
        className="metis-hero__panel"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: easeOut, delay: 0.2 }}
      >
        <motion.div layout className="metis-panel">
          <div className="metis-panel__head">
            <span className="metis-panel__eyebrow">Prototype 1 · Pipeline check</span>
            <h2 className="metis-panel__title">Drop a feed clip. See its neural footprint.</h2>
            <p className="metis-panel__sub">
              Runs the full Metis pipeline: <em>video → TribeV2 → voxels → parser → predicted
              response.</em> Stays on this machine.
            </p>
          </div>

          <LayoutGroup>
            <AnimatePresence mode="wait" initial={false}>
              {!file && (
                <motion.div
                  key="dropzone"
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.35, ease: easeOut }}
                >
                  <Dropzone
                    inputRef={inputRef}
                    dragging={dragging}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onChange={onChange}
                  />
                </motion.div>
              )}

              {previewUrl && (
                <motion.div
                  key="preview"
                  className="metis-preview"
                  layout
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.35, ease: easeOut }}
                >
                  <video src={previewUrl} controls className="metis-preview__video" />
                  <button
                    type="button"
                    className="metis-preview__close"
                    onClick={onClear}
                    aria-label="Remove video"
                  >
                    ×
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </LayoutGroup>

          <AnimatePresence>
            {file && (
              <motion.div
                key="actions"
                className="metis-panel__actions"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.3, ease: easeOut }}
              >
                <GlassButton
                  tone="amethyst"
                  size="md"
                  onClick={onAnalyze}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="metis-spinner" aria-hidden /> Analyzing
                    </>
                  ) : (
                    <>Run Metis pipeline</>
                  )}
                </GlassButton>
                <GlassButton tone="ghost" size="md" onClick={onClear} disabled={loading}>
                  Replace clip
                </GlassButton>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {error && (
              <motion.p
                key="err"
                className="metis-error"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {result && (
              <motion.div
                key="success"
                className="metis-success"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: easeOut }}
              >
                <div className="metis-success__copy">
                  <span className="metis-success__chip">Pipeline complete</span>
                  <p className="metis-success__text">
                    Impact coefficient&nbsp;
                    <strong>{impactFromResult(result).coeff}</strong>
                    &nbsp;/&nbsp;100. Open the dashboard for the full neural breakdown.
                  </p>
                </div>
                <GlassButton tone="amber" size="md" as={Link} to="/dashboard">
                  See full report →
                </GlassButton>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </section>
  )
}
