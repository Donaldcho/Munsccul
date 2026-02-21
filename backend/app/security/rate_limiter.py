"""
Rate Limiting Module - OWASP-compliant
Prevents brute force attacks and API abuse
"""
import time
from typing import Dict, Optional, Tuple
from functools import wraps
from fastapi import Request, HTTPException, status
import redis
from datetime import datetime, timedelta

from app.config import settings


class RateLimiter:
    """
    Rate limiter using Redis or in-memory storage
    Implements sliding window rate limiting
    """
    
    def __init__(self):
        self.storage: Dict[str, Dict] = {}
        self.use_redis = False
        
        # Try to connect to Redis
        try:
            self.redis_client = redis.Redis(
                host=getattr(settings, 'REDIS_HOST', 'localhost'),
                port=getattr(settings, 'REDIS_PORT', 6379),
                db=getattr(settings, 'REDIS_DB', 0),
                decode_responses=True,
                socket_connect_timeout=2
            )
            self.redis_client.ping()
            self.use_redis = True
        except (redis.ConnectionError, redis.TimeoutError):
            # Fall back to in-memory storage
            self.use_redis = False
    
    def _get_key(self, identifier: str, action: str) -> str:
        """Generate a unique key for rate limiting"""
        return f"rate_limit:{action}:{identifier}"
    
    def _get_current_window(self, window_seconds: int) -> int:
        """Get the current time window"""
        return int(time.time()) // window_seconds
    
    def is_allowed(
        self,
        identifier: str,
        action: str,
        max_requests: int,
        window_seconds: int
    ) -> Tuple[bool, Dict]:
        """
        Check if request is allowed under rate limit
        Returns: (is_allowed, rate_limit_info)
        """
        key = self._get_key(identifier, action)
        current_window = self._get_current_window(window_seconds)
        window_key = f"{key}:{current_window}"
        
        if self.use_redis:
            return self._check_redis(window_key, max_requests, window_seconds)
        else:
            return self._check_memory(window_key, max_requests, window_seconds)
    
    def _check_redis(
        self,
        window_key: str,
        max_requests: int,
        window_seconds: int
    ) -> Tuple[bool, Dict]:
        """Check rate limit using Redis"""
        pipe = self.redis_client.pipeline()
        
        # Increment counter
        pipe.incr(window_key)
        # Set expiry if new key
        pipe.expire(window_key, window_seconds)
        
        results = pipe.execute()
        current_count = results[0]
        
        remaining = max(0, max_requests - current_count)
        reset_time = int(time.time()) + window_seconds
        
        info = {
            "limit": max_requests,
            "remaining": remaining,
            "reset": reset_time,
            "window": window_seconds
        }
        
        return current_count <= max_requests, info
    
    def _check_memory(
        self,
        window_key: str,
        max_requests: int,
        window_seconds: int
    ) -> Tuple[bool, Dict]:
        """Check rate limit using in-memory storage"""
        now = time.time()
        
        # Clean up old entries periodically
        if len(self.storage) > 10000:
            self._cleanup_old_entries()
        
        if window_key not in self.storage:
            self.storage[window_key] = {
                "count": 0,
                "reset_time": now + window_seconds
            }
        
        entry = self.storage[window_key]
        
        # Check if window has expired
        if now > entry["reset_time"]:
            entry["count"] = 0
            entry["reset_time"] = now + window_seconds
        
        entry["count"] += 1
        
        remaining = max(0, max_requests - entry["count"])
        
        info = {
            "limit": max_requests,
            "remaining": remaining,
            "reset": int(entry["reset_time"]),
            "window": window_seconds
        }
        
        return entry["count"] <= max_requests, info
    
    def _cleanup_old_entries(self):
        """Remove expired entries from memory storage"""
        now = time.time()
        expired_keys = [
            key for key, entry in self.storage.items()
            if now > entry.get("reset_time", 0)
        ]
        for key in expired_keys:
            del self.storage[key]


# Global rate limiter instance
rate_limiter = RateLimiter()


# Rate limit configurations
class RateLimitConfig:
    """Rate limit configurations for different endpoints"""
    
    # Authentication endpoints - strict limits
    LOGIN = {"max_requests": 5, "window_seconds": 300}  # 5 attempts per 5 minutes
    PASSWORD_RESET = {"max_requests": 3, "window_seconds": 3600}  # 3 per hour
    
    # API endpoints - moderate limits
    API_GENERAL = {"max_requests": 1000, "window_seconds": 3600}  # 1000 per hour
    API_SENSITIVE = {"max_requests": 100, "window_seconds": 3600}  # 100 per hour
    
    # Transaction endpoints - strict limits
    TRANSACTION = {"max_requests": 60, "window_seconds": 60}  # 60 per minute


def rate_limit(
    max_requests: int,
    window_seconds: int,
    identifier_func: Optional[callable] = None
):
    """
    Decorator to apply rate limiting to an endpoint
    
    Usage:
        @app.get("/login")
        @rate_limit(max_requests=5, window_seconds=300)
        async def login(request: Request):
            ...
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Get request object
            request = None
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break
            
            if request is None:
                # Try to get from kwargs
                request = kwargs.get('request')
            
            if request is None:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Rate limiting requires Request object"
                )
            
            # Get identifier (IP address or user ID)
            if identifier_func:
                identifier = identifier_func(request)
            else:
                # Default: use IP address + user agent
                client_ip = request.client.host if request.client else "unknown"
                identifier = client_ip
            
            # Check rate limit
            is_allowed, info = rate_limiter.is_allowed(
                identifier,
                func.__name__,
                max_requests,
                window_seconds
            )
            
            if not is_allowed:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Rate limit exceeded. Please try again later.",
                    headers={
                        "X-RateLimit-Limit": str(info["limit"]),
                        "X-RateLimit-Remaining": str(info["remaining"]),
                        "X-RateLimit-Reset": str(info["reset"]),
                        "Retry-After": str(info["window"])
                    }
                )
            
            # Add rate limit headers to response
            response = await func(*args, **kwargs)
            
            # If response is a dict, wrap it
            if isinstance(response, dict):
                from fastapi.responses import JSONResponse
                return JSONResponse(
                    content=response,
                    headers={
                        "X-RateLimit-Limit": str(info["limit"]),
                        "X-RateLimit-Remaining": str(info["remaining"]),
                        "X-RateLimit-Reset": str(info["reset"])
                    }
                )
            
            return response
        
        return wrapper
    return decorator


def get_client_identifier(request: Request) -> str:
    """Get a unique identifier for the client"""
    # Get client IP
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    else:
        client_ip = request.client.host if request.client else "unknown"
    
    # Add user agent for more uniqueness
    user_agent = request.headers.get("User-Agent", "")
    
    return f"{client_ip}:{hash(user_agent) % 10000}"


def get_user_identifier(request: Request) -> str:
    """Get user-based identifier if authenticated"""
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        payload = TokenManager.decode_token(token)
        if payload:
            return f"user:{payload.get('sub')}"
    
    # Fall back to IP-based
    return get_client_identifier(request)