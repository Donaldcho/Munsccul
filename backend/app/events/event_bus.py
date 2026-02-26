"""
Event Bus System - Fineract-style Event Sourcing
Enables external integrations like MTN/Orange MoMo, SMS gateways, etc.
"""
from enum import Enum
from typing import Dict, Any, List, Callable, Optional
from datetime import datetime
from dataclasses import dataclass, asdict
import json
import asyncio
import aiohttp
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app import models


class EventType(str, Enum):
    """System event types - Fineract-compatible"""
    # Client/Member Events
    CLIENT_CREATED = "client.created"
    CLIENT_UPDATED = "client.updated"
    CLIENT_ACTIVATED = "client.activated"
    CLIENT_CLOSED = "client.closed"
    
    # Account Events
    ACCOUNT_CREATED = "account.created"
    ACCOUNT_UPDATED = "account.updated"
    ACCOUNT_ACTIVATED = "account.activated"
    ACCOUNT_CLOSED = "account.closed"
    
    # Transaction Events
    DEPOSIT_CREATED = "deposit.created"
    WITHDRAWAL_CREATED = "withdrawal.created"
    TRANSFER_CREATED = "transfer.created"
    
    # Loan Events
    LOAN_CREATED = "loan.created"
    LOAN_APPROVED = "loan.approved"
    LOAN_REJECTED = "loan.rejected"
    LOAN_DISBURSED = "loan.disbursed"
    LOAN_REPAYMENT = "loan.repayment"
    LOAN_CLOSED = "loan.closed"
    LOAN_WRITTEN_OFF = "loan.written_off"
    
    # Repayment Events
    REPAYMENT_DUE = "repayment.due"
    REPAYMENT_OVERDUE = "repayment.overdue"
    
    # Savings Events
    SAVINGS_DEPOSIT = "savings.deposit"
    SAVINGS_WITHDRAWAL = "savings.withdrawal"
    INTEREST_POSTED = "savings.interest_posted"
    
    # Charge Events
    CHARGE_APPLIED = "charge.applied"
    CHARGE_PAID = "charge.paid"
    PENALTY_APPLIED = "penalty.applied"
    # Fraud Events
    FRAUD_ALERT_TRIGGERED = "fraud.alert.triggered"
    
    # System Events
    USER_LOGIN = "user.login"
    USER_LOGOUT = "user.logout"
    PASSWORD_CHANGED = "user.password_changed"


@dataclass
class DomainEvent:
    """Base domain event - Fineract-style event sourcing"""
    event_type: EventType
    entity_type: str
    entity_id: str
    payload: Dict[str, Any]
    tenant_id: Optional[str] = None
    user_id: Optional[int] = None
    timestamp: datetime = None
    event_id: str = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow()
        if self.event_id is None:
            import uuid
            self.event_id = str(uuid.uuid4())
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_id": self.event_id,
            "event_type": self.event_type.value,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "payload": self.payload,
            "tenant_id": self.tenant_id,
            "user_id": self.user_id,
            "timestamp": self.timestamp.isoformat()
        }
    
    def to_json(self) -> str:
        return json.dumps(self.to_dict(), default=str)


class EventStore:
    """
    Event Store - Persists all domain events
    Implements event sourcing pattern from Fineract
    """
    
    @staticmethod
    def persist_event(event: DomainEvent, db: Session):
        """Persist event to database"""
        event_record = models.EventStore(
            event_id=event.event_id,
            event_type=event.event_type.value,
            entity_type=event.entity_type,
            entity_id=event.entity_id,
            payload=event.to_json(),
            tenant_id=event.tenant_id,
            user_id=event.user_id,
            created_at=event.timestamp
        )
        db.add(event_record)
        db.commit()
        return event_record
    
    @staticmethod
    def get_events(
        db: Session,
        entity_type: Optional[str] = None,
        entity_id: Optional[str] = None,
        event_type: Optional[EventType] = None,
        since: Optional[datetime] = None,
        limit: int = 100
    ) -> List[models.EventStore]:
        """Retrieve events with filtering"""
        query = db.query(models.EventStore)
        
        if entity_type:
            query = query.filter(models.EventStore.entity_type == entity_type)
        if entity_id:
            query = query.filter(models.EventStore.entity_id == entity_id)
        if event_type:
            query = query.filter(models.EventStore.event_type == event_type.value)
        if since:
            query = query.filter(models.EventStore.created_at >= since)
        
        return query.order_by(models.EventStore.created_at.desc()).limit(limit).all()
    
    @staticmethod
    def replay_events(
        db: Session,
        entity_type: str,
        entity_id: str
    ) -> List[DomainEvent]:
        """Replay all events for an entity to reconstruct state"""
        events = db.query(models.EventStore).filter(
            models.EventStore.entity_type == entity_type,
            models.EventStore.entity_id == entity_id
        ).order_by(models.EventStore.created_at.asc()).all()
        
        return [
            DomainEvent(
                event_type=EventType(e.event_type),
                entity_type=e.entity_type,
                entity_id=e.entity_id,
                payload=json.loads(e.payload),
                tenant_id=e.tenant_id,
                user_id=e.user_id,
                timestamp=e.created_at,
                event_id=e.event_id
            )
            for e in events
        ]


