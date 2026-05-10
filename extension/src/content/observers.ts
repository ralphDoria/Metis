export type VideoEvent = 'active' | 'prefetch' | 'lost'

export interface VideoObserverHandle {
  disconnect: () => void
}

export function observeVideos(
  root: Element | Document,
  isCandidate: (v: HTMLVideoElement) => boolean,
  onEvent: (kind: VideoEvent, video: HTMLVideoElement) => void,
): VideoObserverHandle {
  const tracked = new WeakSet<HTMLVideoElement>()

  const activeIO = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const v = e.target as HTMLVideoElement
        if (e.intersectionRatio >= 0.6) {
          markActive(v)
          onEvent('active', v)
        } else if (e.intersectionRatio < 0.2 && v.dataset.metisActive === '1') {
          v.removeAttribute('data-metis-active')
          onEvent('lost', v)
        }
      }
    },
    { threshold: [0, 0.2, 0.6, 0.9] },
  )

  const prefetchIO = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const v = e.target as HTMLVideoElement
        if (e.isIntersecting) onEvent('prefetch', v)
      }
    },
    { rootMargin: '200% 0px 200% 0px', threshold: 0.01 },
  )

  function track(v: HTMLVideoElement) {
    if (tracked.has(v)) return
    if (!isCandidate(v)) return
    tracked.add(v)
    activeIO.observe(v)
    prefetchIO.observe(v)
  }

  function markActive(v: HTMLVideoElement) {
    document
      .querySelectorAll<HTMLVideoElement>('video[data-metis-active="1"]')
      .forEach((other) => {
        if (other !== v) other.removeAttribute('data-metis-active')
      })
    v.dataset.metisActive = '1'
  }

  // Initial pass
  for (const v of (root instanceof Document ? root : root.ownerDocument!).querySelectorAll<HTMLVideoElement>('video')) {
    track(v)
  }

  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes.forEach((n) => {
        if (n instanceof HTMLVideoElement) track(n)
        else if (n instanceof Element) n.querySelectorAll<HTMLVideoElement>('video').forEach(track)
      })
    }
  })
  mo.observe(root instanceof Document ? root.documentElement : root, { childList: true, subtree: true })

  return {
    disconnect: () => {
      mo.disconnect()
      activeIO.disconnect()
      prefetchIO.disconnect()
    },
  }
}
