from typing import Dict, Set
from fastapi import WebSocket
import logging

logger = logging.getLogger(__name__)

class ConnectionManager:
    """
    Manages WebSocket connections partitioned by branch_id.
    Ensures that manager alerts and queue updates only reach relevant personnel.
    """
    def __init__(self):
        # branch_id -> set of active websockets
        self.active_connections: Dict[int, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, branch_id: int):
        await websocket.accept()
        if branch_id not in self.active_connections:
            self.active_connections[branch_id] = set()
        self.active_connections[branch_id].add(websocket)
        logger.info(f"New WS connection to branch {branch_id}.")

    def disconnect(self, websocket: WebSocket, branch_id: int):
        if branch_id in self.active_connections:
            self.active_connections[branch_id].discard(websocket)
            if not self.active_connections[branch_id]:
                del self.active_connections[branch_id]
        logger.info(f"WS disconnected from branch {branch_id}")

    async def broadcast_to_branch(self, branch_id: int, message: dict):
        if branch_id in self.active_connections:
            # Create a copy for safe iteration
            connections = list(self.active_connections[branch_id])
            for connection in connections:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.error(f"Error sending WS message: {e}")
                    self.active_connections[branch_id].discard(connection)

# Singleton manager for the entire application
ws_manager = ConnectionManager()
