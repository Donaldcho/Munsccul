"""
Configuration settings for CamCCUL Banking System
"""
from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    """Application settings"""
    
    # Application
    APP_NAME: str = "MUNSCCUL Core Banking System"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "postgresql://camccul:camccul_password@localhost:5432/camccul_banking"
    )
    
    # Security - Fineract-compliant
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
    REFRESH_SECRET_KEY: str = os.getenv("REFRESH_SECRET_KEY", "your-refresh-secret-key-change-in-production")
    ENCRYPTION_KEY: str = os.getenv("ENCRYPTION_KEY", "")  # AES-256 encryption key
    
    # JWT Configuration (Fineract standards)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15  # Short-lived access tokens (15 min)
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7  # Refresh token lifetime
    ALGORITHM: str = "HS256"
    
    # Password hashing (Fineract/NIST standards)
    BCRYPT_ROUNDS: int = 12
    PASSWORD_MIN_LENGTH: int = 8
    PASSWORD_MAX_LENGTH: int = 128
    PASSWORD_HISTORY_COUNT: int = 5  # Prevent reuse of last 5 passwords
    
    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_LOGIN_ATTEMPTS: int = 5
    RATE_LIMIT_LOGIN_WINDOW: int = 300  # 5 minutes
    RATE_LIMIT_LOCKOUT_MINUTES: int = 30
    
    # 2FA Settings
    TWO_FACTOR_AUTH_ENABLED: bool = False
    TWO_FACTOR_METHOD: str = "totp"  # totp, sms, email
    OTP_LENGTH: int = 6
    OTP_VALIDITY_SECONDS: int = 300  # 5 minutes
    
    # Session Security
    SESSION_TIMEOUT_MINUTES: int = 480  # 8 hours for teller shifts
    REQUIRE_REAUTH_FOR_SENSITIVE: bool = True  # Require re-auth for sensitive operations
    
    # Business Rules
    MIN_DEPOSIT_AMOUNT: float = 100.0  # FCFA
    MAX_WITHDRAWAL_AMOUNT: float = 5000000.0  # FCFA
    FOUR_EYES_THRESHOLD: float = 500000.0  # FCFA - requires manager approval
    
    # COBAC Credit Union Constraints
    MIN_SHARE_CAPITAL: float = 5000.0          # Minimum shares to be "active" (5 shares × 1,000 XAF)
    SHARE_PRICE: float = 1000.0                # Price per share
    SAVINGS_MULTIPLIER: int = 3                # Max loan = 3× (shares + savings)
    DEBT_SERVICE_RATIO: float = 0.33           # Monthly repayment ≤ 1/3 of salary
    COOLING_OFF_DAYS: int = 90                 # New members must save 3 months before loan
    CTR_THRESHOLD: float = 5000000.0           # AML cash threshold reporting (ANIF)
    DORMANCY_MONTHS: int = 6                   # Months without member activity → dormant
    MIN_SAVINGS_OPERATING_BALANCE: float = 1000.0  # Default min balance for savings accounts
    
    # Loan Settings
    DEFAULT_DELINQUENCY_DAYS: int = 30
    
    # Sync Settings
    SYNC_BATCH_SIZE: int = 100
    MAX_OFFLINE_DAYS: int = 7
    
    # COBAC Reporting
    COBAC_INSTITUTION_CODE: str = os.getenv("COBAC_INSTITUTION_CODE", "MUNSCCUL001")
    
    # Data Sovereignty - Local Cameroon hosting
    DATA_CENTER_REGION: str = "Camtel-Zamengoue"
    
    # Infrastructure
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    
    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()