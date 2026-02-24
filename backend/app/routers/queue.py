from typing import List, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
import json

from app.database import get_db
from app.auth import get_current_user, require_role
from app import models, schemas
from app.websocket_manager import ws_manager

router = APIRouter(prefix="/queue", tags=["Queue Management"])

# WebSocket manager is now imported from app.websocket_manager

async def broadcast_queue_state(db: Session, branch_id: int):
    """Broadast the current waiting queue for a specific branch"""
    waiting_tickets = db.query(models.QueueTicket).filter(
        models.QueueTicket.branch_id == branch_id,
        models.QueueTicket.status == models.QueueStatus.WAITING
    ).order_by(models.QueueTicket.issued_at).all()
    
    await ws_manager.broadcast_to_branch(branch_id, {
        "type": "QUEUE_UPDATE",
        "branch_id": branch_id,
        "waiting": [{
            "ticket_number": t.ticket_number,
            "service": t.service_type.value,
            "is_vip": t.is_vip
        } for t in waiting_tickets]
    })


@router.post("/issue", response_model=schemas.QueueTicketResponse)
async def issue_ticket(
    ticket_in: schemas.QueueTicketCreate,
    db: Session = Depends(get_db)
):
    """
    Issue a new ticket (used by Kiosk).
    Determines next prefix and number based on service type.
    """
    # 1. Get current count for today's prefix
    prefix = ticket_in.service_type.value[0].upper() # C, S, L
    if ticket_in.is_vip:
        prefix = "V"
        
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    
    count = db.query(models.QueueTicket).filter(
        models.QueueTicket.branch_id == ticket_in.branch_id,
        models.QueueTicket.ticket_number.like(f"{prefix}-%"),
        models.QueueTicket.issued_at >= today_start
    ).count()
    
    next_number = count + 1
    ticket_number = f"{prefix}-{next_number:03d}"
    
    new_ticket = models.QueueTicket(
        ticket_number=ticket_number,
        service_type=ticket_in.service_type,
        status=models.QueueStatus.WAITING,
        is_vip=ticket_in.is_vip,
        branch_id=ticket_in.branch_id
    )
    
    db.add(new_ticket)
    db.commit()
    db.refresh(new_ticket)
    
    # Broadcast updated queue state
    await broadcast_queue_state(db, ticket_in.branch_id)
    
    return new_ticket

@router.post("/call-next", response_model=schemas.QueueTicketResponse)
async def call_next(
    call_req: schemas.QueueCallNextRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Teller requests the next ticket based on service type.
    Enforces FIFO + VIP Priority.
    """
    # 1. Find the next WAITING ticket
    # Priority: VIP first, then FIFO
    query = db.query(models.QueueTicket).filter(
        models.QueueTicket.branch_id == current_user.branch_id,
        models.QueueTicket.status == models.QueueStatus.WAITING,
        models.QueueTicket.service_type == call_req.service_type
    )
    
    # Check if there are any VIPs first
    vip_ticket = query.filter(models.QueueTicket.is_vip == True).order_by(models.QueueTicket.issued_at).first()
    
    if vip_ticket:
        ticket = vip_ticket
    else:
        ticket = query.order_by(models.QueueTicket.issued_at).first()
        
    if not ticket:
        raise HTTPException(status_code=404, detail="No members waiting for this service.")
        
    # 2. Update ticket status
    ticket.status = models.QueueStatus.SERVING
    ticket.called_at = datetime.utcnow()
    ticket.handled_by_user_id = current_user.id
    ticket.counter_number = call_req.counter_number
    
    db.commit()
    db.refresh(ticket)
    
    # 3. Broadcast to TV Display
    await ws_manager.broadcast_to_branch(ticket.branch_id, {
        "type": "TICKET_CALLED",
        "ticket_number": ticket.ticket_number,
        "counter": ticket.counter_number,
        "service": ticket.service_type.value
    })
    
    # Also broadcast updated waiting list
    await broadcast_queue_state(db, current_user.branch_id)
    
    return ticket

@router.post("/{ticket_id}/complete", response_model=schemas.QueueTicketResponse)
async def complete_ticket(
    ticket_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ticket = db.query(models.QueueTicket).filter(models.QueueTicket.id == ticket_id).first()
    if not ticket: raise HTTPException(status_code=404)
    
    ticket.status = models.QueueStatus.COMPLETED
    ticket.completed_at = datetime.utcnow()
    db.commit()
    
    # Broadcast updated waiting list (though it shouldn't have changed, it's good for sync)
    await broadcast_queue_state(db, ticket.branch_id)
    
    return ticket

@router.post("/{ticket_id}/no-show", response_model=schemas.QueueTicketResponse)
async def no_show_ticket(
    ticket_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ticket = db.query(models.QueueTicket).filter(models.QueueTicket.id == ticket_id).first()
    if not ticket: raise HTTPException(status_code=404)
    
    ticket.status = models.QueueStatus.NO_SHOW
    db.commit()
    
    # Broadcast updated waiting list
    await broadcast_queue_state(db, ticket.branch_id)
    
    return ticket

@router.post("/{ticket_id}/recall")
async def recall_ticket(
    ticket_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ticket = db.query(models.QueueTicket).filter(models.QueueTicket.id == ticket_id).first()
    if not ticket: raise HTTPException(status_code=404)
    
    await ws_manager.broadcast_to_branch(ticket.branch_id, {
        "type": "TICKET_RECALLED",
        "ticket_number": ticket.ticket_number,
        "counter": ticket.counter_number
    })
    return {"status": "recalled"}

@router.get("/stats", response_model=schemas.QueueStats)
async def get_queue_stats(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Manager endpoint for live metrics"""
    waiting_count = db.query(models.QueueTicket).filter(
        models.QueueTicket.branch_id == current_user.branch_id,
        models.QueueTicket.status == models.QueueStatus.WAITING
    ).count()
    
    serving_count = db.query(models.QueueTicket).filter(
        models.QueueTicket.branch_id == current_user.branch_id,
        models.QueueTicket.status == models.QueueStatus.SERVING
    ).count()
    
    # Calculate longest wait
    oldest_waiting = db.query(models.QueueTicket).filter(
        models.QueueTicket.branch_id == current_user.branch_id,
        models.QueueTicket.status == models.QueueStatus.WAITING
    ).order_by(models.QueueTicket.issued_at).first()
    
    longest_wait = 0
    if oldest_waiting:
        wait_time = datetime.utcnow() - oldest_waiting.issued_at
        longest_wait = int(wait_time.total_seconds() / 60)
        
    active_tellers = db.query(models.User).filter(
        models.User.branch_id == current_user.branch_id,
        models.User.role == models.UserRole.TELLER,
        models.User.is_active == True # Placeholder, should check session activity
    ).count()
    
    return {
        "waiting_count": waiting_count,
        "serving_count": serving_count,
        "longest_wait_minutes": longest_wait,
        "active_tellers": active_tellers
    }
