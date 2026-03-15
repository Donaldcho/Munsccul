"""
MUNSCCUL Next-Gen Core Banking System - Main Application
FastAPI backend with COBAC compliance, Fineract-level security, and offline-first architecture
"""
from fastapi import FastAPI, Request, status, WebSocket
from fastapi.openapi.docs import get_redoc_html
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from contextlib import asynccontextmanager
import time
import logging

from app.config import settings
from app.database import init_db
from app.security.middleware import (
    SecurityHeadersMiddleware,
    RequestIDMiddleware,
    TimingMiddleware,
    InputValidationMiddleware,
    AuditLoggingMiddleware,
    get_cors_config
)
from app.middleware.eod_lockout import EODLockoutMiddleware
from app.websocket_manager import ws_manager
from app.routers import (
    auth as auth_router_mod,
    auth_enhanced as auth_enhanced_mod,  # Enhanced auth with refresh tokens
    members,
    accounts,
    transactions,
    loans,
    reports,
    branches,
    webhooks,
    mobile_money,
    teller,
    eod,
    queue,
    njangi,
    intercom,
    kyc,
    treasury,
    policies
)

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    from app.scheduler.job_scheduler import scheduler, setup_default_jobs
    from app.services.risk_scoring import load_models
    
    # Startup
    logger.info("Starting MUNSCCUL Core Banking System...")
    logger.info(f"Environment: {'Development' if settings.DEBUG else 'Production'}")
    
    # Load Machine Learning Models into memory (Edge AI)
    logger.info("Loading offline Edge AI ML models...")
    load_models()
    
    # Initialize database
    try:
        init_db()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise
    
    # Start scheduler
    try:
        scheduler.start()
        setup_default_jobs()
        logger.info("Scheduler started with default jobs")
    except Exception as e:
        logger.error(f"Scheduler startup failed: {e}")
    
    yield
    
    # Shutdown
    logger.info("Shutting down MUNSCCUL Core Banking System...")
    try:
        scheduler.shutdown()
        logger.info("Scheduler shutdown")
    except Exception as e:
        logger.error(f"Scheduler shutdown error: {e}")


# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    redoc_url=None, # Disable default (broken) Redoc CDN link
    description="""
    MUNSCCUL Next-Gen Core Banking System API
    
    A modern, COBAC-compliant core banking solution for Credit Unions in Cameroon.
    
    ## Features
    
    - **Member Management (KYC)**: Full KYC compliance with biometric support
    - **Core Transactions**: Deposits, withdrawals, transfers with double-entry bookkeeping
    - **Loan Management**: Configurable products, amortization schedules, guarantor management
    - **Regulatory Reporting**: COBAC-compliant reports and immutable audit trails
    - **Offline-First**: Works without internet for up to 7 days
    
    ## Authentication
    
    All endpoints require JWT authentication. Use `/auth/login` to obtain a token.
    
    ## Compliance
    
    - COBAC Regulation EMF R-2017/06
    - Cameroon Data Protection Law 2024/017
    - OHADA Accounting Standards
    - OHADA Accounting Standards
    """,
    lifespan=lifespan
)



# 0. CORS middleware (Must be first to handle OPTIONS preflight requests)
cors_config = get_cors_config()
if settings.DEBUG:
    cors_config["allow_origins"] = ["*"]
    cors_config["allow_credentials"] = False # Required for "*"
app.add_middleware(CORSMiddleware, **cors_config)

# Security middleware (order matters - first added = last executed in some frameworks, but in FastAPI/Starlette, first added = first called on request)
# 1. Request ID middleware (adds tracing ID)
app.add_middleware(RequestIDMiddleware)

# 2. Audit logging middleware
app.add_middleware(AuditLoggingMiddleware)

# 3. Input validation middleware (prevents injection attacks)
app.add_middleware(InputValidationMiddleware)

# 4. Timing middleware
app.add_middleware(TimingMiddleware)

# 5. Security headers middleware (OWASP-compliant)
app.add_middleware(SecurityHeadersMiddleware)

