import { useEffect, useRef, useState } from 'react'
import BrainView from './BrainView.jsx'
import './App.css'

const API_BASE = 'http://localhost:8000'

function App() {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [videoUrl, setVideoUrl] = useState(null)

  useEffect(() => {
    if (!file) {
      setVideoUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setVideoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const acceptFile = (f) => {
    if (!f) return
    if (f.type !== 'video/mp4') {
      setError('Only MP4 files are supported.')
      setFile(null)
      return
    }
    setError('')
    setResult(null)
    setFile(f)
  }

  const onDragOver = (e) => {
    e.preventDefault()
    setDragging(true)
  }

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
    setResult(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const onAnalyze = async () => {
    if (!file) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const formData = new FormData()
      formData.append('video', file)
      const res = await fetch(`${API_BASE}/process`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      const data = await res.json()
      console.log('Result:', data)
      setResult(data)
    } catch (err) {
      setError(err.message || 'Analysis failed.')
    } finally {
      setLoading(false)
    }
  }

  const onDemo = async () => {
    setDemoLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch(`${API_BASE}/demo`)
      if (!res.ok) throw new Error(`Demo failed: ${res.status}`)
      const data = await res.json()
      console.log('Demo result:', data)
      setResult(data)
    } catch (err) {
      setError(err.message || 'Demo failed.')
    } finally {
      setDemoLoading(false)
    }
  }

  return (
    <main className="page">
      <header className="header">
        <h1 className="brand">Metaware</h1>
        <p className="manifesto">
          Metaware surfaces the neural impact of your social media feed. Upload a clip
          to see what your brain is doing while you scroll.
        </p>
      </header>

      {!file && (
        <section
          className={`dropzone ${dragging ? 'is-dragging' : ''}`}
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
          <div className="prompt">
            <p className="prompt-primary">Drop an MP4 here</p>
            <p className="prompt-secondary">or click to upload</p>
          </div>
        </section>
      )}

      {videoUrl && (
        <section className="preview">
          <video src={videoUrl} controls className="video" />
          <button
            type="button"
            className="close"
            onClick={onClear}
            aria-label="Remove video"
          >
            ×
          </button>
        </section>
      )}

      {file && (
        <button
          type="button"
          className="analyze"
          onClick={onAnalyze}
          disabled={loading}
        >
          {loading ? 'Analyzing…' : 'Analyze'}
        </button>
      )}

      {error && <p className="error">{error}</p>}

      <section className="demo-section">
        <p className="demo-hint">No video? Try the parser on a sample TribeV2 output.</p>
        <button
          type="button"
          className="demo-button"
          onClick={onDemo}
          disabled={demoLoading}
        >
          {demoLoading ? 'Running demo…' : 'Demo with sample data'}
        </button>
      </section>

      {result && (
        <section className="result">
          <p className="result-score">
            Score: <strong>{result.score?.toFixed(2)}</strong>{' '}
            <span className={`result-label result-label-${result.label}`}>
              {result.label}
            </span>
          </p>
          <p className="result-feedback">{result.feedback}</p>
          <button
            type="button"
            className="reset-button"
            onClick={() => setResult(null)}
          >
            Reset
          </button>
        </section>
      )}

      <BrainView brain={result?.brain ?? null} />
    </main>
  )
}

export default App
