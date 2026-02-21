"""
Security Middleware - OWASP-compliant
Implements security headers, CORS, and other security measures
"""
from fastapi import Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import secrets
import hashlib
import time
from typing import Optional

from app.config import settings


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Add OWASP-recommended security headers to all responses
    """
    
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Content Security Policy (CSP)
        # Prevents XSS attacks by controlling resource loading
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: https:; "
            "connect-src 'self'; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self';"
        )
        
        # X-Content-Type-Options
        # Prevents MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        
        # X-Frame-Options
        # Prevents clickjacking attacks
        response.headers["X-Frame-Options"] = "DENY"
        
        # X-XSS-Protection (legacy, but still useful)
        response.headers["X-XSS-Protection"] = "1; mode=block"
        
        # Strict-Transport-Security (HSTS)
        # Forces HTTPS connections
        if not settings.DEBUG:
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )
        
        # Referrer-Policy
        # Controls referrer information leakage
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # Permissions-Policy
        # Controls browser features
        response.headers["Permissions-Policy"] = (
            "accelerometer=(), "
            "camera=(), "
            "geolocation=(), "
            "gyroscope=(), "
            "magnetometer=(), "
            "microphone=(), "
            "payment=(), "
            "usb=()"
        )
        
        # Cache-Control for sensitive endpoints
        if request.url.path.startswith("/api/v1/auth"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, proxy-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        
        return response


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Add unique request ID for tracing and logging
    """
    
    async def dispatch(self, request: Request, call_next):
        # Generate or extract request ID
        request_id = request.headers.get("X-Request-ID")
        if not request_id:
            request_id = secrets.token_hex(16)
        
        # Store in request state
        request.state.request_id = request_id
        
        # Process request
        response = await call_next(request)
        
        # Add request ID to response
        response.headers["X-Request-ID"] = request_id
        
        return response


class TimingMiddleware(BaseHTTPMiddleware):
    """
    Add timing information to responses
    """
    
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        response = await call_next(request)
        
        duration = time.time() - start_time
        response.headers["X-Response-Time"] = f"{duration:.3f}s"
        
        return response


class InputValidationMiddleware(BaseHTTPMiddleware):
    """
    Basic input validation and sanitization
    Prevents common injection attacks
    """
    
    # Patterns that might indicate injection attacks
    SUSPICIOUS_PATTERNS = [
        "<script",  # XSS
        "javascript:",  # XSS
        "onerror=",  # XSS
        "onload=",  # XSS
        "SELECT * FROM",  # SQL injection (basic)
        "UNION SELECT",  # SQL injection
        "; DROP TABLE",  # SQL injection
        "../../",  # Path traversal
        "../",  # Path traversal
        "\\x",  # Hex encoding
        "%00",  # Null byte
    ]
    
    async def dispatch(self, request: Request, call_next):
        # Check query parameters
        for key, value in request.query_params.items():
            if self._is_suspicious(value):
                from fastapi import HTTPException, status
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid input detected"
                )
        
        return await call_next(request)
    
    def _is_suspicious(self, value: str) -> bool:
        """Check if value contains suspicious patterns"""
        if not value:
            return False
        
        value_lower = value.lower()
        for pattern in self.SUSPICIOUS_PATTERNS:
            if pattern.lower() in value_lower:
                return True
        
        return False


class AuditLoggingMiddleware(BaseHTTPMiddleware):
    """
    Log all requests for audit purposes
    """
    
    async def dispatch(self, request: Request, call_next):
        # Skip logging for health checks
        if request.url.path in ["/health", "/"]:
            return await call_next(request)
        
        # Log request
        client_ip = self._get_client_ip(request)
        user_agent = request.headers.get("User-Agent", "")
        
        # You can extend this to log to database or external service
        # For now, just add to request state
        request.state.client_ip = client_ip
        request.state.user_agent = user_agent
        
        response = await call_next(request)
        
        # Log response status
        # In production, you might want to log to a proper audit system
        
        return response
    
    def _get_client_ip(self, request: Request) -> str:
        """Get client IP address"""
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip
        
        if request.client:
            return request.client.host
        
        return "unknown"


def get_cors_config():
    """Get CORS middleware configuration"""
    # In production, specify exact origins
    allow_origins = ["*"] if settings.DEBUG else [
        "https://localhost:3000",
        "https://munsccul.cm",
        "https://*.munsccul.cm",
        "http://localhost:3002",
        "http://localhost:3000",
        "http://127.0.0.1:3002",
        "http://127.0.0.1:3000"
    ]
    
    return {
        "allow_origins": allow_origins,
        "allow_credentials": True,
        "allow_methods": ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        "allow_headers": [
            "*",
            "Authorization",
            "Content-Type",
            "X-Request-ID",
            "X-CSRF-Token"
        ],
        "expose_headers": [
            "X-Request-ID",
            "X-Response-Time",
            "X-RateLimit-Limit",
            "X-RateLimit-Remaining",
            "X-RateLimit-Reset"
        ],
        "max_age": 600
    }


def get_trusted_host_middleware():
    """Get trusted host middleware"""
    if settings.DEBUG:
        return None
    
    return TrustedHostMiddleware(
        allowed_hosts=[
            "localhost",
            "127.0.0.1",
            "*.munsccul.cm",
            "munsccul.cm"
        ]
    )


# CSRF Protection (for state-changing operations)
class CSRFProtection:
    """
    CSRF token generation and validation
    For use with cookie-based authentication
    """
    
    TOKEN_LENGTH = 32
    
    @classmethod
    def generate_token(cls) -> str:
        """Generate a new CSRF token"""
        return secrets.token_urlsafe(cls.TOKEN_LENGTH)
    
    @classmethod
    def validate_token(cls, token: str, expected_token: str) -> bool:
        """Validate CSRF token using constant-time comparison"""
        if not token or not expected_token:
            return False
        
        return secrets.compare_digest(token, expected_token)


# Secure cookie settings
SECURE_COOKIE_SETTINGS = {
    "httponly": True,
    "secure": not settings.DEBUG,  # Requires HTTPS in production
    "samesite": "strict",
    "max_age": 7 * 24 * 60 * 60  # 7 days
}


# Security configuration for production
def get_security_config():
    """Get security configuration for the application"""
    return {
        # HTTPS enforcement
        "force_https": not settings.DEBUG,
        
        # Cookie settings
        "cookie_secure": not settings.DEBUG,
        "cookie_httponly": True,
        "cookie_samesite": "strict",
        
        # Session settings
        "session_cookie_name": "munsccul_session",
        "session_max_age": settings.SESSION_TIMEOUT_MINUTES * 60,
        
        # CSRF
        "csrf_cookie_name": "munsccul_csrf",
        
        # Rate limiting
        "rate_limit_enabled": settings.RATE_LIMIT_ENABLED,
        
        # Content Security Policy
        "csp_enabled": True,
        
        # HSTS
        "hsts_enabled": not settings.DEBUG,
        "hsts_max_age": 31536000,
        "hsts_include_subdomains": True,
        "hsts_preload": True
    }