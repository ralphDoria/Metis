"""Mock TribeV2 pipeline running on Modal.

Replace `tribe_infer` body with the real TribeV2 inference once weights and
preprocessing are wired up. Contract stays the same: bytes in, voxel array out.
"""

import modal

app = modal.App("metaware-tribe")

image = modal.Image.debian_slim().pip_install("numpy")


@app.function(image=image)
def tribe_mock_infer(video_bytes: bytes) -> list:
    """Mock inference. Returns a fake 4D voxel timeseries.

    Real version: decode video → preprocess frames → run TribeV2 → return
    voxel activation over time.
    """
    import numpy as np

    voxels = np.random.rand(20, 10, 10, 10).astype(np.float32)
    return voxels.tolist()

@app.function(image=image)
def tribe_infer(video_bytes: bytes) -> list:
    """Mock inference. Returns a fake 4D voxel timeseries.

    Real version: decode video → preprocess frames → run TribeV2 → return
    voxel activation over time.
    """
    import numpy as np

    voxels = np.random.rand(20, 10, 10, 10).astype(np.float32)
    return voxels.tolist()


@app.local_entrypoint()
def main():
    """Quick smoke test: `modal run pipeline/modal_app.py`."""
    out = tribe_infer.remote(b"")
    print(f"Got voxels with shape outer={len(out)} inner={len(out[0])}")
