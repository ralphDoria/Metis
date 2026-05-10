# Chrome Extension Implementation

Spec for **prototype 2**: a Chrome extension that watches Instagram Reels alongside the user, samples the playing tab in 10-second chunks, sends each chunk through the existing Metaware processing pipeline, and surfaces real-time neural-response feedback in a side panel.

This doc captures the architectural decisions made for the extension. Prototype 1 (`server/`, `pipeline/`, `src/`) is the upstream pipeline this extension consumes — none of that changes.

---

## Goal

Apply the prototype-1 pipeline to live feed scrolling. The user opens Instagram, opens our side panel, and starts a session. The extension records the active Reels tab in rolling 10-second mp4 windows, posts each one to `/process`, and renders the same `BrainView` + addictiveness feedback in the side panel that the upload demo renders today.

## Scope

- Single platform target: **Instagram Reels** in Chrome.
- Single-tab session: the user picks the IG tab they want monitored at session start. Multi-tab orchestration is explicitly out of scope for this iteration.
- Reuses the existing `/process` HTTP contract — no pipeline changes if mp4 output works (see "Format" below).

## Stack decisions

| Concern | Choice | Why |
|---|---|---|
| Capture API | `chrome.tabCapture.getMediaStreamId()` → `getUserMedia({ chromeMediaSource: 'tab' })` | One user gesture starts continuous capture. Captures **everything** rendered in the tab (DOM, video, comments, overlays). Tab-scoped (no leakage to other tabs). Audio + video both work on macOS via Chrome's internal audio pipeline. |
| Encoder | `MediaRecorder` with `video/mp4;codecs="avc1.42E01E,mp4a.40.2"` | Chrome 126+ supports MP4 (H.264 + AAC) directly in MediaRecorder. No `ffmpeg.wasm` transcode needed. Falls back to webm if mime unsupported. |
| Chunking strategy | **Stop + restart** every 10s, no `start(timeslice)` | `start(timeslice)` emits fragments of a single recording — not independently playable mp4 files. Restart-per-window guarantees each blob is a self-contained mp4 with proper moov atom that TribeV2 can ingest. |
| MV3 host context | **Offscreen document** for `MediaRecorder`; **side panel** for UI; **service worker** for orchestration | Service workers can't host MediaRecorder (no DOM). Popups close on user navigation and would lose the recorder mid-clip. Offscreen documents are the MV3-blessed pattern for persistent media work. |
| Bundler | **Vite + `@crxjs/vite-plugin`** | Reuses our existing Vite + React setup (`src/`). HMR works for extension dev. |
| UI surface | **Side panel** (Chrome 114+) | Roomy enough for the 3D `BrainView`, persistent across navigation, doesn't close on outside click like a popup. |

## Out-of-scope (deferred)

- Multi-tab parallel sessions (requires N concurrent tabCapture sessions + cross-tab feedback aggregation).
- TikTok / X / YouTube Shorts adapters (architecture allows, but selectors and product framing are different).
- Hosted FastAPI deployment + auth (extension currently calls localhost; see "Server changes" below for the production path).

---

## Architecture

```
Instagram Reels tab  ←──── chrome.tabCapture ──── Offscreen document
                                                     │
                                                     │  MediaRecorder → mp4 blob (10s)
                                                     ▼
                                                FastAPI (/process)
                                                     │
                                                     │  TribeV2 (Modal) → voxels
                                                     │  parser → score + ROIs + patterns
                                                     │  brain_export → GLB + color buffer
                                                     ▼
                                                JSON + asset URLs
                                                     │
                          ┌──────── chrome.runtime ──┘
                          ▼
                 Side panel (React + BrainView)
```

Component responsibilities:

| Component | Job |
|---|---|
| **Service worker** (`background.ts`) | Wakes on extension icon click and IG tab events. Creates the offscreen document, brokers `chrome.runtime.sendMessage` traffic, holds session metadata (start time, window count, last result). Doesn't touch media. |
| **Offscreen document** (`offscreen.html` + `offscreen.ts`) | Hosts `MediaRecorder` and the `MediaStream` from `getUserMedia`. Runs the rolling-buffer state machine. POSTs each 10s mp4 to `/process` and forwards results to the side panel via the service worker. Invisible HTML page kept alive by the extension while a session is active. |
| **Side panel** (`sidepanel.html` + React app under `src-extension/`) | Renders BrainView (reused from `src/BrainView.jsx`), session status, latest score, pattern cards. Receives results via `chrome.runtime.onMessage`. |
| **Content script** (optional, `content.ts`) | Detects when the user has scrolled to a new Reel via DOM mutation observer on the Reels container. Sends "new clip started" pings to the service worker for window-alignment heuristics. Not strictly required for MVP — capture is timer-driven, not Reel-aligned. |
| **Manifest** (`manifest.json`) | MV3 declarations for permissions, side panel registration, offscreen document, content scripts. |

