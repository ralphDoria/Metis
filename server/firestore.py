"""Firestore persistence for Metaware sessions.

Initializes the Firebase Admin SDK lazily so missing creds during local-only
work don't crash the server. Resolution order for credentials:

1. METAWARE_FIREBASE_CREDENTIALS env var → path to service account JSON
2. GOOGLE_APPLICATION_CREDENTIALS env var (standard Google ADC)
3. server/.secrets/firebase-admin.json (default committed-out path)

Collection layout:
    users/{user_id}/sessions/{session_id}

Each session doc holds parsed feedback + metadata. The default user_id is
``test-user`` until auth is wired up.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import firebase_admin
from firebase_admin import credentials, firestore

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_KEY_PATH = REPO_ROOT / "server" / ".secrets" / "firebase-admin.json"
DEFAULT_USER_ID = "test-user"

_app: firebase_admin.App | None = None
_client: Any = None


def _resolve_credential_path() -> Path | None:
    for env_var in ("METAWARE_FIREBASE_CREDENTIALS", "GOOGLE_APPLICATION_CREDENTIALS"):
        val = os.environ.get(env_var)
        if val:
            p = Path(val).expanduser()
            if p.is_file():
                return p
    if DEFAULT_KEY_PATH.is_file():
        return DEFAULT_KEY_PATH
    return None


def _get_client():
    global _app, _client
    if _client is not None:
        return _client

    key_path = _resolve_credential_path()
    if key_path is None:
        raise RuntimeError(
            "No Firebase credentials found. Place service account JSON at "
            f"{DEFAULT_KEY_PATH} or set METAWARE_FIREBASE_CREDENTIALS."
        )

    if not firebase_admin._apps:
        cred = credentials.Certificate(str(key_path))
        _app = firebase_admin.initialize_app(cred)
    else:
        _app = firebase_admin.get_app()

    _client = firestore.client(app=_app)
    return _client


def is_configured() -> bool:
    """True iff a Firebase credential is reachable on disk."""
    return _resolve_credential_path() is not None


def save_session(
    *,
    parsed: dict,
    brain: dict,
    video_filename: str | None,
    video_size_bytes: int | None,
    user_id: str = DEFAULT_USER_ID,
) -> str:
    """Persist a session and return the new doc id.

    `parsed` is the output of `parse_preds` (feedback + minute counts).
    `brain` is the asset URL bundle returned to the frontend.
    """
    db = _get_client()
    doc_ref = db.collection("users").document(user_id).collection("sessions").document()
    payload = {
        "user_id": user_id,
        "created_at": datetime.now(timezone.utc),
        "video_filename": video_filename,
        "video_size_bytes": video_size_bytes,
        "feedback": parsed.get("feedback"),
        "high_activation_minutes": parsed.get("high_activation_minutes"),
        "total_minutes": parsed.get("total_minutes"),
        "brain": brain,
    }
    doc_ref.set(payload)
    return doc_ref.id


def list_sessions(user_id: str = DEFAULT_USER_ID, limit: int = 50) -> list[dict]:
    db = _get_client()
    query = (
        db.collection("users")
        .document(user_id)
        .collection("sessions")
        .order_by("created_at", direction=firestore.Query.DESCENDING)
        .limit(limit)
    )
    out = []
    for snap in query.stream():
        doc = snap.to_dict() or {}
        doc["id"] = snap.id
        created = doc.get("created_at")
        if hasattr(created, "isoformat"):
            doc["created_at"] = created.isoformat()
        out.append(doc)
    return out


def get_session(session_id: str, user_id: str = DEFAULT_USER_ID) -> dict | None:
    db = _get_client()
    snap = (
        db.collection("users")
        .document(user_id)
        .collection("sessions")
        .document(session_id)
        .get()
    )
    if not snap.exists:
        return None
    doc = snap.to_dict() or {}
    doc["id"] = snap.id
    created = doc.get("created_at")
    if hasattr(created, "isoformat"):
        doc["created_at"] = created.isoformat()
    return doc
