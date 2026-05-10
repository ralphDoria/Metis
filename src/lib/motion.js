export const easeOut = [0.2, 0.7, 0.2, 1]

export const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.6, ease: easeOut } },
}

export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
}

export const slowStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.08 } },
}

export const pageVariants = {
  initial: { opacity: 0, y: 12 },
  enter:   { opacity: 1, y: 0,  transition: { duration: 0.45, ease: easeOut } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.25, ease: easeOut } },
}
