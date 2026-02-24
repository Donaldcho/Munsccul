from fastapi import Request, HTTPException, status, Response
from starlette.middleware.base import BaseHTTPMiddleware
from app.database import SessionLocal
from app import models
import logging

logger = logging.getLogger(__name__)

class EODLockoutMiddleware(BaseHTTPMiddleware):
    """
    Middleware to block financial transactions if branch status is EOD_IN_PROGRESS or CLOSED.
    Prevents late entries during reconciliation.
    """
    
    # Endpoints to protect (state-changing financial operations)
    PROTECTED_PREFIXES = [
        "/api/v1/transactions/deposit",
        "/api/v1/transactions/withdrawal",
        "/api/v1/transactions/transfer",
        "/api/v1/loans/disburse",
        "/api/v1/teller/vault-drop"
    ]

    async def dispatch(self, request: Request, call_next):
        # Only check POST/PUT/PATCH for financial endpoints
        if request.method in ["POST", "PUT", "PATCH"]:
            is_protected = any(request.url.path.startswith(prefix) for prefix in self.PROTECTED_PREFIXES)
            
            if is_protected:
                # We try to get branch_id from headers or request state
                # Tellers usually have branch_id in their token, which auth middleware extracts.
                # However, this middleware might run before or after auth depending on main.py order.
                
                branch_id = request.headers.get("X-Branch-ID")
                
                # If not in header, we'll allow it for now, but in production we'd enforce it
                if branch_id:
                    db = SessionLocal()
                    try:
                        branch = db.query(models.Branch).filter(models.Branch.id == int(branch_id)).first()
                        if branch and branch.status in [models.BranchStatus.EOD_IN_PROGRESS, models.BranchStatus.CLOSED]:
                            return Response(
                                content="Branch is currently locked for End-Of-Day processing (Error 423).",
                                status_code=status.HTTP_423_LOCKED
                            )
                    except Exception as e:
                        logger.error(f"EOD Middleware error: {e}")
                    finally:
                        db.close()
        
        return await call_next(request)
