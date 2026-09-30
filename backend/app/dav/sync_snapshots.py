"""Incremental sync for Tribu's DAV collections (RFC 6578 sync-collection).

Tribu's data changes through the API, through DAV and indirectly (a member
renamed shows up in every event's attendees), so instead of journaling every
write path a sync token names a snapshot: the href and ETag of every resource
the collection served when the token was handed out. The changes since then
are the hrefs whose ETag differs, the new ones and the ones that are gone;
Radicale reports the gone ones as 404, which tells the client to delete them.

A token that is unknown or too old raises ``ValueError``, which Radicale
answers with ``valid-sync-token`` so the client falls back to a full sync.
"""

from __future__ import annotations

import hashlib
import json
from typing import Mapping

from sqlalchemy.exc import IntegrityError

from app.core.utils import utcnow
from app.database import SessionLocal
from app.models import DavSyncSnapshot

SYNC_TOKEN_PREFIX = "http://radicale.org/ns/sync/"

# Snapshots kept per collection. A client that last synced before the
# oldest one does one full sync again.
KEEP_SNAPSHOTS = 25


def sync_changes(collection_key: str, state: Mapping[str, str], old_token: str = "") -> tuple[str, list[str]]:
    """The current token and the hrefs a client holding ``old_token`` must fetch.

    ``state`` maps every href the collection serves now to its ETag.
    """
    encoded = json.dumps(sorted(state.items()), separators=(",", ":"))
    digest = hashlib.sha256(f"{collection_key}\n{encoded}".encode("utf-8")).hexdigest()
    token = SYNC_TOKEN_PREFIX + digest

    with SessionLocal() as db:
        _remember(db, collection_key, digest, encoded)
        if not old_token:
            return token, list(state)
        if not old_token.startswith(SYNC_TOKEN_PREFIX):
            raise ValueError("Unknown sync token")
        old_digest = old_token[len(SYNC_TOKEN_PREFIX):]
        if old_digest == digest:
            return token, []
        previous = (
            db.query(DavSyncSnapshot.state)
            .filter(
                DavSyncSnapshot.collection_key == collection_key,
                DavSyncSnapshot.token == old_digest,
            )
            .scalar()
        )
    if previous is None:
        raise ValueError("Sync token is unknown or expired")
    old_state = dict(json.loads(previous))
    changed = [href for href, etag in state.items() if old_state.get(href) != etag]
    gone = [href for href in old_state if href not in state]
    return token, changed + gone


def _remember(db, collection_key: str, digest: str, encoded: str) -> None:
    exists = (
        db.query(DavSyncSnapshot.id)
        .filter(DavSyncSnapshot.collection_key == collection_key, DavSyncSnapshot.token == digest)
        .first()
    )
    if exists is not None:
        return
    db.add(DavSyncSnapshot(collection_key=collection_key, token=digest, state=encoded, created_at=utcnow()))
    try:
        db.commit()
    except IntegrityError:
        # A parallel sync stored the same snapshot first.
        db.rollback()
        return
    stale = [
        row.id
        for row in db.query(DavSyncSnapshot.id)
        .filter(DavSyncSnapshot.collection_key == collection_key)
        .order_by(DavSyncSnapshot.created_at.desc(), DavSyncSnapshot.id.desc())
        .offset(KEEP_SNAPSHOTS)
        .all()
    ]
    if stale:
        db.query(DavSyncSnapshot).filter(DavSyncSnapshot.id.in_(stale)).delete(synchronize_session=False)
        db.commit()
