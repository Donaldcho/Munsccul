"""
Enhanced JWT Authentication - Fineract-compliant
Implements refresh token pattern with rotation, secure cookie handling
"""
from datetime import datetime, timedelta
from typing import Optional, Tuple, Dict, Any
from jose import JWTError, jwt
from passlib.context import CryptContext
import secrets
import hashlib
from sqlalchemy.orm import Session

from app.config import settings
from app import models

# Password hashing with bcrypt - Fineract standard
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12  # Fineract-compliant cost factor
)


class TokenManager:
    """
    JWT Token Manager with Refresh Token Rotation
    Based on Fineract's OAuth2 implementation
    """
    
    # Token lifetimes (Fineract standards)
    ACCESS_TOKEN_EXPIRE_MINUTES = 15  # Short-lived access tokens
    REFRESH_TOKEN_EXPIRE_DAYS = 7
    
    # Algorithm
    ALGORITHM = "HS256"
    
    @classmethod
    def create_access_token(
        cls,
        data: Dict[str, Any],
        expires_delta: Optional[timedelta] = None
    ) -> str:
        """Create a short-lived access token"""
        to_encode = data.copy()
        
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=cls.ACCESS_TOKEN_EXPIRE_MINUTES)
        
        # Add standard JWT claims (Fineract-compliant)
        to_encode.update({
            "exp": expire,
            "iat": datetime.utcnow(),
            "nbf": datetime.utcnow(),
            "typ": "access",
            "jti": secrets.token_urlsafe(32)  # Unique token ID for revocation
        })
        
        encoded_jwt = jwt.encode(
            to_encode,
            settings.SECRET_KEY,
            algorithm=cls.ALGORITHM
        )
        
        return encoded_jwt
    
    @classmethod
    def create_refresh_token(
        cls,
        user_id: int,
        db: Session
    ) -> Tuple[str, str]:
        """
        Create a refresh token with rotation support
        Returns: (token, token_hash) - store hash, not raw token
        """
        # Generate cryptographically secure random token
        raw_token = secrets.token_urlsafe(64)
        
        # Hash the token for storage (SHA-256 as per Fineract)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        
        # Store in database
        expires_at = datetime.utcnow() + timedelta(days=cls.REFRESH_TOKEN_EXPIRE_DAYS)
        
        refresh_token_record = models.RefreshToken(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
            created_at=datetime.utcnow(),
            is_revoked=False
        )
        
        db.add(refresh_token_record)
        db.commit()
        
        return raw_token, token_hash
    
    @classmethod
    def rotate_refresh_token(
        cls,
        old_token_hash: str,
        user_id: int,
        db: Session
    ) -> Tuple[str, str]:
        """
        Rotate refresh token - invalidate old, create new
        This prevents replay attacks
        """
        # Revoke the old token
        old_token = db.query(models.RefreshToken).filter(
            models.RefreshToken.token_hash == old_token_hash,
            models.RefreshToken.user_id == user_id
        ).first()
        
        if old_token:
            old_token.is_revoked = True
            old_token.revoked_at = datetime.utcnow()
            db.commit()
        
        # Create new token
        return cls.create_refresh_token(user_id, db)
    
    @classmethod
    def verify_refresh_token(
        cls,
        token: str,
        db: Session
    ) -> Optional[models.User]:
        """Verify a refresh token and return the user"""
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        
        refresh_record = db.query(models.RefreshToken).filter(
            models.RefreshToken.token_hash == token_hash,
            models.RefreshToken.is_revoked == False,
            models.RefreshToken.expires_at > datetime.utcnow()
        ).first()
        
        if not refresh_record:
            return None
        
        # Update last used timestamp
        refresh_record.last_used_at = datetime.utcnow()
        db.commit()
        
        return db.query(models.User).filter(
            models.User.id == refresh_record.user_id
        ).first()
    
    @classmethod
    def decode_token(cls, token: str) -> Optional[Dict[str, Any]]:
        """Decode and validate a JWT token"""
        try:
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=[cls.ALGORITHM]
            )
            return payload
        except JWTError:
            return None
    
    @classmethod
    def revoke_all_user_tokens(cls, user_id: int, db: Session):
        """Revoke all refresh tokens for a user (logout everywhere)"""
        db.query(models.RefreshToken).filter(
            models.RefreshToken.user_id == user_id,
            models.RefreshToken.is_revoked == False
        ).update({
            "is_revoked": True,
            "revoked_at": datetime.utcnow()
        })
        db.commit()


