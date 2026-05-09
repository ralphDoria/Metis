# TRIBE v2 Output Parsing Pipeline
## Context Document for Claude Code

---

## 1. What TRIBE v2 Outputs

The public inference API (`TribeModel.predict()`) returns a NumPy array:

```python
preds, segments = model.predict(events=df)
# preds.shape → (n_timesteps, 20484)
```

- **Axes:** rows = time (1 Hz, one row per second of stimulus), columns = cortical vertices
- **Values:** predicted BOLD (Blood-Oxygen-Level-Dependent) signal, z-scored
- **Space:** fsaverage5 cortical surface mesh — 10,242 vertices per hemisphere, 20,484 total
- **Coverage:** cortical surface only (subcortical voxels exist in the paper architecture but are not exposed by the public `model.predict()` API)
- **Lag:** predictions are offset 5 seconds into the past to compensate for hemodynamic lag (already applied internally by TRIBE)

---

## 2. The Atlas: Destrieux on fsaverage5

### Why Destrieux
The Destrieux 2009 atlas is the correct choice for this pipeline because it is natively distributed in fsaverage5 surface space — the same coordinate space TRIBE outputs. No registration or resampling is required. It provides 76 anatomical labels per hemisphere (152 total) based on sulco-gyral patterns.

### Loading the Atlas
```python
from nilearn import datasets
import numpy as np

destrieux = datasets.fetch_atlas_surf_destrieux()

# One label index per vertex, per hemisphere
# map_left.shape  → (10242,)
# map_right.shape → (10242,)

# Concatenate to match TRIBE's full (20484,) vertex axis
vertex_labels = np.concatenate([destrieux.map_left, destrieux.map_right])
# vertex_labels.shape → (20484,)
# vertex_labels[i] → integer index into destrieux.labels for vertex i
```

### Building an ROI Mask
```python
def get_roi_mask(vertex_labels, label_substrings, destrieux_labels):
    """Return boolean mask (20484,) for vertices matching any label substring."""
    matched_indices = [
        i for i, name in enumerate(destrieux_labels)
        if any(s in name.decode() for s in label_substrings)
    ]
    return np.isin(vertex_labels, matched_indices)
```

---

## 3. Target ROIs and Their Variables

All ROIs are extracted from the 20,484 cortical vertices. Each maps to a named psychological/behavioral variable used in the addictiveness score.

### 3a. Reward Signal Variables (numerator)

#### `reward_value` — Orbitofrontal Cortex (OFC)
```
Destrieux labels: ['G_orbital', 'G_rectus']
```
Encodes the *expected reward value* of a stimulus — how much the brain anticipates gaining from continued engagement. High activation indicates the content is being processed as rewarding. Core component of compulsive behavior loops.

#### `motivational_salience` — Anterior Cingulate Cortex (ACC)
```
Destrieux labels: ['G_and_S_cingul-Ant']
```
Tracks how much attentional and motivational resources the brain allocates to a stimulus. High ACC activation signals the brain is treating content as high-priority and worth continued engagement.

#### `self_referential_pull` — Posterior Cingulate Cortex (PCC)
```
Destrieux labels: ['G_cingul-Post-dor', 'G_cingul-Post-ven']
```
Core hub of the Default Mode Network. Activates strongly during self-referential processing — when content feels personally relevant ("this is about me"). Strongly implicated in craving and compulsive thought. High PCC activation is a reliable marker of the "can't stop thinking about it" quality of addictive content.

#### `interoceptive_craving` — Insula
```
Destrieux labels: ['G_insular_short', 'S_circular_insula_ant', 'S_circular_insula_inf']
```
Processes internal bodily states and translates them into conscious urges. High insula activation produces the visceral "gut-feel" urgency that characterizes outrage bait, fear-inducing content, and social anxiety triggers. Strongly linked to craving states in addiction literature.

---

### 3b. Salience Signal Variables (numerator, partial weight)

#### `face_engagement` — Fusiform Gyrus
```
Destrieux labels: ['G_fusiform']
```
The brain's dedicated face-processing region. Faces are one of the most potent automatic attention triggers — content featuring faces, eye contact, or close-up human expressions reliably captures and holds attention through this mechanism. High activation indicates strong social-visual engagement hooks.