---

## Capture pipeline

### Starting a session

1. User navigates to `instagram.com/reels/...`.
2. User clicks the extension icon → opens the side panel.
3. Side panel shows a "Start session" button. User clicks it.
4. Side panel posts `{type: 'start', tabId}` to the service worker.
5. Service worker:
   - Verifies the active tab is `instagram.com`.
   - Calls `chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['USER_MEDIA'], justification: 'Tab recording for neural-response analysis' })`.
   - Calls `chrome.tabCapture.getMediaStreamId({ targetTabId: tabId, consumerTabId: <offscreen tab id> })` → returns a stream id token.
   - Forwards the stream id to the offscreen document.
6. Offscreen document:
   - Calls `getUserMedia({ video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: <id> } }, audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: <id> } } })`.
   - Wraps the resulting stream in a `MediaRecorder` and starts the rolling-buffer loop.

### Rolling buffer state machine

Per `CLAUDE.md`, the constraint is: sample 10s, process 2x–4x longer, no new sample until the prior `/process` call returns.

```
state: IDLE | RECORDING | UPLOADING

start session:
  state ← RECORDING
  spawn new MediaRecorder, recorder.start()
  schedule recorder.stop() at t + 10000ms

on recorder.dataavailable(blob):
  state ← UPLOADING
  POST blob to /process
  on response:
    forward result JSON to side panel via service worker
    if session still active:
      spawn new MediaRecorder
      recorder.start()
      schedule recorder.stop() at now + 10000ms
      state ← RECORDING
    else:
      state ← IDLE, tear down stream + offscreen
  on error:
    surface error in side panel; transition back to RECORDING after a backoff
```

Notes:
- We never have two recorders alive simultaneously — one window finishes upload before the next starts. This trades real-time throughput for guaranteed in-order results and bounded GPU spend on Modal.
- If a 10s window upload takes 40s round-trip (TribeV2 inference + parse), the next sample starts 40s after the prior sample's window ended. Session feedback is "what we've processed so far," not "every second of scrolling."
- A future optimization: keep a small queue (max depth 1–2) of pending uploads to absorb upload jitter without halting capture. Out of scope for first cut.

### Stopping a session

1. User clicks "Stop" in side panel, or closes the panel, or closes the IG tab.
2. Side panel / tab event posts `{type: 'stop'}` to service worker.
3. Service worker forwards stop to offscreen document.
4. Offscreen document:
   - Calls `recorder.stop()` and lets the in-flight upload complete (or aborts it).
   - Stops every track on the MediaStream (`stream.getTracks().forEach(t => t.stop())`).
   - Posts `{type: 'session-summary', windowsProcessed, totalSeconds}` back to side panel.
5. Service worker calls `chrome.offscreen.closeDocument()` to release the offscreen context.

---

## Format / codec specifics

```js
const MP4_MIME = 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"'
const WEBM_MIME = 'video/webm;codecs="vp8,opus"'

function chooseMime() {
  if (MediaRecorder.isTypeSupported(MP4_MIME)) return MP4_MIME
  if (MediaRecorder.isTypeSupported(WEBM_MIME)) return WEBM_MIME
  throw new Error('No supported MediaRecorder mime type')
}

const recorder = new MediaRecorder(stream, {
  mimeType: chooseMime(),
  videoBitsPerSecond: 2_500_000,  // ~3 MB per 10s window
  audioBitsPerSecond:   128_000,
})
```

H.264 baseline profile (`avc1.42E01E`) is the most compatible encode for downstream tools. AAC-LC stereo (`mp4a.40.2`) for audio.

If a user's Chrome doesn't support MP4 in MediaRecorder (Chrome <126), we fall back to webm and rely on `server/main.py` to accept it (see below).

---

## Server changes needed

Minimal. Two changes if we go strict mp4-only, four if we want webm fallback support too.

| Change | File | Why |
|---|---|---|
| Add `chrome-extension://*` to CORS allowed origins | `server/main.py` | Extension origin is `chrome-extension://<extension id>`; current regex matches localhost only. |
| Verify `Tribe.infer` accepts mp4 from MediaRecorder cleanly | `pipeline/modal_app.py` | MediaRecorder mp4s have a slightly different muxing pattern from FFmpeg-encoded mp4s. Smoke test before relying. |
| (Fallback path) Accept `video/webm` content-type | `server/main.py` | If we want to support older Chrome, the upload route needs to handle webm. |
| (Fallback path) Add server-side webm → mp4 transcode | `server/transcode.py` (new) | Only if TribeV2 truly requires mp4. Uses ffmpeg via subprocess. |

For local dev nothing else changes — extension talks to `localhost:8000` and FastAPI hands off to Modal as today.

