"""
Fine-Grained Permission System - Fineract-compliant
Implements role-based access control with granular permissions
"""
from enum import Enum
from functools import wraps
from typing import List, Optional, Callable
from fastapi import HTTPException, status, Depends, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.security.jwt_auth import TokenManager


class Permission(str, Enum):
    """
    Fine-grained permissions following Fineract's model
    Each permission represents a specific action on a resource
    """
    # User Management
    USER_CREATE = "user:create"
    USER_READ = "user:read"
    USER_UPDATE = "user:update"
    USER_DELETE = "user:delete"
    USER_ALL = "user:*"
    
    # Member Management
    MEMBER_CREATE = "member:create"
    MEMBER_READ = "member:read"
    MEMBER_READ_SENSITIVE = "member:read_sensitive"  # PII data
    MEMBER_UPDATE = "member:update"
    MEMBER_DELETE = "member:delete"
    MEMBER_ALL = "member:*"
    
    # Account Management
    ACCOUNT_CREATE = "account:create"
    ACCOUNT_READ = "account:read"
    ACCOUNT_UPDATE = "account:update"
    ACCOUNT_FREEZE = "account:freeze"
    ACCOUNT_CLOSE = "account:close"
    ACCOUNT_ALL = "account:*"
    
    # Transaction Management
    TRANSACTION_DEPOSIT = "transaction:deposit"
    TRANSACTION_WITHDRAW = "transaction:withdraw"
    TRANSACTION_TRANSFER = "transaction:transfer"
    TRANSACTION_APPROVE = "transaction:approve"  # Four-eyes approval
    TRANSACTION_READ = "transaction:read"
    TRANSACTION_ALL = "transaction:*"
    
    # Loan Management
    LOAN_PRODUCT_CREATE = "loan:product_create"
    LOAN_APPLY = "loan:apply"
    LOAN_APPROVE = "loan:approve"
    LOAN_DISBURSE = "loan:disburse"
    LOAN_REPAY = "loan:repay"
    LOAN_READ = "loan:read"
    LOAN_ALL = "loan:*"
    
    # Reporting
    REPORT_READ = "report:read"
    REPORT_GENERATE = "report:generate"
    REPORT_COBAC = "report:cobac"
    REPORT_ALL = "report:*"
    
    # Audit
    AUDIT_READ = "audit:read"
    AUDIT_ALL = "audit:*"
    
    # System
    SYSTEM_CONFIGURE = "system:configure"
    SYSTEM_BACKUP = "system:backup"
    SYSTEM_ALL = "system:*"
    
    # 2FA Bypass
    BYPASS_2FA = "auth:bypass_2fa"
    
    # All permissions
    ALL = "*"


# Role-Permission mapping - Fineract-style
ROLE_PERMISSIONS = {
    "SYSTEM_ADMIN": [
        Permission.ALL
    ],
    "BRANCH_MANAGER": [
        # User management (branch only)
        Permission.USER_READ,
        Permission.USER_CREATE,
        Permission.USER_UPDATE,
        # Members
        Permission.MEMBER_ALL,
        # Accounts
        Permission.ACCOUNT_ALL,
        # Transactions (with approval)
        Permission.TRANSACTION_DEPOSIT,
        Permission.TRANSACTION_WITHDRAW,
        Permission.TRANSACTION_TRANSFER,
        Permission.TRANSACTION_APPROVE,
        Permission.TRANSACTION_READ,
        # Loans
        Permission.LOAN_READ,
        Permission.LOAN_APPROVE,
        Permission.LOAN_DISBURSE,
        # Reports
        Permission.REPORT_READ,
        Permission.REPORT_GENERATE,
        # Audit
        Permission.AUDIT_READ,
    ],
    "TELLER": [
        # Members
        Permission.MEMBER_CREATE,
        Permission.MEMBER_READ,
        Permission.MEMBER_UPDATE,
        # Accounts (read-only)
        Permission.ACCOUNT_READ,
        # Transactions (need approval for large amounts)
        Permission.TRANSACTION_DEPOSIT,
        Permission.TRANSACTION_WITHDRAW,
        Permission.TRANSACTION_TRANSFER,
        Permission.TRANSACTION_READ,
        # Loans (read-only)
        Permission.LOAN_READ,
        # Reports (limited)
        Permission.REPORT_READ,
    ],
    "CREDIT_OFFICER": [
        # Members (read-only)
        Permission.MEMBER_READ,
        # Accounts (read-only)
        Permission.ACCOUNT_READ,
        # Loans (full access except product creation)
        Permission.LOAN_APPLY,
        Permission.LOAN_APPROVE,
        Permission.LOAN_DISBURSE,
        Permission.LOAN_REPAY,
        Permission.LOAN_READ,
        # Reports
        Permission.REPORT_READ,
    ],
    "OPS_MANAGER": [
        # User management
        Permission.USER_READ,
        # Members (read-only)
        Permission.MEMBER_READ,
        # Accounts (read-only)
        Permission.ACCOUNT_READ,
        # Transactions
        Permission.TRANSACTION_READ,
        Permission.TRANSACTION_APPROVE,
        # Loans (Product Config)
        Permission.LOAN_PRODUCT_CREATE,
        Permission.LOAN_READ,
        # Reports
        Permission.REPORT_READ,
    ],
    "OPS_DIRECTOR": [
        Permission.USER_READ,
        Permission.MEMBER_ALL,
        Permission.ACCOUNT_ALL,
        Permission.TRANSACTION_ALL,
        Permission.LOAN_ALL,
        Permission.REPORT_ALL,
        Permission.AUDIT_READ,
         Permission.SYSTEM_CONFIGURE,
    ],
    "BOARD_MEMBER": [
        Permission.USER_READ,
        Permission.MEMBER_READ,
        Permission.MEMBER_READ_SENSITIVE,
        Permission.ACCOUNT_READ,
        Permission.TRANSACTION_READ,
        Permission.LOAN_READ,
        Permission.LOAN_PRODUCT_CREATE,
        Permission.REPORT_ALL,
        Permission.AUDIT_ALL,
        Permission.SYSTEM_CONFIGURE,
    ],
    "AUDITOR": [
        # Read-only access to everything
        Permission.USER_READ,
        Permission.MEMBER_READ,
        Permission.MEMBER_READ_SENSITIVE,
        Permission.ACCOUNT_READ,
        Permission.TRANSACTION_READ,
        Permission.LOAN_READ,
        Permission.REPORT_READ,
        Permission.REPORT_GENERATE,
        Permission.REPORT_COBAC,
        Permission.AUDIT_ALL,
    ],
}


