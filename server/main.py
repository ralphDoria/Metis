"""Local FastAPI server.

Receives video uploads from the React frontend, forwards to Modal for TribeV2
inference, runs the parser locally, exports brain visualization assets, and
returns session feedback + asset URLs.

Run:
    source .venv/bin/activate
    uvicorn server.main:app --reload
"""

import logging
import mimetypes
import uuid
from pathlib import Path

import modal

# Register GLB mime so StaticFiles serves it as binary glTF rather than text/plain.
mimetypes.add_type("model/gltf-binary", ".glb")
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from server import firestore as fs
from server.brain_export import (
    ensure_geometry,
    geometry_paths,
    write_color_buffer,
)
from server.parser import parse_preds

log = logging.getLogger("metaware.server")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://((.+\.)?mnkjoshi\.ca|localhost:\d+)",
    allow_methods=["*"],
    allow_headers=["*"],
)

# Real TribeV2 inference on Modal GPU. Swap to `tribe_mock_infer` (Function.from_name)
# while iterating without GPU cost.
Tribe = modal.Cls.from_name("metaware-tribe", "Tribe")

REPO_ROOT = Path(__file__).resolve().parents[1]
SAMPLE_PREDS_PATH = REPO_ROOT / "tribev2_sample_predictions.csv"
STATIC_DIR = REPO_ROOT / "server" / "static"
JOBS_DIR = STATIC_DIR / "jobs"

# Pre-bake hemisphere GLBs once at startup so the first /process is fast.
ensure_geometry(STATIC_DIR)
JOBS_DIR.mkdir(parents=True, exist_ok=True)
LH_GLB, RH_GLB = geometry_paths(STATIC_DIR)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def _build_brain_payload(preds: np.ndarray) -> dict:
    """Persist a per-job color buffer and return URL metadata for the frontend."""
    job_id = uuid.uuid4().hex
    job_dir = JOBS_DIR / job_id
    colors_path = job_dir / "colors.bin"
    meta = write_color_buffer(preds, colors_path)
    return {
        "left_geom_url": f"/static/{LH_GLB.name}",
        "right_geom_url": f"/static/{RH_GLB.name}",
        "colors_url": f"/static/jobs/{job_id}/colors.bin",
        **meta,
    }


def _persist_session(parsed: dict, brain: dict, video: UploadFile | None, video_size: int | None) -> str | None:
    """Best-effort write to Firestore. Returns doc id, or None if not configured / failed."""
    if not fs.is_configured():
        log.warning("Firestore not configured; skipping session persistence")
        return None
    try:
        return fs.save_session(
            parsed=parsed,
            brain=brain,
            video_filename=getattr(video, "filename", None),
            video_size_bytes=video_size,
        )
    except Exception:
        log.exception("Failed to persist session to Firestore")
        return None


@app.post("/process")
async def process(video: UploadFile = File(...)):
    video_bytes = await video.read()
    result = Tribe().infer.remote(video_bytes)
    preds = np.asarray(result["preds"], dtype=np.float32)
    parsed = parse_preds(preds)
    brain = _build_brain_payload(preds)
    session_id = _persist_session(parsed, brain, video, len(video_bytes))
    return {**parsed, "brain": brain, "session_id": session_id}


@app.get("/demo")
def demo():
    """Run the parser against the bundled sample TribeV2 output."""
    preds = np.loadtxt(SAMPLE_PREDS_PATH, delimiter=",", skiprows=1, dtype=np.float32)
    parsed = parse_preds(preds)
    brain = _build_brain_payload(preds)
    session_id = _persist_session(parsed, brain, None, None)
    return {**parsed, "brain": brain, "session_id": session_id}


@app.get("/sessions")
def sessions(limit: int = 50):
    if not fs.is_configured():
        raise HTTPException(503, "Firestore not configured")
    return {"sessions": fs.list_sessions(limit=limit)}


@app.get("/sessions/{session_id}")
def session_detail(session_id: str):
    if not fs.is_configured():
        raise HTTPException(503, "Firestore not configured")
    doc = fs.get_session(session_id)
    if doc is None:
        raise HTTPException(404, "session not found")
    return doc


@app.get("/health")
def health():
    return {"ok": True, "firestore": fs.is_configured()}
