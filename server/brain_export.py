"""Export TribeV2 predictions as Three.js-ready brain assets.

Strategy: one geometry GLB per hemisphere (no colors, written once and reused
across jobs) + one packed color buffer per job covering all timesteps.

Frontend loads the two GLBs once via GLTFLoader, then fetches the color buffer
and swaps `geometry.attributes.color` per timestep without reloading geometry.

Color buffer layout (raw uint8, big endian):
    [timestep][hemi][vertex][rgb]
    where hemi = 0 (left) | 1 (right), vertex in [0, 10242), rgb is 3 bytes.
    Total size = n_timesteps * 2 * 10242 * 3 bytes.

Public API:
    geometry_paths(static_dir) -> (lh_glb_path, rh_glb_path)
    ensure_geometry(static_dir)
    write_color_buffer(preds, out_path) -> {vmin, vmax, n_timesteps, n_vertices}
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Tuple

import matplotlib.pyplot as plt
import nibabel as nib
import numpy as np
import trimesh
from nilearn import datasets

N_VERTS_PER_HEMI = 10242
COLORMAP = "hot"


@lru_cache(maxsize=1)
def _fsaverage5():
    return datasets.fetch_surf_fsaverage(mesh="fsaverage5")


def _load_gifti_geometry(path: str) -> Tuple[np.ndarray, np.ndarray]:
    """Read a GIFTI surface, return (coords float32, faces int32)."""
    g = nib.load(path)
    coords = None
    faces = None
    for arr in g.darrays:
        if arr.data.ndim == 2 and arr.data.shape[1] == 3:
            if np.issubdtype(arr.data.dtype, np.floating):
                coords = np.asarray(arr.data, dtype=np.float32)
            else:
                faces = np.asarray(arr.data, dtype=np.int32)
    if coords is None or faces is None:
        raise RuntimeError(f"Could not parse GIFTI geometry at {path}")
    return coords, faces


def geometry_paths(static_dir: Path) -> Tuple[Path, Path]:
    return static_dir / "brain_left.glb", static_dir / "brain_right.glb"


def ensure_geometry(static_dir: Path) -> Tuple[Path, Path]:
    """Write geometry-only GLBs for both pial hemispheres if missing.

    Geometry is shared across all jobs — coords + faces don't change.
    """
    static_dir.mkdir(parents=True, exist_ok=True)
    lh_path, rh_path = geometry_paths(static_dir)
    fs = _fsaverage5()

    for out_path, surf_path in (
        (lh_path, fs.pial_left),
        (rh_path, fs.pial_right),
    ):
        if out_path.exists():
            continue
        coords, faces = _load_gifti_geometry(surf_path)
        # Neutral grey vertex colors — frontend overwrites per timestep.
        grey = np.full((coords.shape[0], 3), 200, dtype=np.uint8)
        mesh = trimesh.Trimesh(
            vertices=coords,
            faces=faces,
            vertex_colors=grey,
            process=False,
        )
        mesh.export(out_path)
    return lh_path, rh_path


def _vals_to_rgb(vals: np.ndarray, vmin: float, vmax: float) -> np.ndarray:
    """Map values to RGB uint8 using global vmin/vmax. Shape: (n, 3)."""
    norm = (vals - vmin) / (vmax - vmin + 1e-8)
    norm = np.clip(norm, 0.0, 1.0)
    cmap = plt.get_cmap(COLORMAP)
    rgba = cmap(norm)
    return (rgba[:, :3] * 255).astype(np.uint8)


def write_color_buffer(preds: np.ndarray, out_path: Path) -> dict:
    """Write packed per-timestep RGB buffer for both hemispheres.

    Args:
        preds: shape (T, 20484), T timesteps, fsaverage5 verts.
        out_path: destination .bin file.

    Returns:
        Metadata dict with vmin/vmax/n_timesteps/n_vertices.
    """
    if preds.ndim != 2 or preds.shape[1] != 2 * N_VERTS_PER_HEMI:
        raise ValueError(f"preds must be (T, {2 * N_VERTS_PER_HEMI}); got {preds.shape}")

    n_timesteps = int(preds.shape[0])
    vmin = float(preds.min())
    vmax = float(preds.max())

    # Buffer shape: (T, 2, V, 3) uint8 — but we write hemi-major per timestep
    # to match documented layout: lh verts first, then rh verts.
    out = np.empty((n_timesteps, 2 * N_VERTS_PER_HEMI, 3), dtype=np.uint8)
    for t in range(n_timesteps):
        frame = preds[t]
        out[t, :N_VERTS_PER_HEMI] = _vals_to_rgb(frame[:N_VERTS_PER_HEMI], vmin, vmax)
        out[t, N_VERTS_PER_HEMI:] = _vals_to_rgb(frame[N_VERTS_PER_HEMI:], vmin, vmax)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(out.tobytes())

    return {
        "vmin": vmin,
        "vmax": vmax,
        "n_timesteps": n_timesteps,
        "n_vertices_per_hemi": N_VERTS_PER_HEMI,
    }