class PermissionChecker:
    """Check if user has required permissions"""
    
    @staticmethod
    def has_permission(user_permissions: List[str], required_permission: Permission) -> bool:
        """
        Check if user has a specific permission
        Supports wildcard matching (e.g., user:* matches user:create)
        """
        # Convert to strings for comparison
        user_perms = set(user_permissions)
        required = required_permission.value
        
        # Check for ALL permission
        if Permission.ALL.value in user_perms:
            return True
        
        # Direct match
        if required in user_perms:
            return True
        
        # Wildcard match (e.g., user:* matches user:create)
        resource = required.split(":")[0]
        wildcard = f"{resource}:*"
        if wildcard in user_perms:
            return True
        
        return False
    
    @staticmethod
    def has_any_permission(user_permissions: List[str], required_permissions: List[Permission]) -> bool:
        """Check if user has any of the required permissions"""
        return any(
            PermissionChecker.has_permission(user_permissions, perm)
            for perm in required_permissions
        )
    
    @staticmethod
    def has_all_permissions(user_permissions: List[str], required_permissions: List[Permission]) -> bool:
        """Check if user has all of the required permissions"""
        return all(
            PermissionChecker.has_permission(user_permissions, perm)
            for perm in required_permissions
        )
    
    @staticmethod
    def get_role_permissions(role: str) -> List[str]:
        """Get all permissions for a role"""
        return [p.value for p in ROLE_PERMISSIONS.get(role, [])]


def require_permission(permission: Permission):
    """
    Decorator/FastAPI dependency to require a specific permission
    Usage: @app.get("/endpoint", dependencies=[Depends(require_permission(Permission.MEMBER_READ))])
    """
    def permission_checker(
        request: Request,
        db: Session = Depends(get_db)
    ):
        # Get token from header
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required"
            )
        
        token = auth_header.split(" ")[1]
        payload = TokenManager.decode_token(token)
        
        if not payload:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
        
        # Get user permissions from token or database
        user_role = payload.get("role")
        user_permissions = PermissionChecker.get_role_permissions(user_role)
        
        if not PermissionChecker.has_permission(user_permissions, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {permission.value} required"
            )
        
        return True
    
    return permission_checker


def require_permissions(permissions: List[Permission], require_all: bool = True):
    """
    Require multiple permissions
    If require_all=True, user must have ALL permissions
    If require_all=False, user must have ANY permission
    """
    def permissions_checker(
        request: Request,
        db: Session = Depends(get_db)
    ):
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required"
            )
        
        token = auth_header.split(" ")[1]
        payload = TokenManager.decode_token(token)
        
        if not payload:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
        
        user_role = payload.get("role")
        user_permissions = PermissionChecker.get_role_permissions(user_role)
        
        if require_all:
            has_perm = PermissionChecker.has_all_permissions(user_permissions, permissions)
            perm_str = " and ".join([p.value for p in permissions])
        else:
            has_perm = PermissionChecker.has_any_permission(user_permissions, permissions)
            perm_str = " or ".join([p.value for p in permissions])
        
        if not has_perm:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {perm_str} required"
            )
        
        return True
    
    return permissions_checker


# Pre-built permission dependencies for common use cases
require_member_read = require_permission(Permission.MEMBER_READ)
require_member_create = require_permission(Permission.MEMBER_CREATE)
require_transaction_deposit = require_permission(Permission.TRANSACTION_DEPOSIT)
require_transaction_withdraw = require_permission(Permission.TRANSACTION_WITHDRAW)
require_transaction_approve = require_permission(Permission.TRANSACTION_APPROVE)
require_loan_approve = require_permission(Permission.LOAN_APPROVE)
require_audit_read = require_permission(Permission.AUDIT_READ)
require_report_cobac = require_permission(Permission.REPORT_COBAC)