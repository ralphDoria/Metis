import { Link } from 'react-router-dom'
import GlassButton from './GlassButton.jsx'
import './EmptyHint.css'

export default function EmptyHint({ title, body, ctaLabel = 'Run pipeline', to = '/' }) {
  return (
    <div className="metis-empty">
      <div className="metis-empty__halo" aria-hidden />
      <div className="metis-empty__copy">
        <h3 className="metis-empty__title">{title}</h3>
        <p className="metis-empty__body">{body}</p>
      </div>
      <Link to={to} className="metis-empty__cta-link">
        <GlassButton tone="amethyst" size="md">{ctaLabel} →</GlassButton>
      </Link>
    </div>
  )
}
