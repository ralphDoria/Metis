"""Parser for TribeV2 cortex predictions.

Implements the addictiveness-score pipeline described in
TribeV2-Output-Parsing-Pipeline.md:
  preds (n_timesteps, 20484) → ROI means → composite reward / salience /
  control → raw_score = (reward + 0.5 * salience) / (control + eps).

Baseline normalization is left as a TODO (requires running TribeV2 on a
neutral nature clip and storing the resulting score). Until then,
`addictiveness_score` is the raw score, not normalized.
"""

from functools import lru_cache

import numpy as np
from nilearn import datasets

REWARD_LABELS = ["G_orbital", "G_rectus"]
SALIENCE_LABELS = ["G_and_S_cingul-Ant"]
PCC_LABELS = ["G_cingul-Post-dor", "G_cingul-Post-ven"]
INSULA_LABELS = [
    "G_insular_short",
    "S_circular_insula_ant",
    "S_circular_insula_inf",
]
# Destrieux uses "G_oc-temp_lat-fusifor" rather than the "G_fusiform" string in
# the doc. Match by the unambiguous substring "fusifor".
FACE_LABELS = ["fusifor"]
# Doc's "G_temporal_sup" doesn't exist as a single label in Destrieux; the
# gyrus is split into 4 subdivisions all prefixed "G_temp_sup-".
SOCIAL_LABELS = ["S_temporal_sup", "G_temp_sup"]
CONTROL_LABELS = ["G_front_middle", "G_front_sup"]

SALIENCE_WEIGHT = 0.5

# Placeholder until baseline is computed against neutral footage.
BASELINE_SCORE = None


def _decode(name) -> str:
    return name.decode() if isinstance(name, bytes) else str(name)


def _roi_mask(vertex_labels, label_substrings, atlas_labels):
    matched = [
        i
        for i, name in enumerate(atlas_labels)
        if any(s in _decode(name) for s in label_substrings)
    ]
    return np.isin(vertex_labels, matched)


@lru_cache(maxsize=1)
def _load_atlas():
    """Fetch Destrieux atlas + build all ROI masks. Cached after first call."""
    destrieux = datasets.fetch_atlas_surf_destrieux()
    vertex_labels = np.concatenate([destrieux.map_left, destrieux.map_right])
    labels = destrieux.labels
    return {
        "reward": _roi_mask(vertex_labels, REWARD_LABELS, labels),
        "salience": _roi_mask(vertex_labels, SALIENCE_LABELS, labels),
        "pcc": _roi_mask(vertex_labels, PCC_LABELS, labels),
        "insula": _roi_mask(vertex_labels, INSULA_LABELS, labels),
        "face": _roi_mask(vertex_labels, FACE_LABELS, labels),
        "social": _roi_mask(vertex_labels, SOCIAL_LABELS, labels),
        "control": _roi_mask(vertex_labels, CONTROL_LABELS, labels),
    }


def _label_for_score(score: float) -> str:
    if score > 2.0:
        return "high"
    if score > 1.5:
        return "elevated"
    return "average"


def parse_preds(preds: np.ndarray) -> dict:
    """Run the full ROI extraction + addictiveness score on a preds array.

    Args:
        preds: shape (n_timesteps, 20484), z-scored BOLD per fsaverage5 vertex.

    Returns:
        dict with score, label, per-ROI scalars, and feedback string.
    """
    masks = _load_atlas()

    rois = {name: preds[:, mask].mean() for name, mask in masks.items()}

    reward_composite = (rois["reward"] + rois["salience"] + rois["pcc"] + rois["insula"]) / 4
    salience_composite = (rois["face"] + rois["social"]) / 2
    control_composite = rois["control"]

    raw_score = (reward_composite + SALIENCE_WEIGHT * salience_composite) / (
        control_composite + 1e-6
    )

    score = raw_score / BASELINE_SCORE if BASELINE_SCORE else raw_score
    label = _label_for_score(score)

    feedback = (
        f"Addictiveness score: {score:.2f} ({label}). "
        f"Reward composite: {reward_composite:.2f}, "
        f"salience: {salience_composite:.2f}, "
        f"control: {control_composite:.2f}."
    )

    return {
        "score": float(score),
        "label": label,
        "feedback": feedback,
        "n_timesteps": int(preds.shape[0]),
        "n_vertices": int(preds.shape[1]),
        "rois": {k: float(v) for k, v in rois.items()},
        "reward_composite": float(reward_composite),
        "salience_composite": float(salience_composite),
        "control_composite": float(control_composite),
        "baseline_normalized": BASELINE_SCORE is not None,
    }
