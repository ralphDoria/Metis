import { useEffect, useRef, useState } from 'react'
import './App.css'

const API_URL = 'http://localhost:8000/process'

function App() {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
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

      {result && (
        <section className="result">
          <p className="result-feedback">{result.feedback}</p>
          <p className="result-stats">
            {result.high_activation_minutes} / {result.total_minutes} min in
            high-stimulation state
          </p>
        </section>
      )}
    </main>
  )
}

export default App
