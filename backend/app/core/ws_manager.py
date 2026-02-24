"""WebSocket Connection Manager for real-time shopping list sync."""

import logging
import uuid
from dataclasses import dataclass, field

from starlette.websockets import WebSocket, WebSocketState

logger = logging.getLogger(__name__)


@dataclass
class ConnectionEntry:
    ws: WebSocket
    user_id: int
    family_id: int


class ConnectionManager:
    def __init__(self):
        # {list_id: {conn_id: ConnectionEntry}}
        self._lists: dict[int, dict[str, ConnectionEntry]] = {}

    def connect(self, list_id: int, ws: WebSocket, user_id: int, family_id: int) -> str:
        conn_id = uuid.uuid4().hex
        if list_id not in self._lists:
            self._lists[list_id] = {}
        self._lists[list_id][conn_id] = ConnectionEntry(ws=ws, user_id=user_id, family_id=family_id)
        logger.info("WS connect: user=%s list=%s conn=%s (total=%s)", user_id, list_id, conn_id, len(self._lists[list_id]))
        return conn_id

    def disconnect(self, list_id: int, conn_id: str):
        conns = self._lists.get(list_id)
        if conns and conn_id in conns:
            del conns[conn_id]
            if not conns:
                del self._lists[list_id]
            logger.info("WS disconnect: list=%s conn=%s", list_id, conn_id)

    async def broadcast(self, list_id: int, event: dict, exclude_conn_id: str | None = None):
        conns = self._lists.get(list_id)
        if not conns:
            return
        dead = []
        for conn_id, entry in conns.items():
            if conn_id == exclude_conn_id:
                continue
            try:
                if entry.ws.client_state == WebSocketState.CONNECTED:
                    await entry.ws.send_json(event)
            except Exception:
                dead.append(conn_id)
        for conn_id in dead:
            del conns[conn_id]
        if not conns and list_id in self._lists:
            del self._lists[list_id]

    async def broadcast_to_family(self, family_id: int, event: dict):
        dead_by_list: dict[int, list[str]] = {}
        for list_id, conns in self._lists.items():
            for conn_id, entry in conns.items():
                if entry.family_id != family_id:
                    continue
                try:
                    if entry.ws.client_state == WebSocketState.CONNECTED:
                        await entry.ws.send_json(event)
                except Exception:
                    dead_by_list.setdefault(list_id, []).append(conn_id)
        for list_id, dead_ids in dead_by_list.items():
            conns = self._lists.get(list_id)
            if conns:
                for conn_id in dead_ids:
                    conns.pop(conn_id, None)
                if not conns:
                    del self._lists[list_id]


manager = ConnectionManager()
