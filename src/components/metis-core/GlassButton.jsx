import './GlassButton.css'

export default function GlassButton({
  children,
  tone = 'amethyst',
  size = 'md',
  as: Tag = 'button',
  className = '',
  ...rest
}) {
  return (
    <Tag
      className={`metis-glass-btn metis-glass-btn--${tone} metis-glass-btn--${size} ${className}`}
      {...rest}
    >
      <span className="metis-glass-btn__sheen" aria-hidden />
      <span className="metis-glass-btn__label">{children}</span>
    </Tag>
  )
}
