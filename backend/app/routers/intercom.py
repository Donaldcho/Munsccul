import asyncio
import json
import logging
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from sqlalchemy.orm import Session
import redis.asyncio as redis
from datetime import datetime

from app.database import get_db
from app.models import IntercomMessage, IntercomEntityType
from app.config import settings
from app.schemas import IntercomMessageCreate, IntercomMessageOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/intercom", tags=["Intercom"])

class IntercomConnectionManager:
    def __init__(self):
        # Local state: user_id -> set of websockets
        # A user could have multiple tabs open
        self.active_connections: dict[int, set[WebSocket]] = {}
        # Redis connection
        self.redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        # Background task reference
        self.pubsub_task = None
        self.pubsub = self.redis_client.pubsub()
        self.lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)
        
        # Ensure we are subscribed to the user's specific channel and the broadcast channel
        # Start the background listener if it hasn't started yet
        async with self.lock:
            if not self.pubsub_task or self.pubsub_task.done():
                await self.pubsub.subscribe("intercom_broadcast")
                self.pubsub_task = asyncio.create_task(self.listen_redis())
            
            await self.pubsub.subscribe(f"intercom_{user_id}")

    def disconnect(self, websocket: WebSocket, user_id: int):
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def _send_to_local_websockets(self, user_id: int, message_data: dict):
        if user_id in self.active_connections:
            for connection in list(self.active_connections[user_id]):
                try:
                    await connection.send_json(message_data)
                except Exception as e:
                    logger.error(f"Error sending to WS user {user_id}: {e}")
                    self.active_connections[user_id].discard(connection)

    async def listen_redis(self):
        try:
            async for message in self.pubsub.listen():
                if message["type"] == "message":
                    channel = message["channel"]
                    data = json.loads(message["data"])
                    
                    if channel == "intercom_broadcast":
                        # Send to ALL local active connections
                        for uid in list(self.active_connections.keys()):
                            await self._send_to_local_websockets(uid, data)
                    elif channel.startswith("intercom_"):
                        user_id = int(channel.split("_")[1])
                        await self._send_to_local_websockets(user_id, data)
        except Exception as e:
            logger.error(f"Redis pubsub error: {e}")
            self.pubsub_task = None

    async def publish_message(self, message: IntercomMessageOut):
        # Convert to dict, handle datetime serialization
        msg_dict = message.dict()
        msg_dict['timestamp'] = msg_dict['timestamp'].isoformat()
        
        if msg_dict.get('receiver_id') is None:
            await self.redis_client.publish("intercom_broadcast", json.dumps(msg_dict))
        else:
            await self.redis_client.publish(f"intercom_{msg_dict['receiver_id']}", json.dumps(msg_dict))

    async def publish_raw(self, user_id: int, data: dict):
        """Publish raw JSON data to a specific user's channel"""
        await self.redis_client.publish(f"intercom_{user_id}", json.dumps(data))

manager = IntercomConnectionManager()

@router.websocket("/ws/{user_id}")
async def intercom_websocket(websocket: WebSocket, user_id: int):
    await manager.connect(websocket, user_id)
    try:
        while True:
            # Handle incoming messages from the frontend
            try:
                data = await websocket.receive_json()
                
                # Handle Voice Call Signaling
                if data.get("type") == "VOICE_SIGNAL":
                    receiver_id = data.get("receiver_id")
                    if receiver_id:
                        await manager.publish_raw(receiver_id, {
                            "type": "VOICE_SIGNAL",
                            "sender_id": user_id,
                            "signal": data.get("signal"),
                            "timestamp": datetime.utcnow().isoformat()
                        })
                
                # Keepalive/Ping
                elif data.get("type") == "PING":
                    await websocket.send_json({"type": "PONG", "timestamp": datetime.utcnow().isoformat()})

            except json.JSONDecodeError:
                # Ignore non-JSON messages (like simple keepalive strings)
                continue
            except Exception as e:
                logger.error(f"WS Message Error for user {user_id}: {e}")
                break
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)

@router.post("/send", response_model=IntercomMessageOut)
async def send_intercom_message(
    message: IntercomMessageCreate,
    current_user_id: int = Query(..., description="ID of the sender"),
    db: Session = Depends(get_db)
):
    """
    HTTP endpoint to send an intercom message.
    Ensures irreversible WORM storage to PostgreSQL before broadcasting via Redis.
    """
    # 1. Save to immutable database
    db_msg = IntercomMessage(
        sender_id=current_user_id,
        receiver_id=message.receiver_id,
        content=message.content,
        attached_entity_type=message.attached_entity_type,
        attached_entity_id=message.attached_entity_id,
        read_status=False
    )
    db.add(db_msg)
    db.commit()
    db.refresh(db_msg)
    
    out_msg = IntercomMessageOut.from_orm(db_msg)
    
    # 2. Publish to Redis for Subscribed WebSockets to pick up
    await manager.publish_message(out_msg)
    
    # Also publish back to sender's channel so their UI updates if they have multiple tabs
    await manager.redis_client.publish(f"intercom_{current_user_id}", json.dumps({
        **out_msg.dict(), 
        'timestamp': out_msg.timestamp.isoformat(),
        'is_echo': True
    }))
    
    return out_msg

@router.get("/history/{user_id}", response_model=list[IntercomMessageOut])
def get_message_history(
    user_id: int,
    db: Session = Depends(get_db),
    limit: int = 50
):
    """
    Get the last N messages involving the user (sent by or received by, or broadcasts)
    """
    messages = db.query(IntercomMessage).filter(
        (IntercomMessage.receiver_id == user_id) | 
        (IntercomMessage.sender_id == user_id) |
        (IntercomMessage.receiver_id == None)  # Broadcasts
    ).order_by(IntercomMessage.timestamp.desc()).limit(limit).all()
    
    # Return chronologically
    return messages[::-1]