class WebhookManager:
    """
    Webhook Manager - Handles external integrations
    Supports MTN/Orange MoMo, SMS gateways, etc.
    """
    
    def __init__(self):
        self._session: Optional[aiohttp.ClientSession] = None
    
    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create aiohttp session"""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=30),
                headers={"Content-Type": "application/json"}
            )
        return self._session
    
    async def dispatch_webhook(
        self,
        webhook: models.Webhook,
        event: DomainEvent
    ) -> bool:
        """
        Dispatch event to webhook endpoint
        Returns True if successful
        """
        try:
            session = await self._get_session()
            
            # Prepare payload
            payload = event.to_dict()
            
            # Add webhook-specific data
            payload["webhook_id"] = webhook.id
            payload["webhook_name"] = webhook.name
            
            # Prepare headers
            headers = {"Content-Type": "application/json"}
            if webhook.secret:
                # Add HMAC signature for verification
                import hmac
                signature = hmac.new(
                    webhook.secret.encode(),
                    json.dumps(payload, default=str).encode(),
                    "sha256"
                ).hexdigest()
                headers["X-Webhook-Signature"] = f"sha256={signature}"
            
            async with session.post(
                webhook.url,
                json=payload,
                headers=headers
            ) as response:
                success = 200 <= response.status < 300
                
                # Log attempt
                await self._log_attempt(webhook, event, response.status, success)
                
                return success
                
        except Exception as e:
            await self._log_attempt(webhook, event, 0, False, str(e))
            return False
    
    async def _log_attempt(
        self,
        webhook: models.Webhook,
        event: DomainEvent,
        status_code: int,
        success: bool,
        error: Optional[str] = None
    ):
        """Log webhook attempt"""
        db = SessionLocal()
        try:
            attempt = models.WebhookLog(
                webhook_id=webhook.id,
                event_id=event.event_id,
                event_type=event.event_type.value,
                payload=event.to_json(),
                response_status=status_code,
                success=success,
                error_message=error,
                created_at=datetime.utcnow()
            )
            db.add(attempt)
            db.commit()
        finally:
            db.close()
    
    async def close(self):
        """Close session"""
        if self._session and not self._session.closed:
            await self._session.close()


class EventBus:
    """
    Event Bus - Central event distribution system
    Fineract-style event handling with hooks
    """
    
    def __init__(self):
        self._subscribers: Dict[EventType, List[Callable]] = {}
        self._webhook_manager = WebhookManager()
        self._event_store = EventStore()
    
    def subscribe(self, event_type: EventType, handler: Callable):
        """Subscribe to an event type"""
        if event_type not in self._subscribers:
            self._subscribers[event_type] = []
        self._subscribers[event_type].append(handler)
    
    def unsubscribe(self, event_type: EventType, handler: Callable):
        """Unsubscribe from an event type"""
        if event_type in self._subscribers:
            self._subscribers[event_type] = [
                h for h in self._subscribers[event_type] if h != handler
            ]
    
    async def publish(self, event: DomainEvent, db: Session):
        """
        Publish event to all subscribers and webhooks
        """
        # 1. Persist event (event sourcing)
        self._event_store.persist_event(event, db)
        
        # 2. Notify local subscribers
        handlers = self._subscribers.get(event.event_type, [])
        for handler in handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    await handler(event)
                else:
                    handler(event)
            except Exception as e:
                # Log but don't stop other handlers
                print(f"Event handler error: {e}")
        
        # 3. Dispatch to webhooks
        webhooks = db.query(models.Webhook).filter(
            models.Webhook.is_active == True,
            models.Webhook.event_types.contains([event.event_type.value])
        ).all()
        
        for webhook in webhooks:
            await self._webhook_manager.dispatch_webhook(webhook, event)
    
    async def close(self):
        """Cleanup"""
        await self._webhook_manager.close()


# Global event bus instance
event_bus = EventBus()


# Convenience functions for publishing events
async def publish_event(
    event_type: EventType,
    entity_type: str,
    entity_id: str,
    payload: Dict[str, Any],
    user_id: Optional[int] = None,
    tenant_id: Optional[str] = None,
    db: Optional[Session] = None
):
    """Convenience function to publish an event"""
    event = DomainEvent(
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        payload=payload,
        user_id=user_id,
        tenant_id=tenant_id
    )
    
    if db is None:
        db = SessionLocal()
        try:
            await event_bus.publish(event, db)
        finally:
            db.close()
    else:
        await event_bus.publish(event, db)
    
    return event


# Pre-built event publishers for common scenarios
async def publish_transaction_event(
    transaction_type: str,
    transaction_id: str,
    account_id: int,
    amount: float,
    user_id: int,
    db: Session
):
    """Publish transaction event"""
    event_type_map = {
        "deposit": EventType.DEPOSIT_CREATED,
        "withdrawal": EventType.WITHDRAWAL_CREATED,
        "transfer": EventType.TRANSFER_CREATED
    }
    
    await publish_event(
        event_type=event_type_map.get(transaction_type, EventType.DEPOSIT_CREATED),
        entity_type="Transaction",
        entity_id=transaction_id,
        payload={
            "transaction_type": transaction_type,
            "account_id": account_id,
            "amount": amount
        },
        user_id=user_id,
        db=db
    )


async def publish_loan_event(
    event_type: EventType,
    loan_id: str,
    member_id: int,
    amount: Optional[float] = None,
    user_id: Optional[int] = None,
    db: Optional[Session] = None
):
    """Publish loan event"""
    payload = {
        "loan_id": loan_id,
        "member_id": member_id
    }
    if amount:
        payload["amount"] = amount
    
    await publish_event(
        event_type=event_type,
        entity_type="Loan",
        entity_id=loan_id,
        payload=payload,
        user_id=user_id,
        db=db
    )