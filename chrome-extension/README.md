# Metaware Chrome Extension — recording smoke test

Prototype 2 scaffold. This iteration only proves the recording path:

1. Open `instagram.com`.
2. A floating Metaware modal appears top-right.
3. Click **Record 10s** → tab is captured for 10 seconds via `chrome.tabCapture` inside an offscreen document.
4. Resulting MP4 (or WebM fallback) is added to the modal's downloads list.

No `/process` POST yet. That comes once recording is verified.

## Build & sideload

```bash
cd chrome-extension
npm install
npm run build         # outputs ./dist
```

Then in Chrome:

1. Visit `chrome://extensions`.
2. Toggle **Developer mode** (top right).
3. Click **Load unpacked** → pick `chrome-extension/dist`.
4. Open `https://www.instagram.com/` — the modal should appear.

For dev with HMR:

```bash
npm run dev
```

Reload the unpacked extension after structural changes (manifest, new files).

## Architecture (this PR)

```
instagram.com tab
  ├── content script (src/content.ts) — injects shadow-DOM modal, button, list
  │       ↑ ↓  chrome.runtime messages
  └── service worker (src/background.ts)
          ↑ ↓  chrome.runtime messages + getMediaStreamId
        offscreen doc (src/offscreen.ts)
          └── MediaRecorder over chrome.tabCapture stream
```

See `../chrome-extension-implementation.md` for the full prototype 2 spec
(side panel, BrainView reuse, rolling buffer) — none of that is wired yet.
