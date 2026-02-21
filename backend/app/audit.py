"""
Audit Logging System - COBAC Compliance
Implements immutable audit trail for all system actions
"""
import json
from datetime import datetime
from sqlalchemy.orm import Session
from fastapi import Request
from app import models
from typing import Optional, Any, Dict


def log_action(
    db: Session,
    user_id: Optional[int],
    username: str,
    ip_address: str,
    action: str,
    entity_type: str,
    entity_id: Optional[str] = None,
    old_values: Optional[Dict[str, Any]] = None,
    new_values: Optional[Dict[str, Any]] = None,
    description: Optional[str] = None
) -> models.AuditLog:
    """
    Log an action to the immutable audit trail
    
    Args:
        db: Database session
        user_id: ID of the user performing the action
        username: Username of the user
        ip_address: IP address of the request
        action: Type of action (CREATE, UPDATE, DELETE, VIEW, LOGIN, etc.)
        entity_type: Type of entity affected (Member, Account, Transaction, etc.)
        entity_id: ID of the entity affected
        old_values: Previous values (for updates)
        new_values: New values (for creates/updates)
        description: Human-readable description
    
    Returns:
        The created AuditLog entry
    """
    audit_entry = models.AuditLog(
        user_id=user_id,
        username=username,
        ip_address=ip_address,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id else None,
        old_values=json.dumps(old_values) if old_values else None,
        new_values=json.dumps(new_values) if new_values else None,
        description=description
    )
    
    db.add(audit_entry)
    db.commit()
    db.refresh(audit_entry)
    
    return audit_entry


def get_client_ip(request: Request) -> str:
    """Extract client IP address from request"""
    # Check for forwarded IP (if behind proxy)
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    
    # Check for real IP header
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    
    # Fall back to direct connection
    if request.client:
        return request.client.host
    
    return "unknown"


class AuditLogger:
    """Helper class for audit logging in API endpoints"""
    
    def __init__(self, db: Session, current_user: models.User, request: Request):
        self.db = db
        self.current_user = current_user
        self.request = request
        self.ip_address = get_client_ip(request)
    
    def log(
        self,
        action: str,
        entity_type: str,
        entity_id: Optional[str] = None,
        old_values: Optional[Dict[str, Any]] = None,
        new_values: Optional[Dict[str, Any]] = None,
        description: Optional[str] = None
    ) -> models.AuditLog:
        """Log an action"""
        return log_action(
            db=self.db,
            user_id=self.current_user.id if self.current_user else None,
            username=self.current_user.username if self.current_user else "system",
            ip_address=self.ip_address,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            old_values=old_values,
            new_values=new_values,
            description=description
        )
    
    def log_create(self, entity_type: str, entity_id: str, new_values: Dict[str, Any], description: Optional[str] = None):
        """Log a create action"""
        return self.log(
            action="CREATE",
            entity_type=entity_type,
            entity_id=entity_id,
            new_values=new_values,
            description=description or f"Created {entity_type} {entity_id}"
        )
    
    def log_update(self, entity_type: str, entity_id: str, old_values: Dict[str, Any], new_values: Dict[str, Any], description: Optional[str] = None):
        """Log an update action"""
        return self.log(
            action="UPDATE",
            entity_type=entity_type,
            entity_id=entity_id,
            old_values=old_values,
            new_values=new_values,
            description=description or f"Updated {entity_type} {entity_id}"
        )
    
    def log_delete(self, entity_type: str, entity_id: str, old_values: Dict[str, Any], description: Optional[str] = None):
        """Log a delete action"""
        return self.log(
            action="DELETE",
            entity_type=entity_type,
            entity_id=entity_id,
            old_values=old_values,
            description=description or f"Deleted {entity_type} {entity_id}"
        )
    
    def log_view(self, entity_type: str, entity_id: str, description: Optional[str] = None):
        """Log a view action"""
        return self.log(
            action="VIEW",
            entity_type=entity_type,
            entity_id=entity_id,
            description=description or f"Viewed {entity_type} {entity_id}"
        )
    
    def log_login(self, success: bool = True):
        """Log a login attempt"""
        return self.log(
            action="LOGIN_SUCCESS" if success else "LOGIN_FAILURE",
            entity_type="User",
            entity_id=str(self.current_user.id) if self.current_user else None,
            description=f"Login {'successful' if success else 'failed'} for {self.current_user.username if self.current_user else 'unknown'}"
        )
    
    def log_transaction(self, transaction_type: str, transaction_id: str, amount: float, account_id: str, description: Optional[str] = None):
        """Log a financial transaction"""
        return self.log(
            action=f"TRANSACTION_{transaction_type.upper()}",
            entity_type="Transaction",
            entity_id=transaction_id,
            new_values={
                "transaction_type": transaction_type,
                "amount": amount,
                "account_id": account_id
            },
            description=description or f"{transaction_type} of {amount} on account {account_id}"
        )
    
    def log_approval(self, entity_type: str, entity_id: str, approved: bool, reason: Optional[str] = None):
        """Log an approval action"""
        return self.log(
            action="APPROVE" if approved else "REJECT",
            entity_type=entity_type,
            entity_id=entity_id,
            new_values={
                "approved": approved,
                "reason": reason
            },
            description=f"{'Approved' if approved else 'Rejected'} {entity_type} {entity_id}"
        )


def query_audit_logs(
    db: Session,
    user_id: Optional[int] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    action: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    skip: int = 0,
    limit: int = 100
):
    """Query audit logs with filters"""
    query = db.query(models.AuditLog)
    
    if user_id:
        query = query.filter(models.AuditLog.user_id == user_id)
    
    if entity_type:
        query = query.filter(models.AuditLog.entity_type == entity_type)
    
    if entity_id:
        query = query.filter(models.AuditLog.entity_id == entity_id)
    
    if action:
        query = query.filter(models.AuditLog.action == action)
    
    if start_date:
        query = query.filter(models.AuditLog.created_at >= start_date)
    
    if end_date:
        query = query.filter(models.AuditLog.created_at <= end_date)
    
    # Order by most recent first
    query = query.order_by(models.AuditLog.created_at.desc())
    
    total = query.count()
    logs = query.offset(skip).limit(limit).all()
    
    return logs, total