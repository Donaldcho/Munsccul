from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
import asyncio
import json
from app.database import get_db, SessionLocal
from app.models import OfflineQueue, SyncStatus

router = APIRouter(prefix="/admin/monitor", tags=["Admin Sync Monitor"])

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                pass 

manager = ConnectionManager()

def get_branch_sync_stats(db: Session):
    """
    Queries the database to find how many transactions are stuck in PENDING status per branch.
    """
    stats = db.query(
        OfflineQueue.branch_id,
        func.count(OfflineQueue.id).label("pending_count")
    ).filter(
        OfflineQueue.status == SyncStatus.PENDING
    ).group_by(
        OfflineQueue.branch_id
    ).all()
    
    return [{"branch_id": row.branch_id, "pending_count": row.pending_count} for row in stats]

@router.websocket("/ws/sync-status")
async def websocket_sync_status(websocket: WebSocket):
    """
    WebSocket endpoint for the Admin Dashboard.
    Pushes real-time queue lengths to the IT Admin every 5 seconds.
    """
    await manager.connect(websocket)
    db = SessionLocal() # Use a fresh session for the loop
    try:
        while True:
            # 1. Fetch current sync backlog
            stats = get_branch_sync_stats(db)
            
            # 2. Build the payload
            payload = {
                "type": "SYNC_UPDATE",
                "timestamp": asyncio.get_event_loop().time(),
                "data": stats
            }
            
            # 3. Send to this specific client
            await websocket.send_text(json.dumps(payload))
            
            # 4. Refresh DB session to get latest data
            db.close()
            db = SessionLocal()
            
            # 5. Sleep for 5 seconds
            await asyncio.sleep(5)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    finally:
        db.close()
        manager.disconnect(websocket)
