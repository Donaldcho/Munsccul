"""
Enhanced Authentication Router - Fineract-compliant Security
Implements refresh token rotation, brute force protection, and 2FA
"""
from datetime import timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.security import HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import settings
from app.security.jwt_auth import (
    TokenManager,
    PasswordManager,
    LoginAttemptTracker
)
from app.security.permissions import PermissionChecker, Permission
from app.audit import AuditLogger, get_client_ip
from app import models, schemas
from app.auth import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])
security = HTTPBearer()


class TokenResponse(schemas.Token):
    """Enhanced token response with refresh token"""
    refresh_token: Optional[str] = None
    requires_2fa: bool = False
    two_factor_methods: Optional[list] = None


@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    response: Response,
    credentials: schemas.UserLogin,
    db: Session = Depends(get_db)
):
    """
    Authenticate user with brute force protection and refresh token
    
    - **username**: User's username
    - **password**: User's password
    
    Returns access token (15 min expiry) and refresh token (7 days expiry)
    """
    client_ip = get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "")
    
    # Check for brute force lockout
    tracker = LoginAttemptTracker(db)
    is_locked, unlock_time = tracker.is_locked_out(credentials.username, client_ip)
    
    if is_locked:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Account temporarily locked. Try again after {unlock_time}"
        )
    
    # Verify credentials
    user = db.query(models.User).filter(
        models.User.username == credentials.username
    ).first()
    
    if not user or not PasswordManager.verify_password(
        credentials.password, user.hashed_password
    ):
        # Record failed attempt
        tracker.record_attempt(credentials.username, client_ip, False)
        
        # Log failed login
        audit = AuditLogger(db, None, request)
        audit.log(
            action="LOGIN_FAILURE",
            entity_type="User",
            entity_id=credentials.username,
            description=f"Failed login attempt for username: {credentials.username} from IP: {client_ip}"
        )
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled"
        )
    
    # Clear failed attempts on successful login
    tracker.clear_attempts(credentials.username)
    
    # Check if 2FA is required
    two_factor = db.query(models.TwoFactorAuth).filter(
        models.TwoFactorAuth.user_id == user.id,
        models.TwoFactorAuth.is_enabled == True
    ).first()
    
    if two_factor and not PermissionChecker.has_permission(
        PermissionChecker.get_role_permissions(user.role.value),
        Permission.BYPASS_2FA
    ):
        # Return partial response - 2FA required
        return TokenResponse(
            access_token="",
            refresh_token="",
            token_type="bearer",
            expires_in=0,
            user=schemas.UserResponse.model_validate(user),
            requires_2fa=True,
            two_factor_methods=[two_factor.method]
        )
    
    # Create tokens
    access_token = TokenManager.create_access_token(
        data={
            "sub": user.username,
            "role": user.role.value,
            "user_id": user.id,
            "branch_id": user.branch_id
        }
    )
    
    refresh_token, _ = TokenManager.create_refresh_token(user.id, db)
    
    # Update user last login
    user.last_login = datetime.utcnow()
    db.commit()
    
    # Log successful login
    audit = AuditLogger(db, user, request)
    audit.log_login(success=True)
    
    # Set secure cookie for refresh token (optional)
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,  # Requires HTTPS
        samesite="strict",
        max_age=7 * 24 * 60 * 60  # 7 days
    )
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=TokenManager.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=schemas.UserResponse.model_validate(user),
        requires_2fa=False
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: Request,
    response: Response,
    refresh_token: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Refresh access token using refresh token
    Implements token rotation for security
    """
    # Get refresh token from cookie or body
    if not refresh_token:
        refresh_token = request.cookies.get("refresh_token")
    
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token required"
        )
    
    # Verify refresh token
    user = TokenManager.verify_refresh_token(refresh_token, db)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )
    
    # Rotate refresh token (security best practice)
    token_hash = __import__('hashlib').sha256(refresh_token.encode()).hexdigest()
    new_refresh_token, _ = TokenManager.rotate_refresh_token(
        token_hash, user.id, db
    )
    
    # Create new access token
    access_token = TokenManager.create_access_token(
        data={
            "sub": user.username,
            "role": user.role.value,
            "user_id": user.id,
            "branch_id": user.branch_id
        }
    )
    
    # Update cookie
    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        secure=True,
        samesite="strict",
        max_age=7 * 24 * 60 * 60
    )
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
        expires_in=TokenManager.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=schemas.UserResponse.model_validate(user),
        requires_2fa=False
    )


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Logout user - revoke all refresh tokens
    """
    # Revoke all refresh tokens for user
    TokenManager.revoke_all_user_tokens(current_user.id, db)
    
    # Clear cookie
    response.delete_cookie("refresh_token")
    
    # Log logout
    audit = AuditLogger(db, current_user, request)
    audit.log(
        action="LOGOUT",
        entity_type="User",
        entity_id=str(current_user.id),
        description=f"User {current_user.username} logged out (all sessions revoked)"
    )
    
    return {"message": "Successfully logged out from all sessions"}