For production, FastAPI must be hosted (Modal `@modal.asgi_app()` is the lightest path, since we already have a Modal token). That brings in a deployment + auth conversation that's deferred until we move past the demo.

---

## Manifest sketch (MV3)

```json
{
  "manifest_version": 3,
  "name": "Metaware",
  "version": "0.1.0",
  "description": "See your neural response to your scroll.",
  "permissions": [
    "tabCapture",
    "offscreen",
    "sidePanel",
    "storage",
    "activeTab"
  ],
  "host_permissions": [
    "http://localhost:8000/*",
    "https://www.instagram.com/*"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "action": {
    "default_title": "Metaware"
  },
  "content_scripts": [
    {
      "matches": ["https://www.instagram.com/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "minimum_chrome_version": "126"
}
```

Notes:
- `tabCapture` + `host_permissions` for `instagram.com` will trigger a manual review on the Chrome Web Store. Plan for ~1–2 weeks of review when we eventually publish. For internal testing we just sideload via `chrome://extensions` → "Load unpacked".
- `minimum_chrome_version: 126` ensures MP4 MediaRecorder support and matures `chrome.offscreen`. Adjust if we drop the mp4 mime.

---

## Reuse map

Code/assets reused from prototype 1 with no changes:

- `pipeline/modal_app.py` — Modal-hosted TribeV2 inference. Same `Tribe().infer.remote(bytes)` call.
- `server/parser.py` — ROI extraction, score, variables, patterns.
- `server/brain_export.py` — fsaverage5 mesh GLBs + per-job color buffer.
- `server/main.py` — `/process` endpoint, geometry pre-baking, static file serving. Only CORS regex needs editing.
- `src/BrainView.jsx` — Three.js renderer. Drops into the side panel as-is.
- `src/App.css` — visual styles for variables, breakdown, patterns blocks.

Newly written for the extension (estimated):

- `manifest.json` — ~50 lines.
- `src-extension/background.ts` — service worker orchestration. ~150 lines.
- `src-extension/offscreen.{html,ts}` — capture + recorder host. ~200 lines.
- `src-extension/sidepanel/{App.jsx,main.jsx}` — React shell around BrainView. ~150 lines.
- `src-extension/content.ts` — IG-specific helpers. ~50 lines (optional for MVP).
- `vite.config.extension.ts` — bundler config with `@crxjs/vite-plugin`. ~30 lines.

Estimated total: ~600 lines of new code on top of full reuse of the prototype 1 surface.

---

## Build + dev workflow

```bash
# in a fourth terminal alongside Modal deploy / uvicorn / vite for the website
npm run dev:extension       # rebuilds extension on save into ./dist-extension
```

Then load unpacked in Chrome:

1. Open `chrome://extensions`.
2. Toggle "Developer mode" (top right).
3. Click "Load unpacked" → select `./dist-extension`.
4. Pin the extension to the toolbar.
5. Open Instagram, click the icon → side panel opens.
6. Click "Start session" → tab capture begins.

---

## Open items

| Item | Owner | Notes |
|---|---|---|
| Confirm TribeV2 audio dependency | (TBD) | Inspect `tribev2.demo_utils.TribeModel.predict` for audio inputs. Affects nothing if tab-audio works (it does on macOS), but determines whether webm fallback can drop audio safely. |
| Smoke test MediaRecorder mp4 against `Tribe.infer` | (TBD) | Generate one mp4 via `MediaRecorder` from a desktop demo, feed to Modal, verify ingest. |
| Decide session retention | (TBD) | Does the side panel show only the latest 10s window's result, or aggregate across the session ("14 of last 20 min = high dopamine-region activation" per CLAUDE.md)? Aggregation is the more interesting demo but requires session-level state. |
| Extension iconography + naming | (TBD) | Currently placeholder. |
| Privacy / data-handling disclosure | (TBD) | Required for any Web Store submission. Tab content goes to localhost during dev — must be hosted + clear about what's transmitted before public release. |

---

## Failure modes to watch

- **Reels redesign**: if Meta moves Reels into a cross-origin iframe, tabCapture still works (it captures pixels), but if we ever migrate to `<video>.captureStream()` for fidelity, we'd lose access. tabCapture is the safe long-term choice for that reason too.
- **Extension lifetime during long sessions**: Chrome may evict the service worker if idle, but the offscreen document holding the stream stays alive. Verify with multi-hour sessions before promising "always on" UX.
- **macOS audio**: confirmed working through tabCapture. Don't switch to `desktopCapture` window mode without an audio strategy — that path drops audio on macOS.
- **TribeV2 inference latency**: 10s capture + ~30s inference round-trip means session feedback lags real-time. UI should make this lag explicit ("processing minute 4–5..." vs. "your last 10 seconds were...").
