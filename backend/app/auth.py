"""
Authentication and Security Utilities
Implements JWT token authentication and password hashing
"""
from datetime import datetime, timedelta
from typing import Optional, Union
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app import models, schemas

# Password hashing with bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# HTTP Bearer for token authentication
security = HTTPBearer()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a hashed password"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt"""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token"""
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    
    return encoded_jwt


def decode_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT token"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> models.User:
    """Get the current authenticated user from JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    token = credentials.credentials
    payload = decode_token(token)
    
    if payload is None:
        raise credentials_exception
    
    username: str = payload.get("sub")
    if username is None:
        raise credentials_exception
    
    user = db.query(models.User).filter(models.User.username == username).first()
    
    if user is None or not user.is_active:
        raise credentials_exception
    
    return user


def get_current_active_user(current_user: models.User = Depends(get_current_user)) -> models.User:
    """Verify user is active"""
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


def require_role(allowed_roles: list):
    """Decorator to require specific user roles"""
    def role_checker(current_user: models.User = Depends(get_current_user)):
        if current_user.role.value not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {', '.join(allowed_roles)}"
            )
        return current_user
    return role_checker


# Role-based dependencies
require_ops_manager = require_role(["OPS_MANAGER", "SYSTEM_ADMIN"])
require_admin = require_role(["SYSTEM_ADMIN"])
require_manager = require_role(["BRANCH_MANAGER", "OPS_MANAGER"])
require_teller = require_role(["TELLER", "BRANCH_MANAGER", "OPS_MANAGER"])
require_credit_officer = require_role(["CREDIT_OFFICER", "BRANCH_MANAGER", "OPS_MANAGER"])
require_auditor = require_role(["AUDITOR", "OPS_MANAGER", "SYSTEM_ADMIN"])

def require_member_access(current_user: models.User = Depends(get_current_active_user)):
    """
    Access to member KYC information.
    Excludes SYSTEM_ADMIN to enforce data blindness.
    """
    allowed_roles = [
        models.UserRole.TELLER,
        models.UserRole.CREDIT_OFFICER,
        models.UserRole.BRANCH_MANAGER,
        models.UserRole.OPS_MANAGER,
        models.UserRole.OPS_DIRECTOR,
        models.UserRole.BOARD_MEMBER,
        models.UserRole.AUDITOR
    ]
    
    if current_user.role not in allowed_roles:
        raise HTTPException(
            status_code=403, 
            detail="Access Denied: You do not have clearance to view member details."
        )
    return current_user

def require_audit_access(current_user: models.User = Depends(get_current_active_user)):
    """
    Access to system audit logs.
    Allowed for Admins, Auditors, Managers, Directors, and Board Members.
    """
    allowed_roles = [
        models.UserRole.SYSTEM_ADMIN,
        models.UserRole.OPS_MANAGER,
        models.UserRole.BOARD_MEMBER,
        models.UserRole.AUDITOR,
        models.UserRole.BRANCH_MANAGER,
        models.UserRole.OPS_DIRECTOR
    ]
    
    if current_user.role not in allowed_roles:
        raise HTTPException(
            status_code=403, 
            detail="Access Denied: You do not have clearance to view audit logs."
        )
    return current_user

def require_global_reporting_access(current_user: models.User = Depends(get_current_active_user)):
    """
    Only Ops Managers, Branch Managers, Directors, and Board Members/Auditors can see the whole financial picture.
    Blocks Admins, Tellers, and standard Credit Officers.
    """
    allowed_roles = [
        models.UserRole.OPS_MANAGER, 
        models.UserRole.BOARD_MEMBER, 
        models.UserRole.AUDITOR, 
        models.UserRole.BRANCH_MANAGER, 
        models.UserRole.OPS_DIRECTOR
    ]
    
    if current_user.role not in allowed_roles:
        raise HTTPException(
            status_code=403, 
            detail="Access Denied: You do not have clearance to view global financial reports."
        )
    return current_user

def require_par_reporting_access(current_user: models.User = Depends(get_current_active_user)):
    """
    Same as global reporting access, but also permits Credit Officers to see their assigned Portfolio At Risk.
    """
    allowed_roles = [
        models.UserRole.OPS_MANAGER, 
        models.UserRole.BOARD_MEMBER, 
        models.UserRole.AUDITOR, 
        models.UserRole.BRANCH_MANAGER, 
        models.UserRole.OPS_DIRECTOR,
        models.UserRole.CREDIT_OFFICER
    ]
    
    if current_user.role not in allowed_roles:
        raise HTTPException(
            status_code=403, 
            detail="Access Denied: You do not have clearance to view portfolio risk reports."
        )
    return current_user


def authenticate_user(db: Session, username: str, password: str) -> Optional[models.User]:
    """Authenticate a user with username and password"""
    user = db.query(models.User).filter(models.User.username == username).first()
    
    if not user:
        return None
    
    if not verify_password(password, user.hashed_password):
        return None
    
    # Update last login
    user.last_login = datetime.utcnow()
    db.commit()
    
    return user


def check_four_eyes_principle(
    db: Session, 
    transaction_amount: float, 
    creator_id: int
) -> bool:
    """
    Check if transaction requires approval based on Four-Eyes Principle or user's specific limit
    Returns True if approval is required
    """
    creator = db.query(models.User).filter(models.User.id == creator_id).first()
    if not creator:
        return True

    # 1. User-specific transaction limit (if set by Ops Manager)
    user_limit = float(creator.transaction_limit or 0)
    if user_limit > 0 and transaction_amount > user_limit:
        return True

    # 2. Global system threshold check for non-management roles
    if transaction_amount >= settings.FOUR_EYES_THRESHOLD:
        if creator.role not in [models.UserRole.BRANCH_MANAGER, models.UserRole.SYSTEM_ADMIN, models.UserRole.OPS_MANAGER]:
            return True
            
    return False


def generate_member_id() -> str:
    """Generate unique member ID with check digit"""
    import random
    
    # Generate 8-digit base number
    base = ''.join([str(random.randint(0, 9)) for _ in range(8)])
    
    # Calculate Luhn check digit
    def luhn_checksum(card_number):
        def digits_of(n):
            return [int(d) for d in str(n)]
        
        digits = digits_of(card_number)
        odd_digits = digits[-1::-2]
        even_digits = digits[-2::-2]
        checksum = sum(odd_digits)
        for d in even_digits:
            checksum += sum(digits_of(d * 2))
        return checksum % 10
    
    check_digit = (10 - luhn_checksum(base + '0')) % 10
    
    return f"M{base}{check_digit}"


def generate_account_number() -> str:
    """Generate unique account number"""
    import random
    from datetime import datetime
    
    # Format: ACC-YYYYMMDD-XXXXX
    date_part = datetime.now().strftime("%Y%m%d")
    random_part = ''.join([str(random.randint(0, 9)) for _ in range(5)])
    
    return f"ACC-{date_part}-{random_part}"


def generate_transaction_ref() -> str:
    """Generate unique transaction reference"""
    import uuid
    from datetime import datetime
    
    # Format: TXN-YYYYMMDD-UUID(first 8 chars)
    date_part = datetime.now().strftime("%Y%m%d")
    uuid_part = str(uuid.uuid4())[:8].upper()
    
    return f"TXN-{date_part}-{uuid_part}"


def generate_loan_number() -> str:
    """Generate unique loan number"""
    import random
    from datetime import datetime
    
    # Format: LOAN-YYYY-XXXXXX
    year_part = datetime.now().strftime("%Y")
    random_part = ''.join([str(random.randint(0, 9)) for _ in range(6)])
    
    return f"LOAN-{year_part}-{random_part}"