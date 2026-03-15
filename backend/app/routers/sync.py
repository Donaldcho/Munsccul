from fastapi import APIRouter, Depends, HTTPException, Security
from fastapi.security.api_key import APIKeyHeader
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas import BulkSyncRequest
from app.services.sync_service import process_bulk_sync
from app.config import settings
import os

router = APIRouter(prefix="/api/v1/sync/receive", tags=["Synchronization"])

# Define the expected Auth Header
API_KEY_NAME = "Authorization"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

def verify_sync_key(api_key_header_val: str = Security(api_key_header)):
    """
    Validates the BRANCH_SYNC_KEY to ensure only authorized edge nodes can push data.
    """
    expected_key = f"Bearer {settings.BRANCH_SYNC_KEY}"
    if api_key_header_val != expected_key:
        raise HTTPException(status_code=403, detail="Invalid Branch Sync Key")
    return True

@router.post("/transactions/bulk")
def receive_bulk_transactions(
    payload: BulkSyncRequest,
    db: Session = Depends(get_db),
    authorized: bool = Depends(verify_sync_key)
):
    """
    Capital HQ Endpoint: Receives offline transactions from branches.
    Enforces strict idempotency based on transaction_ref.
    """
    try:
        result = process_bulk_sync(db, payload)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sync processing failed: {str(e)}")
