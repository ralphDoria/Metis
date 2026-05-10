"""TribeV2 pipeline on Modal.

- `Tribe` class: real inference on GPU. Loads model once per container via
  @modal.enter, predicts cortical activity per second of video.
- `tribe_mock_infer`: cheap CPU mock for local dev / smoke tests when GPU
  isn't needed.

Deploy:
    modal deploy pipeline/modal_app.py

Smoke test (mock):
    modal run pipeline/modal_app.py
"""

from pathlib import Path

import modal

app = modal.App("metaware-tribe")

# Real-inference image: TribeV2 + dependencies (heavy first build).
# Cache env vars are set at runtime inside @modal.enter, NOT here. Image-level
# env vars cause Modal to create the referenced directories during build,
# which makes the mount path non-empty and breaks volume mounting.
tribe_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("git", "ffmpeg")
    .pip_install(
        "tribev2[plotting] @ git+https://github.com/facebookresearch/tribev2.git",
    )
)

# Persistent cache for HuggingFace model checkpoints (~1 GB) + WhisperX weights.
cache_volume = modal.Volume.from_name("tribev2-cache", create_if_missing=True)

# Mock image: tiny, no GPU needed.
mock_image = modal.Image.debian_slim().pip_install("numpy")


@app.cls(
    image=tribe_image,
    gpu="A10G",
    secrets=[modal.Secret.from_name("huggingface")],
    volumes={"/cache": cache_volume},
    timeout=1800,
)
class Tribe:
    @modal.enter()
    def load(self):
        import os

        # Volume mount happens BEFORE this runs, so /cache is mounted and empty.
        # Set cache env vars now (after mount), then create dirs on the volume.
        os.environ["HF_HOME"] = "/cache/huggingface"
        os.environ["HUGGING_FACE_HUB_TOKEN"] = os.environ.get("HF_TOKEN", "")
        os.environ["XDG_CACHE_HOME"] = "/cache"

        # uv uses hardlinks + chmod ops not supported on Modal Volumes. Redirect
        # uv's package cache to /tmp (ephemeral, but whisperx is small) and
        # force copy mode to avoid hardlink failures.
        os.environ["UV_CACHE_DIR"] = "/tmp/uv-cache"
        os.environ["UV_LINK_MODE"] = "copy"

        from tribev2.demo_utils import TribeModel

        cache_folder = Path("/cache/tribev2")
        cache_folder.mkdir(parents=True, exist_ok=True)
        Path("/cache/huggingface").mkdir(parents=True, exist_ok=True)

        self.model = TribeModel.from_pretrained(
            "facebook/tribev2",
            cache_folder=cache_folder,
        )

    @modal.method()
    def infer(self, video_bytes: bytes) -> dict:
        """Run TribeV2 on a video. Returns predicted cortex activity.

        Output shape: (n_timesteps, 20484) — one prediction per second of
        stimulus, one value per fsaverage5 cortical surface vertex.
        """
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            f.write(video_bytes)
            video_path = f.name

        df = self.model.get_events_dataframe(video_path=video_path)
        preds, _segments = self.model.predict(events=df)

        return {
            "preds": preds.tolist(),
            "n_timesteps": int(preds.shape[0]),
            "n_vertices": int(preds.shape[1]),
        }


@app.function(image=mock_image)
def tribe_mock_infer(video_bytes: bytes) -> dict:
    """Cheap CPU mock. Same return contract as Tribe.infer."""
    import numpy as np

    n_timesteps, n_vertices = 20, 20484
    preds = np.random.rand(n_timesteps, n_vertices).astype(np.float32)
    return {
        "preds": preds.tolist(),
        "n_timesteps": n_timesteps,
        "n_vertices": n_vertices,
    }


@app.local_entrypoint()
def main():
    """Smoke test the mock: `modal run pipeline/modal_app.py`."""
    out = tribe_mock_infer.remote(b"")
    print(f"Mock preds: n_timesteps={out['n_timesteps']} n_vertices={out['n_vertices']}")