#### `social_signal_processing` — Superior Temporal Sulcus / Gyrus (STS/STG)
```
Destrieux labels: ['S_temporal_sup', 'G_temporal_sup']
```
Processes biological motion, vocal prosody, social cues, and theory-of-mind signals. Activates strongly for parasocial content (creators speaking directly to camera), reaction videos, and any content simulating interpersonal interaction.

---

### 3c. Control Signal Variables (denominator)

#### `executive_control` — Dorsolateral Prefrontal Cortex (dlPFC)
```
Destrieux labels: ['G_front_middle']
```
The brain's primary impulse inhibition and rational evaluation region. When dlPFC activation is *low relative to reward signals*, the brain is consuming rather than evaluating. The ratio of reward to control is the central mechanism by which addictive content bypasses deliberate decision-making.

#### `top_down_regulation` — Superior Frontal Gyrus
```
Destrieux labels: ['G_front_sup']
```
Supports deliberate top-down regulation of behavior and emotion. Works in concert with dlPFC to modulate automatic reward responses. Low activation indicates the content is not being consciously regulated.

---

## 4. Extraction and Score Calculation

```python
# --- Build masks ---
reward_mask    = get_roi_mask(vertex_labels, ['G_orbital', 'G_rectus'], destrieux.labels)
salience_mask  = get_roi_mask(vertex_labels, ['G_and_S_cingul-Ant'], destrieux.labels)
pcc_mask       = get_roi_mask(vertex_labels, ['G_cingul-Post-dor', 'G_cingul-Post-ven'], destrieux.labels)
insula_mask    = get_roi_mask(vertex_labels, ['G_insular_short', 'S_circular_insula_ant', 'S_circular_insula_inf'], destrieux.labels)
face_mask      = get_roi_mask(vertex_labels, ['G_fusiform'], destrieux.labels)
social_mask    = get_roi_mask(vertex_labels, ['S_temporal_sup', 'G_temporal_sup'], destrieux.labels)
control_mask   = get_roi_mask(vertex_labels, ['G_front_middle', 'G_front_sup'], destrieux.labels)

# --- Extract mean activation per ROI (collapse vertices → scalar per timestep) ---
# preds.shape: (n_timesteps, 20484)
reward_value          = preds[:, reward_mask].mean(axis=1)
motivational_salience = preds[:, salience_mask].mean(axis=1)
self_referential_pull = preds[:, pcc_mask].mean(axis=1)
interoceptive_craving = preds[:, insula_mask].mean(axis=1)
face_engagement       = preds[:, face_mask].mean(axis=1)
social_signal         = preds[:, social_mask].mean(axis=1)
executive_control     = preds[:, control_mask].mean(axis=1)

# --- Collapse time: mean across all timesteps in this chunk ---
rv  = reward_value.mean()
ms  = motivational_salience.mean()
srp = self_referential_pull.mean()
ic  = interoceptive_craving.mean()
fe  = face_engagement.mean()
ss  = social_signal.mean()
ec  = executive_control.mean()

# --- Compute addictiveness score ---
reward_composite  = (rv + ms + srp + ic) / 4
salience_composite = (fe + ss) / 2
control_composite  = ec

SALIENCE_WEIGHT = 0.5  # tunable — salience contributes but less directly than reward
raw_score = (reward_composite + SALIENCE_WEIGHT * salience_composite) / (control_composite + 1e-6)

# --- Normalize against neutral baseline ---
# Run model.predict() once on neutral footage (slow nature video, no speech, no faces)
# Store as baseline_score. Then:
addictiveness_score = raw_score / baseline_score
# Score = 1.0 → average stimulation
# Score > 1.5 → elevated, consider soft nudge
# Score > 2.0 → high, strong session alert warranted
```

---

## 5. Session Update Logic (every 3 chunks)

```python
chunk_scores = []  # append addictiveness_score after each processed chunk

if len(chunk_scores) % 3 == 0 and len(chunk_scores) > 0:
    session_score  = np.mean(chunk_scores[-3:])
    is_escalating  = chunk_scores[-1] > chunk_scores[-3]  # trend upward?
    trigger_update(session_score, is_escalating)
```