@router.post("/logout-session")
async def logout_single_session(
    request: Request,
    response: Response,
    refresh_token: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Logout from a single session (revoke specific refresh token)
    """
    token_hash = __import__('hashlib').sha256(refresh_token.encode()).hexdigest()
    
    token_record = db.query(models.RefreshToken).filter(
        models.RefreshToken.token_hash == token_hash,
        models.RefreshToken.user_id == current_user.id
    ).first()
    
    if token_record:
        token_record.is_revoked = True
        token_record.revoked_at = datetime.utcnow()
        token_record.revoked_reason = "User logout"
        db.commit()
    
    # Clear cookie
    response.delete_cookie("refresh_token")
    
    return {"message": "Session logged out successfully"}


@router.post("/change-password")
async def change_password(
    request: Request,
    old_password: str,
    new_password: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Change user password with validation and history check
    
    - **old_password**: Current password
    - **new_password**: New password (must meet strength requirements)
    """
    # Verify old password
    if not PasswordManager.verify_password(old_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect old password"
        )
    
    # Validate new password strength
    is_valid, error_msg = PasswordManager.validate_password_strength(new_password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg
        )
    
    # Check password history (prevent reuse)
    history = db.query(models.PasswordHistory).filter(
        models.PasswordHistory.user_id == current_user.id
    ).order_by(models.PasswordHistory.changed_at.desc()).limit(
        settings.PASSWORD_HISTORY_COUNT
    ).all()
    
    for old_pw in history:
        if PasswordManager.verify_password(new_password, old_pw.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot reuse any of your last {settings.PASSWORD_HISTORY_COUNT} passwords"
            )
    
    # Save old password to history
    password_history = models.PasswordHistory(
        user_id=current_user.id,
        password_hash=current_user.hashed_password
    )
    db.add(password_history)
    
    # Update password
    current_user.hashed_password = PasswordManager.hash_password(new_password)
    db.commit()
    
    # Revoke all refresh tokens (force re-login)
    TokenManager.revoke_all_user_tokens(current_user.id, db)
    
    # Log password change
    audit = AuditLogger(db, current_user, request)
    audit.log(
        action="PASSWORD_CHANGE",
        entity_type="User",
        entity_id=str(current_user.id),
        description=f"User {current_user.username} changed password (all sessions revoked)"
    )
    
    return {
        "message": "Password changed successfully. Please log in again with your new password."
    }


@router.get("/me/permissions")
async def get_my_permissions(
    current_user: models.User = Depends(get_current_user),
):
    """Get current user's permissions"""
    permissions = PermissionChecker.get_role_permissions(current_user.role.value)
    
    return {
        "role": current_user.role.value,
        "permissions": permissions
    }


@router.get("/me/sessions")
async def get_active_sessions(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's active sessions (refresh tokens)"""
    sessions = db.query(models.RefreshToken).filter(
        models.RefreshToken.user_id == current_user.id,
        models.RefreshToken.is_revoked == False,
        models.RefreshToken.expires_at > datetime.utcnow()
    ).all()
    
    return {
        "sessions": [
            {
                "id": s.id,
                "created_at": s.created_at,
                "expires_at": s.expires_at,
                "last_used_at": s.last_used_at,
                "ip_address": s.ip_address
            }
            for s in sessions
        ]
    }





# 2FA endpoints (placeholder for future implementation)
@router.post("/2fa/setup")
async def setup_two_factor(
    request: Request,
    method: str = "totp",
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Set up two-factor authentication
    (Placeholder - full TOTP implementation would require additional libraries)
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="2FA setup not yet implemented"
    )


@router.post("/2fa/verify")
async def verify_two_factor(
    request: Request,
    code: str,
    db: Session = Depends(get_db)
):
    """
    Verify 2FA code and complete login
    (Placeholder - full TOTP implementation would require additional libraries)
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="2FA verification not yet implemented"
    )


from datetime import datetime