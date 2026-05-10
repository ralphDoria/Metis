# Metaware

Awareness tool for addictive social media. Predicts neural response to scrolled feed content and surfaces session feedback to user.

## Core concept

- Watch user's screen during feed scrolling (Instagram/TikTok)
- Sample video chunks via rolling buffer (~10s)
- Pipeline: video → TribeV2 → voxels → parsing algorithm → predicted neural response
- Output: session-level feedback (e.g. "14 of last 20 min = high dopamine-region activation")

## Key constraints

- Per-video real-time inference too slow → batch sampling with rolling buffer (sample 10s, process 2x–4x longer, no new sample until prior finishes). Cloud parallelism optional but costlier.
- iOS sandbox blocks UI injection into other apps → browser extension is the viable surface.

## Prototypes (primary focus)

### Prototype 1 — Video upload webpage
**Goal:** Prove pipeline works end-to-end on a known input.

- User uploads downloaded feed video to webpage
- Backend runs full pipeline (TribeV2 → voxels → parsing → neural response)
- UI displays meaningful predicted-response feedback
- Deadline: response by 4 PM (today)
- Success criterion: pipeline produces interpretable output from arbitrary uploaded video

### Prototype 2 — Chrome extension
**Goal:** Apply prototype 1 pipeline to live feed.

Full spec: see `chrome-extension-implementation.md` — that doc is the source of truth for architecture, manifest, and reuse map. Summary:

- MV3 extension targeting **Instagram Reels** in Chrome 126+ (single-tab session, no TikTok adapter yet).
- Capture: `chrome.tabCapture.getMediaStreamId()` → `getUserMedia({ chromeMediaSource: 'tab' })` inside an **offscreen document** (service workers can't host `MediaRecorder`).
- Encoder: `MediaRecorder` with `video/mp4;codecs="avc1.42E01E,mp4a.40.2"` (webm fallback for older Chrome). **Stop + restart per 10s window** — `start(timeslice)` fragments aren't independently playable mp4s.
- Rolling buffer state machine: `RECORDING → UPLOADING → RECORDING`. One window in flight at a time, no overlap. Trades real-time throughput for in-order results and bounded Modal spend.
- UI: **side panel** (Chrome 114+) running React. Reuses `src/BrainView.jsx`, `server/parser.py`, `server/brain_export.py`, and the existing `/process` contract unchanged.
- Component split: service worker (orchestration) ↔ offscreen doc (capture + upload) ↔ side panel (UI), wired via `chrome.runtime.sendMessage`.
- Bundler: Vite + `@crxjs/vite-plugin` reusing the existing Vite setup. New code lives in `src-extension/`; output to `dist-extension/`, sideloaded via `chrome://extensions` → "Load unpacked".
- Server delta: add `chrome-extension://*` to CORS in `server/main.py`. Smoke-test MediaRecorder mp4 against `Tribe.infer` before relying on the format. Hosted FastAPI + auth deferred until past demo.
- Depends on: prototype 1 pipeline being functional.

## Architecture

Split: heavy inference runs on Modal (cloud GPU). Parsing runs locally for fast iteration. Local FastAPI server bridges browser ↔ Modal and runs the parser.

```
Metaware/
  pipeline/
    modal_app.py    # Modal app: TribeV2 inference (currently mock — returns fake voxels)
  server/
    main.py         # Local FastAPI: receives uploads, calls Modal, runs parser, returns JSON
  src/              # React frontend (Vite root)
  index.html
  package.json
```

### Flow
```
React (browser, :5173)
    │  POST /process  (multipart mp4)
    ▼
FastAPI (local, :8000)
    │  tribe_infer.remote(video_bytes)
    ▼
Modal (cloud)  →  TribeV2 → voxels (mock for now)
    │
    ▼  voxels back
FastAPI parses voxels locally  →  JSON response
    ▼
React renders feedback
```

### Rules
- TribeV2 inference runs on **Modal** (heavy, GPU). Parser runs on **local FastAPI** (cheap, fast iteration).
- Stable API contract: `POST /process` (multipart `video`) → `{ feedback, high_activation_minutes, total_minutes }`.
- React calls only the local FastAPI endpoint, never Modal directly.
- FastAPI calls Modal via `modal.Function.from_name("metaware-tribe", "tribe_infer")` — uses local Modal token, no CORS needed at Modal layer.
- Browser ↔ FastAPI requires CORS on FastAPI (already configured for `localhost:5173`).
- Mock surfaces to swap later: `tribe_infer` body in `pipeline/modal_app.py`, `parse_voxels` in `server/main.py`.

### Prototype 2 path
- Reuse `pipeline/` and `server/` unchanged except for one CORS edit (`chrome-extension://*` allowed origin).
- Capture lives in an **offscreen document** driven by `chrome.tabCapture.getMediaStreamId()`; orchestration in the service worker; UI in a side panel — see `chrome-extension-implementation.md` for the full architecture and rolling-buffer state machine.
- Each 10s `MediaRecorder` mp4 (`avc1.42E01E` + `mp4a.40.2`) is POSTed to the same `/process` endpoint as the upload demo. No new endpoints, no new pipeline code.

## Run commands

Three processes for full local dev (run in three terminals):

1. **Deploy Modal pipeline** (rerun after edits to `pipeline/modal_app.py`):
   ```bash
   source .venv/bin/activate
   modal deploy pipeline/modal_app.py
   ```
   First deploy of the real `Tribe` class takes 10–20 min (heavy ML deps in
   image build). Subsequent deploys reuse the cached image and are fast.
   Smoke test the mock function: `modal run pipeline/modal_app.py`.

   Pre-flight (one-time):
   - Request HuggingFace access for Llama-3.2 (gated model used by TribeV2).
   - Create Modal secret: `modal secret create huggingface HF_TOKEN=hf_xxx HUGGING_FACE_HUB_TOKEN=hf_xxx`.
   - The class uses GPU `A10G` and a persistent `tribev2-cache` Modal Volume
     to avoid re-downloading the ~1 GB checkpoint each cold start.

2. **Local FastAPI server**:
   ```bash
   source .venv/bin/activate
   uvicorn server.main:app --reload
   ```
   Serves at `localhost:8000`. Verify: `curl localhost:8000/health`.

3. **React dev server**:
   ```bash
   npm run dev
   ```
   Serves at `localhost:5173`.

## Python env

- Use the `.venv` at repo root (created with `uv venv`). Activate first before any Python install or run:
  ```bash
  source .venv/bin/activate
  ```
- **Use `uv pip install`, NOT `pip install`.** The venv ships without its own pip, so plain `pip` resolves to conda's pip and installs into conda base instead of `.venv`. Always:
  ```bash
  uv pip install <package>
  ```
- All `python` / `modal` commands must run inside the activated venv. Verify with `which python` → should show `.venv/bin/python`.
- If conda base auto-activates, run `conda deactivate` before sourcing `.venv`.
- Backend deps are pinned in `requirements.txt`. Install / sync with:
  ```bash
  uv pip install -r requirements.txt
  ```
  Update both the file and lockstep when adding a new top-level import.

## Open items

- Parsing algorithm spec — see `TribeV2-Output-Parsing-Pipeline.md`
- Presentation framing — not started