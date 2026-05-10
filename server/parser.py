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

# ---- Layman labeling system (MVP1) ----------------------------------------
# Each ROI gets a plain-language name, then we bucket its z-scored mean into
# low/medium/high using fixed thresholds. Composite patterns combine those
# qualifiers into shippable insight labels with a per-pattern plausibility cap
# (neuroscience reverse-inference is fuzzy — caps prevent over-claiming).

ROI_DISPLAY = {
    "reward": "Reward / pleasure",
    "salience": "Attention-grabbing",
    "pcc": "Self-reflection / mind-wandering",
    "insula": "Gut arousal / visceral",
    "face": "Face recognition",
    "social": "Social processing",
    "control": "Deliberate thinking / self-control",
}

# Until a neutral-footage baseline exists, bucket ROI means by per-session
# percentile: top third → "high", bottom third → "low", middle → "medium".
# This is relative-within-session, not an absolute neuroscientific claim, but
# it produces stable labels at any signal magnitude. With 7 ROIs we get 2
# low + 3 medium + 2 high. Swap to absolute z-score cuts once a baseline
# (TribeV2 on neutral nature footage) is computed.
PCT_LOW_CUT = 1 / 3
PCT_HIGH_CUT = 2 / 3

PLAUSIBILITY_CAPS = {
    "low": 0.4,
    "medium": 0.7,
    "medium-high": 0.85,
    "high": 1.0,
}

# Each pattern's `rules` list is ANDed: every (roi, qualifier) must hit for
# the pattern to match. Match strength = min over rules of how strongly each
# variable crosses its threshold. Confidence = strength * plausibility cap.
PATTERNS = [
    {
        "key": "dopamine_bait",
        "label": "Dopamine bait",
        "description": "Reward circuits firing with control regions disengaged — the short-form-feed addiction signature.",
        "plausibility": "medium-high",
        "rules": [("reward", "high"), ("control", "low")],
    },
    {
        "key": "comparison_spiral",
        "label": "Comparison spiral",
        "description": "Self-referential thought paired with social processing — the Instagram comparison loop.",
        "plausibility": "medium-high",
        "rules": [("pcc", "high"), ("social", "high")],
    },
    {
        "key": "clickbait",
        "label": "Clickbait pattern",
        "description": "Feed grabs your attention but doesn't pay it off with reward.",
        "plausibility": "medium",
        "rules": [("salience", "high"), ("reward", "low")],
    },
    {
        "key": "social_cue_heavy",
        "label": "Social-cue heavy",
        "description": "Lots of face-on / parasocial content — vloggers, talking heads, dating-style clips.",
        "plausibility": "medium",
        "rules": [("face", "high"), ("social", "high")],
    },
    {
        "key": "deliberate_engagement",
        "label": "Deliberate engagement",
        "description": "Active top-down processing — the kind of attention educational or analytical content recruits.",
        "plausibility": "medium",
        "rules": [("control", "high")],
    },
    {
        "key": "autopilot_scroll",
        "label": "Autopilot scroll",
        "description": "Mind-wandering without reward or control — drifting consumption.",
        "plausibility": "medium",
        "rules": [("pcc", "high"), ("control", "low"), ("reward", "low")],
    },
    {
        "key": "anxiety_lean",
        "label": "Anxiety / threat lean",
        "description": "Salience without payoff. Caveat: insula also signals disgust and interoception, so this read is approximate.",
        "plausibility": "low",
        "rules": [("insula", "high"), ("salience", "high"), ("reward", "low")],
    },
    {
        "key": "visceral_sensory",
        "label": "Visceral / sensory immersion",
        "description": "Strong gut-level arousal alongside dense face content — sensory-heavy visuals (food, ASMR, beauty close-ups).",
        "plausibility": "medium",
        "rules": [("insula", "high"), ("face", "high")],
    },
    {
        "key": "detached_viewing",
        "label": "Detached viewing",
        "description": "Face content without strong social processing — looking at people without engaging with them.",
        "plausibility": "low",
        "rules": [("face", "high"), ("social", "low")],
    },
]


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


def _percentile_qualifiers(rois: dict) -> dict:
    """Bucket each ROI's mean against the rest of this session's ROIs.

    Returns {roi_key: "low"|"medium"|"high"}. Top third of values → "high",
    bottom third → "low", middle → "medium".
    """
    sorted_keys = sorted(rois.keys(), key=lambda k: rois[k])
    n = len(sorted_keys)
    lo_cut = int(n * PCT_LOW_CUT)
    hi_cut = int(round(n * PCT_HIGH_CUT))
    quals = {}
    for i, k in enumerate(sorted_keys):
        if i < lo_cut:
            quals[k] = "low"
        elif i >= hi_cut:
            quals[k] = "high"
        else:
            quals[k] = "medium"
    return quals


def _confidence_label(c: float) -> str:
    if c >= 0.75:
        return "high"
    if c >= 0.5:
        return "medium"
    return "low"


def _derive_patterns(quals: dict) -> list:
    """Match every pattern whose rules all fire and return them sorted by
    confidence (highest first). Confidence here is the plausibility cap
    (how much we trust the pattern label even when the data hits it cleanly)
    — match itself is binary because qualifiers are per-session percentile
    buckets, not absolute strengths.
    """
    matches = []
    for pat in PATTERNS:
        if not all(quals[roi] == expected for roi, expected in pat["rules"]):
            continue
        cap = PLAUSIBILITY_CAPS[pat["plausibility"]]
        matches.append({
            "key": pat["key"],
            "label": pat["label"],
            "description": pat["description"],
            "plausibility": pat["plausibility"],
            "confidence": cap,
            "confidence_label": _confidence_label(cap),
        })
    matches.sort(key=lambda m: m["confidence"], reverse=True)
    return matches


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

    rois_f = {k: float(v) for k, v in rois.items()}
    quals = _percentile_qualifiers(rois_f)

    variables = [
        {
            "key": k,
            "name": ROI_DISPLAY[k],
            "value": rois_f[k],
            "qualifier": quals[k],
        }
        for k in ROI_DISPLAY
    ]

    score_breakdown = {
        "reward_composite": float(reward_composite),
        "salience_composite": float(salience_composite),
        "control_composite": float(control_composite),
        "raw_score": float(raw_score),
        "formula": "(reward_composite + 0.5 × salience_composite) / (control_composite + ε)",
    }

    patterns = _derive_patterns(quals)

    return {
        "score": float(score),
        "label": label,
        "feedback": feedback,
        "n_timesteps": int(preds.shape[0]),
        "n_vertices": int(preds.shape[1]),
        "rois": rois_f,
        "reward_composite": float(reward_composite),
        "salience_composite": float(salience_composite),
        "control_composite": float(control_composite),
        "baseline_normalized": BASELINE_SCORE is not None,
        "variables": variables,
        "score_breakdown": score_breakdown,
        "patterns": patterns,
    }
