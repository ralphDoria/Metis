// Content-script entry. Mounts a small React tree inside a shadow root so
// Instagram's CSS / React can't reach in. The React app handles message
// routing + brain + cards.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { OVERLAY_CSS } from './styles'

const HOST_ID = 'metis-overlay-host'

function mount(): void {
  if (document.getElementById(HOST_ID)) return

  const host = document.createElement('div')
  host.id = HOST_ID
  Object.assign(host.style, {
    position: 'fixed',
    top: '24px',
    right: '24px',
    width: '320px',
    maxHeight: 'calc(100vh - 48px)',
    zIndex: '2147483647',
    pointerEvents: 'none',
  } as Partial<CSSStyleDeclaration>)

  const shadow = host.attachShadow({ mode: 'open' })

  const styleEl = document.createElement('style')
  styleEl.textContent = OVERLAY_CSS
  shadow.appendChild(styleEl)

  const reactRoot = document.createElement('div')
  reactRoot.id = 'metis-overlay-root'
  shadow.appendChild(reactRoot)

  document.documentElement.appendChild(host)

  const root = createRoot(reactRoot)
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

mount()
