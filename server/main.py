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
    allow_origin_regex=r"https?://(.+\.)?mnkjoshi\.ca|http://localhost:\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)

# Real TribeV2 inference on Modal GPU. Swap to `tribe_mock_infer` (Function.from_name)
# while iterating without GPU cost.
Tribe = modal.Cls.from_name("metaware-tribe", "Tribe")


def parse_preds(preds: list) -> dict:
    """Mock parser. Real version derives session-level activation stats from
    cortex predictions of shape (n_timesteps, n_vertices)."""
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
    result = Tribe().infer.remote(video_bytes)
    parsed = parse_preds(result["preds"])
    return {**parsed, **result}


@app.get("/health")
def health():
    return {"ok": True}
