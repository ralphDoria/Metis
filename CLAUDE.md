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

- Chrome extension watches Instagram/TikTok feed in browser as user scrolls
- Captures rolling video samples from feed
- Sends to prototype 1 pipeline
- Returns session feedback in-extension
- Depends on: prototype 1 pipeline being functional

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
- Reuse `pipeline/` and `server/` unchanged.
- Build a Chrome extension that captures feed video via `chrome.tabCapture` or content script, posts the same `/process` payload to the local server (or hosted version of it).

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