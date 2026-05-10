"""Local FastAPI server.

Receives video uploads from the React frontend, forwards to Modal for TribeV2
inference, runs the parser locally, exports brain visualization assets, and
returns session feedback + asset URLs.

Run:
    source .venv/bin/activate
    uvicorn server.main:app --reload
"""

import mimetypes
import uuid
from pathlib import Path

import modal

# Register GLB mime so StaticFiles serves it as binary glTF rather than text/plain.
mimetypes.add_type("model/gltf-binary", ".glb")
import numpy as np
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from server.brain_export import (
    ensure_geometry,
    geometry_paths,
    write_color_buffer,
)
from server.parser import parse_preds

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://localhost:\d+",
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


@app.post("/process")
async def process(video: UploadFile = File(...)):
    video_bytes = await video.read()
    result = Tribe().infer.remote(video_bytes)
    preds = np.asarray(result["preds"], dtype=np.float32)
    parsed = parse_preds(preds)
    brain = _build_brain_payload(preds)
    return {**parsed, "brain": brain}


@app.get("/demo")
def demo():
    """Run the parser against the bundled sample TribeV2 output."""
    preds = np.loadtxt(SAMPLE_PREDS_PATH, delimiter=",", skiprows=1, dtype=np.float32)
    parsed = parse_preds(preds)
    brain = _build_brain_payload(preds)
    return {**parsed, "brain": brain}


@app.get("/health")
def health():
    return {"ok": True}
