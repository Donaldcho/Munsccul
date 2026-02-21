"""
Webhooks Router - Manage external integrations
Supports MTN/Orange MoMo, SMS gateways, etc.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user, require_admin
from app.audit import AuditLogger
from app.security.permissions import require_permission, Permission
from app import models, schemas

router = APIRouter(prefix="/webhooks", tags=["Webhooks & Integrations"])


@router.get("", response_model=List[dict])
async def list_webhooks(
    is_active: Optional[bool] = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all configured webhooks"""
    query = db.query(models.Webhook)
    
    if is_active is not None:
        query = query.filter(models.Webhook.is_active == is_active)
    
    webhooks = query.all()
    
    return [
        {
            "id": w.id,
            "name": w.name,
            "url": w.url,
            "event_types": w.event_types,
            "is_active": w.is_active,
            "max_retries": w.max_retries,
            "created_at": w.created_at
        }
        for w in webhooks
    ]


@router.post("", response_model=dict)
async def create_webhook(
    request: Request,
    name: str,
    url: str,
    event_types: List[str],
    secret: Optional[str] = None,
    max_retries: int = 3,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Create a new webhook for external integration
    
    Example event types:
    - client.created
    - deposit.created
    - withdrawal.created
    - loan.disbursed
    """
    import json
    
    webhook = models.Webhook(
        name=name,
        url=url,
        event_types=json.dumps(event_types),
        secret=secret,
        max_retries=max_retries,
        created_by=current_user.id
    )
    
    db.add(webhook)
    db.commit()
    db.refresh(webhook)
    
    # Log creation
    audit = AuditLogger(db, current_user, request)
    audit.log_create(
        entity_type="Webhook",
        entity_id=str(webhook.id),
        new_values={
            "name": name,
            "url": url,
            "event_types": event_types
        }
    )
    
    return {
        "id": webhook.id,
        "name": webhook.name,
        "url": webhook.url,
        "event_types": event_types,
        "is_active": webhook.is_active,
        "message": "Webhook created successfully"
    }


@router.put("/{webhook_id}", response_model=dict)
async def update_webhook(
    request: Request,
    webhook_id: int,
    name: Optional[str] = None,
    url: Optional[str] = None,
    event_types: Optional[List[str]] = None,
    is_active: Optional[bool] = None,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Update webhook configuration"""
    import json
    
    webhook = db.query(models.Webhook).filter(models.Webhook.id == webhook_id).first()
    
    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found"
        )
    
    old_values = {
        "name": webhook.name,
        "url": webhook.url,
        "event_types": webhook.event_types,
        "is_active": webhook.is_active
    }
    
    if name:
        webhook.name = name
    if url:
        webhook.url = url
    if event_types:
        webhook.event_types = json.dumps(event_types)
    if is_active is not None:
        webhook.is_active = is_active
    
    db.commit()
    db.refresh(webhook)
    
    # Log update
    audit = AuditLogger(db, current_user, request)
    audit.log_update(
        entity_type="Webhook",
        entity_id=str(webhook.id),
        old_values=old_values,
        new_values={
            "name": webhook.name,
            "url": webhook.url,
            "event_types": webhook.event_types,
            "is_active": webhook.is_active
        }
    )
    
    return {
        "id": webhook.id,
        "name": webhook.name,
        "message": "Webhook updated successfully"
    }


@router.delete("/{webhook_id}")
async def delete_webhook(
    request: Request,
    webhook_id: int,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Delete a webhook"""
    webhook = db.query(models.Webhook).filter(models.Webhook.id == webhook_id).first()
    
    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found"
        )
    
    db.delete(webhook)
    db.commit()
    
    # Log deletion
    audit = AuditLogger(db, current_user, request)
    audit.log_delete(
        entity_type="Webhook",
        entity_id=str(webhook_id),
        old_values={"name": webhook.name, "url": webhook.url}
    )
    
    return {"message": "Webhook deleted successfully"}


@router.get("/{webhook_id}/logs", response_model=List[dict])
async def get_webhook_logs(
    webhook_id: int,
    limit: int = 50,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get delivery logs for a webhook"""
    logs = db.query(models.WebhookLog).filter(
        models.WebhookLog.webhook_id == webhook_id
    ).order_by(models.WebhookLog.created_at.desc()).limit(limit).all()
    
    return [
        {
            "id": log.id,
            "event_type": log.event_type,
            "success": log.success,
            "response_status": log.response_status,
            "error_message": log.error_message,
            "created_at": log.created_at
        }
        for log in logs
    ]


@router.get("/{webhook_id}/stats")
async def get_webhook_stats(
    webhook_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get webhook delivery statistics"""
    from sqlalchemy import func
    
    total = db.query(models.WebhookLog).filter(
        models.WebhookLog.webhook_id == webhook_id
    ).count()
    
    successful = db.query(models.WebhookLog).filter(
        models.WebhookLog.webhook_id == webhook_id,
        models.WebhookLog.success == True
    ).count()
    
    failed = db.query(models.WebhookLog).filter(
        models.WebhookLog.webhook_id == webhook_id,
        models.WebhookLog.success == False
    ).count()
    
    return {
        "webhook_id": webhook_id,
        "total_deliveries": total,
        "successful": successful,
        "failed": failed,
        "success_rate": (successful / total * 100) if total > 0 else 0
    }