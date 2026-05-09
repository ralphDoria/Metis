import { useRef, useState } from 'react'
import './App.css'

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function App() {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')

  const acceptFile = (f) => {
    if (!f) return
    if (f.type !== 'video/mp4') {
      setError('Only MP4 files are supported.')
      setFile(null)
      return
    }
    setError('')
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
    if (inputRef.current) inputRef.current.value = ''
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

      <section
        className={`dropzone ${dragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`}
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
        {file ? (
          <div className="file-info">
            <p className="file-name">{file.name}</p>
            <p className="file-size">{formatSize(file.size)}</p>
            <button
              type="button"
              className="clear"
              onClick={(e) => {
                e.stopPropagation()
                onClear()
              }}
            >
              Clear
            </button>
          </div>
        ) : (
          <div className="prompt">
            <p className="prompt-primary">Drop an MP4 here</p>
            <p className="prompt-secondary">or click to upload</p>
          </div>
        )}
      </section>

      {error && <p className="error">{error}</p>}
    </main>
  )
}

export default App
