import './NebulaBackdrop.css'

export default function NebulaBackdrop() {
  return (
    <div className="metis-nebula" aria-hidden>
      <div className="metis-nebula__layer metis-nebula__layer--violet" />
      <div className="metis-nebula__layer metis-nebula__layer--rose" />
      <div className="metis-nebula__layer metis-nebula__layer--amber" />
      <div className="metis-nebula__grid" />
      <div className="metis-nebula__vignette" />
    </div>
  )
}
