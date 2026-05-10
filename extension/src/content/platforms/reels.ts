import type { Platform } from '../../shared/types'

export interface PlatformAdapter {
  platform: Platform
  matchHost: (host: string) => boolean
  isFeed: () => boolean
  findVideos: () => HTMLVideoElement[]
  skip: () => Promise<boolean>
}

function dispatchKey(key: string, code: string, keyCode: number): void {
  for (const target of [document.activeElement, document.body, document]) {
    if (!target) continue
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, code, keyCode, which: keyCode, bubbles: true, cancelable: true }),
    )
  }
}

function findReelsRoot(): HTMLElement | null {
  // Reels uses a vertical paged container; pick the largest scrollable ancestor of the active video.
  const active = document.querySelector<HTMLVideoElement>('video[data-metis-active="1"]')
  let el: HTMLElement | null = active?.parentElement ?? null
  while (el) {
    const cs = getComputedStyle(el)
    if (
      (cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
      el.clientHeight > 0 &&
      el.scrollHeight > el.clientHeight
    ) {
      return el
    }
    el = el.parentElement
  }
  return null
}

export const reelsAdapter: PlatformAdapter = {
  platform: 'reels',
  matchHost: (host) => /(^|\.)instagram\.com$/.test(host),
  isFeed: () => /^\/(reels|reel)(\/|$)/.test(location.pathname),
  findVideos: () => Array.from(document.querySelectorAll<HTMLVideoElement>('video')),
  skip: async () => {
    const before = document.querySelector<HTMLVideoElement>('video[data-metis-active="1"]')
    const beforeKey = before?.currentSrc ?? before?.src ?? ''

    // Path 1: explicit "Next" button (desktop layout).
    const nextBtn =
      document.querySelector<HTMLElement>('button[aria-label="Next"]') ||
      document.querySelector<HTMLElement>('div[aria-label="Next"]')
    if (nextBtn) {
      nextBtn.click()
      if (await activeChanged(beforeKey, 600)) return true
    }

    // Path 2: synthetic ArrowDown.
    dispatchKey('ArrowDown', 'ArrowDown', 40)
    if (await activeChanged(beforeKey, 600)) return true

    // Path 3: scroll the reels root by viewport height.
    const root = findReelsRoot()
    if (root) {
      root.scrollBy({ top: window.innerHeight, behavior: 'smooth' })
      if (await activeChanged(beforeKey, 800)) return true
    }

    return false
  },
}

async function activeChanged(prevKey: string, ms: number): Promise<boolean> {
  const t0 = performance.now()
  return new Promise<boolean>((resolve) => {
    const tick = () => {
      const v = document.querySelector<HTMLVideoElement>('video[data-metis-active="1"]')
      const k = v?.currentSrc ?? v?.src ?? ''
      if (k && k !== prevKey) return resolve(true)
      if (performance.now() - t0 > ms) return resolve(false)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}
