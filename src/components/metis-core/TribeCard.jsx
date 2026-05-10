import './TribeCard.css'

export default function TribeCard({ name, blurb, members, liveNow, tags = [], glyph }) {
  return (
    <article className="metis-tribe">
      <div className="metis-tribe__top">
        <div className="metis-tribe__glyph" aria-hidden>{glyph}</div>
        {liveNow > 0 && (
          <span className="metis-tribe__live">
            <span className="metis-tribe__live-dot" />
            {liveNow} live
          </span>
        )}
      </div>
      <h4 className="metis-tribe__name">{name}</h4>
      <p className="metis-tribe__blurb">{blurb}</p>
      <div className="metis-tribe__tags">
        {tags.map((t) => (
          <span key={t} className="metis-tribe__tag">{t}</span>
        ))}
      </div>
      <div className="metis-tribe__foot">
        <span className="metis-tribe__members">{members.toLocaleString()} members</span>
        <button type="button" className="metis-tribe__join">Join →</button>
      </div>
    </article>
  )
}
