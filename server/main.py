"""Local FastAPI server.

Receives video uploads from the React frontend, forwards to Modal for TribeV2
inference, runs the parser locally, returns session feedback.

Run:
    source .venv/bin/activate
    uvicorn server.main:app --reload
"""

import modal
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://localhost:\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)

tribe_mock_infer = modal.Function.from_name("metaware-tribe", "tribe_mock_infer")


def parse_voxels(voxels: list) -> dict:
    """Mock parser. Real version derives session-level activation stats."""
    return {
        "high_activation_minutes": 14,
        "total_minutes": 20,
        "feedback": (
            "Your feed triggered high dopamine-region activation for "
            "14 of the last 20 minutes."
        ),
    }


@app.post("/process")
async def process(video: UploadFile = File(...)):
    video_bytes = await video.read()
    voxels = tribe_mock_infer.remote(video_bytes)
    parsed = parse_voxels(voxels)
    return {**parsed, "voxels": voxels}


@app.get("/health")
def health():
    return {"ok": True}