class PasswordManager:
    """Password management following Fineract/NIST standards"""
    
    MIN_LENGTH = 8
    MAX_LENGTH = 128
    
    @classmethod
    def hash_password(cls, password: str) -> str:
        """Hash password using bcrypt"""
        return pwd_context.hash(password)
    
    @classmethod
    def verify_password(cls, plain_password: str, hashed_password: str) -> bool:
        """Verify a password against its hash"""
        return pwd_context.verify(plain_password, hashed_password)
    
    @classmethod
    def validate_password_strength(cls, password: str) -> Tuple[bool, str]:
        """
        Validate password strength per NIST guidelines
        Returns: (is_valid, error_message)
        """
        if len(password) < cls.MIN_LENGTH:
            return False, f"Password must be at least {cls.MIN_LENGTH} characters"
        
        if len(password) > cls.MAX_LENGTH:
            return False, f"Password must not exceed {cls.MAX_LENGTH} characters"
        
        # Check for complexity (NIST recommends against arbitrary complexity rules)
        # But we should check for common passwords
        common_passwords = ['password', '123456', 'qwerty', 'admin', 'letmein']
        if password.lower() in common_passwords:
            return False, "Password is too common"
        
        return True, ""


class LoginAttemptTracker:
    """Track and limit failed login attempts - brute force protection"""
    
    MAX_ATTEMPTS = 5
    LOCKOUT_MINUTES = 30
    
    def __init__(self, db: Session):
        self.db = db
    
    def record_attempt(self, username: str, ip_address: str, success: bool):
        """Record a login attempt"""
        attempt = models.LoginAttempt(
            username=username,
            ip_address=ip_address,
            success=success,
            attempted_at=datetime.utcnow()
        )
        self.db.add(attempt)
        self.db.commit()
    
    def is_locked_out(self, username: str, ip_address: str) -> Tuple[bool, Optional[datetime]]:
        """
        Check if user/IP is locked out
        Returns: (is_locked, unlock_time)
        """
        cutoff = datetime.utcnow() - timedelta(minutes=self.LOCKOUT_MINUTES)
        
        # Count recent failed attempts
        failed_attempts = self.db.query(models.LoginAttempt).filter(
            models.LoginAttempt.username == username,
            models.LoginAttempt.success == False,
            models.LoginAttempt.attempted_at > cutoff
        ).count()
        
        # Also check by IP
        ip_failed_attempts = self.db.query(models.LoginAttempt).filter(
            models.LoginAttempt.ip_address == ip_address,
            models.LoginAttempt.success == False,
            models.LoginAttempt.attempted_at > cutoff
        ).count()
        
        if failed_attempts >= self.MAX_ATTEMPTS or ip_failed_attempts >= self.MAX_ATTEMPTS * 2:
            # Find the most recent failed attempt to calculate unlock time
            last_attempt = self.db.query(models.LoginAttempt).filter(
                models.LoginAttempt.username == username,
                models.LoginAttempt.success == False
            ).order_by(models.LoginAttempt.attempted_at.desc()).first()
            
            if last_attempt:
                unlock_time = last_attempt.attempted_at + timedelta(minutes=self.LOCKOUT_MINUTES)
                return True, unlock_time
            
            return True, None
        
        return False, None
    
    def clear_attempts(self, username: str):
        """Clear login attempts after successful login"""
        self.db.query(models.LoginAttempt).filter(
            models.LoginAttempt.username == username
        ).delete()
        self.db.commit()


def generate_secure_random_string(length: int = 32) -> str:
    """Generate a cryptographically secure random string"""
    return secrets.token_urlsafe(length)


def constant_time_compare(val1: str, val2: str) -> bool:
    """Constant time comparison to prevent timing attacks"""
    return secrets.compare_digest(val1, val2)