# 6. EOD Lockout middleware (Blocks financial ops during closure)
app.add_middleware(EODLockoutMiddleware)


# Exception handlers
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors"""
    # Cast exc errors to strings to prevent 'bytes is not JSON serializable' errors
    errors = [{'loc': e.get('loc'), 'msg': e.get('msg'), 'type': e.get('type')} for e in exc.errors()]
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "Validation Error",
            "detail": errors
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle general exceptions"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal Server Error",
            "detail": "An unexpected error occurred" if not settings.DEBUG else str(exc)
        }
    )


# Include routers
app.include_router(auth_router_mod.router, prefix="/api/v1")
app.include_router(auth_enhanced_mod.router, prefix="/api/v1")  # Enhanced auth with refresh tokens
app.include_router(members.router, prefix="/api/v1")
app.include_router(accounts.router, prefix="/api/v1")
app.include_router(transactions.router, prefix="/api/v1")
app.include_router(loans.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")
app.include_router(branches.router, prefix="/api/v1")
app.include_router(webhooks.router, prefix="/api/v1")  # Webhooks for integrations
app.include_router(mobile_money.router, prefix="/api/v1")  # Mobile Money integration
app.include_router(teller.router, prefix="/api/v1")  # Teller Operations
app.include_router(eod.router, prefix="/api/v1")  # End of Day Operations
app.include_router(queue.router, prefix="/api/v1")  # Queue Management System
app.include_router(njangi.router, prefix="/api/v1")  # Smart Njangi (Tontine)
app.include_router(intercom.router, prefix="/api/v1")  # Secure Internal Intercom
app.include_router(kyc.router, prefix="/api/v1")  # KYC OCR Scanner
app.include_router(treasury.router, prefix="/api/v1")  # Treasury Management
app.include_router(policies.router, prefix="/api/v1")  # Board Governance Policies

# Health check endpoint
@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint for monitoring"""
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "reporting_version": "v2.2-DEBUG-MATRIX",
        "timestamp": time.time()
    }


@app.get("/redoc", include_in_schema=False)
async def custom_redoc_html():
    """Custom Redoc route with the working CDN URL"""
    return get_redoc_html(
        openapi_url=app.openapi_url,
        title=app.title + " - ReDoc",
        redoc_js_url="https://cdn.jsdelivr.net/npm/redoc/bundles/redoc.standalone.js"
    )


# Root endpoint
@app.get("/", tags=["Root"])
async def root():
    """Root endpoint"""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "documentation": "/docs",
        "health": "/health"
    }


# System info endpoint
@app.get("/api/v1/system/info", tags=["System"])
async def system_info():
    """Get system information"""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "debug": settings.DEBUG,
        "data_center": settings.DATA_CENTER_REGION,
        "cobac_institution_code": settings.COBAC_INSTITUTION_CODE,
        "security": {
            "jwt_access_token_ttl": f"{settings.ACCESS_TOKEN_EXPIRE_MINUTES} minutes",
            "jwt_refresh_token_ttl": f"{settings.REFRESH_TOKEN_EXPIRE_DAYS} days",
            "password_min_length": settings.PASSWORD_MIN_LENGTH,
            "rate_limiting": settings.RATE_LIMIT_ENABLED,
            "two_factor_auth": settings.TWO_FACTOR_AUTH_ENABLED,
            "session_timeout": f"{settings.SESSION_TIMEOUT_MINUTES} minutes",
            "encryption": "AES-256-CBC",
            "compliance": ["OWASP Top 10", "COBAC EMF R-2017/06", "Cameroon Law 2024/017"]
        },
        "features": {
            "offline_mode": True,
            "biometric_support": True,
            "cobac_reporting": True,
            "double_entry_bookkeeping": True,
            "refresh_token_rotation": True,
            "fine_grained_permissions": True,
            "brute_force_protection": True,
            "event_sourcing": True,
            "webhooks": True,
            "scheduled_jobs": True,
            "mobile_money_integration": True,
            "gl_accounting": True,
            "charges_fees": True,
            "standing_instructions": True
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        log_level="info" if not settings.DEBUG else "debug"
    )