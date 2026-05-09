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

Modular layout — prototype 2 swaps frontend, reuses pipeline + client lib unchanged.

```
Metaware/
  pipeline/         # Modal app: TribeV2 + parsing, deployed as Modal web endpoint
    modal_app.py
  packages/client/  # Shared JS lib: API calls, rolling-buffer sampler, types
  my-app/           # Prototype 1 — Vite + React upload UI, imports client
  extension/        # Prototype 2 — Chrome extension, imports same client
```

### Rules
- Pipeline (TribeV2 + parsing) runs on **Modal**. Heavy compute, cloud-only.
- Modal exposes pipeline as web endpoint (`@modal.web_endpoint` or `@modal.asgi_app`). No separate server layer.
- `packages/client` = pure JS, zero DOM/React deps. Both prototypes import it.
- Rolling-buffer sampler lives in client lib (extension reuses for live feed).
- Stable API contract: `POST /process { video } → { response }`.
- Link client into apps via `"@metaware/client": "file:../packages/client"`.
- Frontend hits Modal URL directly. Client lib holds endpoint URL.

### Modal notes
- Enable CORS on endpoint so browser (React app + extension) can call it:
  ```python
  from fastapi.middleware.cors import CORSMiddleware
  app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
  ```
- Set `keep_warm=1` for demo to avoid cold starts.
- Auth: prototype = public endpoint. Production = token-gated.

## Run commands

- React dev server (no cd): `npm run dev` — serves at `localhost:5173`

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

## Open items

- Parsing algorithm spec — see `TribeV2-Output-Parsing-Pipeline.md`
- Presentation framing — not started