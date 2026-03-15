"""
Database Models for MUNSCCUL Core Banking System
Implements OHADA-compliant accounting and COBAC regulatory requirements
"""
from sqlalchemy import (
    Column, Integer, String, Float, DateTime, Boolean, 
    ForeignKey, Text, Enum, Numeric, Index, UniqueConstraint
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum
from datetime import datetime
from decimal import Decimal


class UserRole(str, enum.Enum):
    """User roles for RBAC"""
    TELLER = "TELLER"
    BRANCH_MANAGER = "BRANCH_MANAGER"
    CREDIT_OFFICER = "CREDIT_OFFICER"
    SYSTEM_ADMIN = "SYSTEM_ADMIN"
    OPS_MANAGER = "OPS_MANAGER"
    OPS_DIRECTOR = "OPS_DIRECTOR"
    BOARD_MEMBER = "BOARD_MEMBER"
    AUDITOR = "AUDITOR"


class BranchStatus(str, enum.Enum):
    """Branch operational status"""
    OPEN = "OPEN"
    EOD_IN_PROGRESS = "EOD_IN_PROGRESS"
    CLOSED = "CLOSED"


class OverrideStatus(str, enum.Enum):
    """Status of a manager override request"""
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class AccountType(str, enum.Enum):
    """Types of accounts"""
    SAVINGS = "SAVINGS"
    CURRENT = "CURRENT"
    LOAN = "LOAN"
    FIXED_DEPOSIT = "FIXED_DEPOSIT"
    SHARES = "SHARES"  # COBAC: Capital/ownership shares


class TransactionType(str, enum.Enum):
    """Types of transactions"""
    DEPOSIT = "DEPOSIT"
    WITHDRAWAL = "WITHDRAWAL"
    TRANSFER = "TRANSFER"
    LOAN_DISBURSEMENT = "LOAN_DISBURSEMENT"
    LOAN_REPAYMENT = "LOAN_REPAYMENT"
    FEE = "FEE"
    INTEREST = "INTEREST"
    NJANGI_CONTRIBUTION = "NJANGI_CONTRIBUTION"
    NJANGI_PAYOUT = "NJANGI_PAYOUT"
    SHARE_PURCHASE = "SHARE_PURCHASE"
    ENTRANCE_FEE = "ENTRANCE_FEE"


class LoanStatus(str, enum.Enum):
    """Loan status workflow for Maker-Checker"""
    DRAFT = "DRAFT"
    PENDING_REVIEW = "PENDING_REVIEW"
    APPROVED_AWAITING_DISBURSEMENT = "APPROVED_AWAITING_DISBURSEMENT"
    RETURNED = "RETURNED"
    REJECTED = "REJECTED"
    ACTIVE = "ACTIVE"
    DELINQUENT = "DELINQUENT"
    CLOSED = "CLOSED"
    DEFAULTED = "DEFAULTED"


class UserApprovalStatus(str, enum.Enum):
    """User approval status for Maker-Checker"""
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class SyncStatus(str, enum.Enum):
    """Sync status for offline transactions"""
    PENDING = "PENDING"
    SYNCED = "SYNCED"
    FAILED = "FAILED"
    CONFLICT = "CONFLICT"


class QueueServiceType(str, enum.Enum):
    """QMS Service Types"""
    CASH = "CASH"
    SERVICE = "SERVICE"
    LOAN = "LOAN"


class PolicyStatus(str, enum.Enum):
    """Governance status for system policies"""
    ACTIVE = "ACTIVE"
    PROPOSED = "PROPOSED"
    ARCHIVED = "ARCHIVED"


class VaultTransferType(str, enum.Enum):
    """Types of vault/cash movements"""
    VAULT_TO_TELLER = "VAULT_TO_TELLER"
    TELLER_TO_VAULT = "TELLER_TO_VAULT"
    BANK_TO_VAULT = "BANK_TO_VAULT"
    VAULT_ADJUSTMENT = "VAULT_ADJUSTMENT"
    VAULT_TO_EXTERNAL = "VAULT_TO_EXTERNAL"
    EXTERNAL_TO_DIGITAL = "EXTERNAL_TO_DIGITAL"
    DIGITAL_TO_EXTERNAL = "DIGITAL_TO_EXTERNAL"


class TreasuryAccountType(str, enum.Enum):
    """Types of treasury liquidity pools"""
    VAULT = "VAULT"
    BANK = "BANK"
    CREDIT_UNION = "CREDIT_UNION"
    MOBILE_MONEY = "MOBILE_MONEY"


class VaultTransferStatus(str, enum.Enum):
    """Status of manual cash transfers"""
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class QueueStatus(str, enum.Enum):
    """QMS Ticket Status"""
    WAITING = "WAITING"
    SERVING = "SERVING"
    COMPLETED = "COMPLETED"
    NO_SHOW = "NO_SHOW"


class PaymentChannel(str, enum.Enum):
    """Payment channels for transactions"""
    CASH = "CASH"
    MTN_MOMO = "MTN_MOMO"
    ORANGE_MONEY = "ORANGE_MONEY"
    BANK_TRANSFER = "BANK_TRANSFER"
    BALI_CO = "BALI_CO"
    GLOVIC = "GLOVIC"
    MICROFINANCE_A = "MICROFINANCE_A"


class CycleInterval(str, enum.Enum):
    """Njangi cycle frequency"""
    WEEKLY = "WEEKLY"
    BI_WEEKLY = "BI_WEEKLY"
    MONTHLY = "MONTHLY"


class NjangiGroupStatus(str, enum.Enum):
    """Njangi group operational status"""
    DRAFT = "DRAFT"
    PENDING_KYC = "PENDING_KYC"
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    DISSOLVED = "DISSOLVED"


class CycleStatus(str, enum.Enum):
    """Status of a specific Njangi round"""
    COLLECTING = "COLLECTING"
    READY_FOR_PAYOUT = "READY_FOR_PAYOUT"
    COMPLETED = "COMPLETED"


class ContributionStatus(str, enum.Enum):
    """Status of a member's contribution to a cycle"""
    PAID_ON_TIME = "PAID_ON_TIME"
    PAID_LATE = "PAID_LATE"
    MISSED = "MISSED"


class PayoutStatus(str, enum.Enum):
    """Status of a Njangi pot disbursement"""
    PENDING = "PENDING"
    DISBURSED = "DISBURSED"
    FAILED = "FAILED"


class InsightType(str, enum.Enum):
    """Types of AI insights for Njangi management"""
    DEFAULT_WARNING = "DEFAULT_WARNING"
    STREAK_ACHIEVEMENT = "STREAK_ACHIEVEMENT"
    LIQUIDITY_RISK = "LIQUIDITY_RISK"


class IntercomEntityType(str, enum.Enum):
    """Entity types that can be attached to an intercom message"""
    TRANSACTION = "TRANSACTION"
    MEMBER_PROFILE = "MEMBER_PROFILE"
    LOAN_APP = "LOAN_APP"
    NJANGI_GROUP = "NJANGI_GROUP"
    VOICE_SIGNAL = "VOICE_SIGNAL"


class User(Base):
    """System users (Tellers, Managers, etc.)"""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100), unique=True, nullable=True)
    full_name = Column(String(100), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.TELLER, nullable=False)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    last_login = Column(DateTime, nullable=True)
    is_first_login = Column(Boolean, default=True)
    
    # PIN Reset Flow
    pin_reset_token = Column(String(100), nullable=True)
    pin_reset_token_expiry = Column(DateTime, nullable=True)
    
    # IAM & Maker-Checker
    approval_status = Column(Enum(UserApprovalStatus), default=UserApprovalStatus.PENDING)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    transaction_limit = Column(Numeric(15, 2), default=0.00)
    
    # Teller Operations
    teller_cash_limit = Column(Numeric(15, 2), default=1000000.00)
    teller_gl_account_id = Column(Integer, ForeignKey("gl_accounts.id"), nullable=True)
    teller_pin = Column(String(255), nullable=True)
    counter_number = Column(String(20), nullable=True)  # Counter or terminal assignment
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    branch = relationship("Branch", back_populates="users")
    audit_logs = relationship("AuditLog", back_populates="user")
    transactions_created = relationship("Transaction", primaryjoin="User.id == Transaction.created_by", back_populates="creator")
    transactions_approved = relationship("Transaction", primaryjoin="User.id == Transaction.approved_by", back_populates="approver")
    
    # IAM Relationships
    creator = relationship("User", remote_side=[id], foreign_keys=[created_by], backref="users_created")
    approver = relationship("User", remote_side=[id], foreign_keys=[approved_by], backref="users_approved")


class Branch(Base):
    """Branch offices"""
    __tablename__ = "branches"
    
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(10), unique=True, nullable=False)
    name = Column(String(100), nullable=False)
    address = Column(Text, nullable=True)
    city = Column(String(50), nullable=False)
    region = Column(String(50), nullable=False)
    phone = Column(String(20), nullable=True)
    email = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    
    # Security & Finance
    server_api_key = Column(String(64), unique=True, nullable=True)  # Secret API key for branch server
    gl_vault_code = Column(String(20), nullable=True)  # GL Account code for Vault Cash
    
    # Dashboard & Ops
    status = Column(Enum(BranchStatus), default=BranchStatus.OPEN, nullable=False)
    vault_cash_limit = Column(Numeric(18, 2), default=15000000.00)
    mtn_float = Column(Numeric(18, 2), default=0.00)
    orange_float = Column(Numeric(18, 2), default=0.00)
    
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    users = relationship("User", back_populates="branch")
    members = relationship("Member", back_populates="branch")


class TreasuryAccount(Base):
    """Institution liquidity accounts (Vault, Partner Banks, MoMo)"""
    __tablename__ = "treasury_accounts"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    account_type = Column(Enum(TreasuryAccountType), nullable=False)
    account_number = Column(String(50), nullable=True) # e.g. Phone number for MoMo, Account number for Bank
    
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False)
    gl_account_code = Column(String(20), ForeignKey("gl_accounts.account_code"), nullable=False)
    
    max_limit = Column(Numeric(15, 2), nullable=True) # Threshold for alerts (e.g., 5,000,000 for MoMo)
    is_active = Column(Boolean, default=True)
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    branch = relationship("Branch")
    gl_account = relationship("GLAccount", foreign_keys=[gl_account_code])


class Member(Base):
    """Credit Union Members - KYC compliant"""
    __tablename__ = "members"
    
    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(String(20), unique=True, nullable=False, index=True)
    
    # Personal Information
    first_name = Column(String(50), nullable=False)
    last_name = Column(String(50), nullable=False)
    date_of_birth = Column(DateTime, nullable=False)
    gender = Column(String(10), nullable=True)
    marital_status = Column(String(20), nullable=True)
    
    # KYC Information (COBAC compliant)
    national_id = Column(String(50), unique=True, nullable=True, index=True)
    national_id_scan_path = Column(String(255), nullable=True)
    passport_photo_path = Column(String(255), nullable=True)
    signature_scan_path = Column(String(255), nullable=True)
    
    # Contact Information
    phone_primary = Column(String(20), nullable=False)
    phone_secondary = Column(String(20), nullable=True)
    email = Column(String(100), nullable=True)
    address = Column(Text, nullable=True)
    
    # Next of Kin (Required by COBAC)
    next_of_kin_name = Column(String(100), nullable=False)
    next_of_kin_phone = Column(String(20), nullable=False)
    next_of_kin_relationship = Column(String(50), nullable=False)
    
    # Geolocation for field officers
    geo_latitude = Column(Numeric(10, 8), nullable=True)
    geo_longitude = Column(Numeric(11, 8), nullable=True)
    
    # Biometric data (for illiterate members)
    fingerprint_template = Column(Text, nullable=True)
    
    # COBAC: Income & Minor account fields
    monthly_income = Column(Numeric(15, 2), nullable=True)      # For 1/3 DSR check (C7)
    guardian_member_id = Column(Integer, ForeignKey("members.id"), nullable=True)  # For minor accounts (C11)
    is_minor = Column(Boolean, default=False)                    # Under 18 flag (C11)
    
    # Account metadata
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False)
    registered_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Behavioral Economics (Njangi Integration)
    trust_score = Column(Numeric(5, 2), default=50.00)
    on_time_streak = Column(Integer, default=0)
    ai_default_risk_flag = Column(Boolean, default=False)
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    @property
    def total_savings(self) -> Decimal:
        """Sum of all non-shares account balances"""
        return sum((a.balance for a in self.accounts if a.account_type != AccountType.SHARES), Decimal("0.00"))

    @property
    def total_shares(self) -> Decimal:
        """Sum of all shares account balances"""
        return sum((a.balance for a in self.accounts if a.account_type == AccountType.SHARES), Decimal("0.00"))

    @property
    def total_stake(self) -> Decimal:
        """Total wealth in the union (Shares + Savings)"""
        return self.total_savings + self.total_shares

    @property
    def membership_status(self) -> str:
        """Derived status based on share requirement (10,000 FCFA)"""
        # Note: Importing settings inside to avoid circular imports if any
        from app.config import settings
        if self.total_shares >= settings.MIN_SHARE_CAPITAL:
            return "FULL MEMBER"
        return "APPLICANT"

    # Relationships
    branch = relationship("Branch", back_populates="members")
    accounts = relationship("Account", back_populates="member")
    loans = relationship("Loan", back_populates="member")


class Account(Base):
    """Member Accounts - OHADA Compliant"""
    __tablename__ = "accounts"
    
    id = Column(Integer, primary_key=True, index=True)
    account_number = Column(String(20), unique=True, nullable=False, index=True)
    
    # Account classification (OHADA Chart of Accounts)
    account_class = Column(Integer, nullable=False)  # 1-9 (OHADA)
    account_category = Column(String(10), nullable=False)  # e.g., "52" for banks
    
    member_id = Column(Integer, ForeignKey("members.id"), nullable=False)
    account_type = Column(Enum(AccountType), default=AccountType.SAVINGS)
    
    # Balance tracking
    balance = Column(Numeric(15, 2), default=0.00)
    available_balance = Column(Numeric(15, 2), default=0.00)  # Excludes holds
    
    # Account settings
    interest_rate = Column(Numeric(5, 2), default=0.00)
    minimum_balance = Column(Numeric(15, 2), default=0.00)
    
    # Status
    is_active = Column(Boolean, default=True)
    is_frozen = Column(Boolean, default=False)
    frozen_reason = Column(Text, nullable=True)
    
    # COBAC: Dormancy tracking (C10)
    last_member_activity = Column(DateTime, nullable=True)  # Excludes system-generated interest
    dormancy_status = Column(String(20), default="ACTIVE")  # ACTIVE or DORMANT
    
    # Metadata
    opened_at = Column(DateTime, server_default=func.now())
    opened_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    closed_at = Column(DateTime, nullable=True)
    
    # Relationships
    member = relationship("Member", back_populates="accounts")
    transactions = relationship("Transaction", back_populates="account", primaryjoin="Account.id == Transaction.account_id")
    holds = relationship("AccountHold", back_populates="account")


class Transaction(Base):
    """Financial Transactions - Immutable Ledger"""
    __tablename__ = "transactions"
    
    id = Column(Integer, primary_key=True, index=True)
    transaction_ref = Column(String(50), unique=True, nullable=False, index=True)
    
    # Account reference
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    
    # Transaction details
    transaction_type = Column(Enum(TransactionType), nullable=False)
    amount = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(3), default="XAF")  # FCFA
    
    # Double-entry bookkeeping (OHADA)
    debit_account = Column(String(20), nullable=True)
    credit_account = Column(String(20), nullable=True)
    
    # For transfers
    destination_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    
    # Transaction description & Reporting
    description = Column(Text, nullable=True)
    payment_channel = Column(Enum(PaymentChannel), default=PaymentChannel.CASH, nullable=False)
    purpose = Column(String(50), nullable=True)  # e.g., "SAVINGS", "SHARE_CAPITAL", "SOLIDARITY_FUND"
    external_reference = Column(String(50), nullable=True)  # Mobile Money Ref, Check No
    comments = Column(Text, nullable=True)
    
    # Balance after transaction (for audit trail)
    balance_after = Column(Numeric(15, 2), nullable=False)
    
    # Approval workflow (Four-Eyes Principle)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    
    # Sync status for offline operations
    sync_status = Column(Enum(SyncStatus), default=SyncStatus.SYNCED)
    branch_origin_id = Column(Integer, ForeignKey("branches.id"), nullable=True)
    
    # Immutable timestamp
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    account = relationship("Account", primaryjoin="Transaction.account_id == Account.id", back_populates="transactions")
    destination_account = relationship("Account", primaryjoin="Transaction.destination_account_id == Account.id")
    creator = relationship("User", primaryjoin="Transaction.created_by == User.id", back_populates="transactions_created")
    approver = relationship("User", primaryjoin="Transaction.approved_by == User.id", back_populates="transactions_approved")
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_transaction_date', 'created_at'),
        Index('idx_transaction_account_date', 'account_id', 'created_at'),
    )


class DailyClosure(Base):
    """End-of-Day (EOD) Processing tracking.
    Enforces immutability: closed days cannot have new transactions posted to them.
    """
    __tablename__ = "daily_closures"
    
    id = Column(Integer, primary_key=True, index=True)
    closure_date = Column(DateTime, nullable=False, index=True)  # The day being closed
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False)
    is_closed = Column(Boolean, default=False, nullable=False)
    
    # Audit trail
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    closed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Financial summary of the day for quick access
    total_debits = Column(Numeric(15, 2), default=0.00)
    total_credits = Column(Numeric(15, 2), default=0.00)
    
    # System status checks
    teller_reconciliations_passed = Column(Boolean, default=False)
    interest_accruals_passed = Column(Boolean, default=False)
    
    __table_args__ = (
        Index('idx_daily_closure_date', 'closure_date'),
        UniqueConstraint('closure_date', 'branch_id', name='uq_closure_date_branch'),
    )
    
    closer = relationship("User", foreign_keys=[closed_by])


class TransactionOverride(Base):
    """Manager overrides for teller transactions exceeding limits"""
    __tablename__ = "transaction_overrides"
    
    id = Column(Integer, primary_key=True, index=True)
    teller_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False)
    
    amount = Column(Numeric(18, 2), nullable=False)
    transaction_type = Column(String(20), nullable=False)
    member_id = Column(Integer, ForeignKey("members.id"), nullable=True)
    
    status = Column(Enum(OverrideStatus), default=OverrideStatus.PENDING)
    requested_at = Column(DateTime, server_default=func.now())
    responded_at = Column(DateTime, nullable=True)
    
    manager_comments = Column(String(255), nullable=True)
    
    # Relationships
    teller = relationship("User", foreign_keys=[teller_id])
    manager = relationship("User", foreign_keys=[manager_id])
    branch = relationship("Branch")
    member = relationship("Member")


class VaultTransfer(Base):
    """Tracks stateful cash movements between vault, tellers, and external banks.
    Implements the Maker-Checker principle for treasury management.
    """
    __tablename__ = "vault_transfers"
    
    id = Column(Integer, primary_key=True, index=True)
    transfer_ref = Column(String(50), unique=True, nullable=False, index=True)
    transfer_type = Column(Enum(VaultTransferType), nullable=False)
    
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False)
    teller_id = Column(Integer, ForeignKey("users.id"), nullable=True) # None for BANK_TO_VAULT/ADJUSTMENT
    source_treasury_id = Column(Integer, ForeignKey("treasury_accounts.id"), nullable=True)
    destination_treasury_id = Column(Integer, ForeignKey("treasury_accounts.id"), nullable=True)
    
    amount = Column(Numeric(15, 2), nullable=False)
    status = Column(Enum(VaultTransferStatus), default=VaultTransferStatus.PENDING)
    
    description = Column(Text, nullable=True)
    
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    created_at = Column(DateTime, server_default=func.now())
    approved_at = Column(DateTime, nullable=True)
    
    # Relationships
    branch = relationship("Branch")
    teller = relationship("User", foreign_keys=[teller_id])
    creator = relationship("User", foreign_keys=[created_by])
    approver = relationship("User", foreign_keys=[approved_by])


class LoanProduct(Base):
    """Configurable loan products"""
    __tablename__ = "loan_products"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)  # e.g., "School Fees Loan"
    code = Column(String(20), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    
    # Interest configuration
    interest_rate = Column(Numeric(5, 2), nullable=False)  # Annual rate
    interest_type = Column(String(20), default="declining_balance")  # flat or declining_balance
    
    # Loan limits
    min_amount = Column(Numeric(15, 2), nullable=False)
    max_amount = Column(Numeric(15, 2), nullable=False)
    min_term_months = Column(Integer, nullable=False)
    max_term_months = Column(Integer, nullable=False)
    
    # Requirements
    requires_guarantor = Column(Boolean, default=False)
    guarantor_percentage = Column(Numeric(5, 2), default=100.00)  # % of loan amount
    
    # Accounting (GL) Mapping
    gl_portfolio_account = Column(String(50), nullable=True) # e.g. "1200"
    gl_interest_account = Column(String(50), nullable=True)  # e.g. "5100"
    gl_penalty_account = Column(String(50), nullable=True)   # e.g. "5200"
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())


class Loan(Base):
    """Loan accounts"""
    __tablename__ = "loans"
    
    id = Column(Integer, primary_key=True, index=True)
    loan_number = Column(String(20), unique=True, nullable=False, index=True)
    purpose = Column(String(100), nullable=True)
    
    member_id = Column(Integer, ForeignKey("members.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("loan_products.id"), nullable=False)
    
    # Loan terms
    principal_amount = Column(Numeric(15, 2), nullable=False)
    interest_rate = Column(Numeric(5, 2), nullable=False)
    term_months = Column(Integer, nullable=False)
    
    # Calculated values
    total_interest = Column(Numeric(15, 2), nullable=False)
    total_due = Column(Numeric(15, 2), nullable=False)  # principal + interest
    
    # Payment tracking
    amount_paid = Column(Numeric(15, 2), default=0.00)
    amount_outstanding = Column(Numeric(15, 2), nullable=False)
    
    # Status
    status = Column(Enum(LoanStatus), default=LoanStatus.DRAFT)
    delinquency_days = Column(Integer, default=0)
    
    # Dates
    application_date = Column(DateTime, server_default=func.now())
    approval_date = Column(DateTime, nullable=True)
    disbursement_date = Column(DateTime, nullable=True)
    maturity_date = Column(DateTime, nullable=True)
    last_payment_date = Column(DateTime, nullable=True)
    
    # Approval workflow
    applied_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True) # Tier 1
    tier2_approved_by = Column(Integer, ForeignKey("users.id"), nullable=True) # Tier 2
    board_approval_1_by = Column(Integer, ForeignKey("users.id"), nullable=True) # Tier 3
    board_approval_2_by = Column(Integer, ForeignKey("users.id"), nullable=True) # Tier 3
    is_insider_loan = Column(Boolean, default=False)
    ai_risk_score = Column(Float, nullable=True)
    
    # Relationships
    member = relationship("Member", back_populates="loans")
    product = relationship("LoanProduct")
    schedules = relationship("LoanSchedule", back_populates="loan")
    guarantors = relationship("LoanGuarantor", back_populates="loan")
    charges = relationship("LoanCharge", back_populates="loan")
    holds = relationship("AccountHold", back_populates="loan")


class LoanSchedule(Base):
    """Loan amortization schedule"""
    __tablename__ = "loan_schedules"
    
    id = Column(Integer, primary_key=True, index=True)
    loan_id = Column(Integer, ForeignKey("loans.id"), nullable=False)
    installment_number = Column(Integer, nullable=False)
    
    due_date = Column(DateTime, nullable=False)
    principal_amount = Column(Numeric(15, 2), nullable=False)
    interest_amount = Column(Numeric(15, 2), nullable=False)
    total_amount = Column(Numeric(15, 2), nullable=False)
    
    # Payment tracking
    principal_paid = Column(Numeric(15, 2), default=0.00)
    interest_paid = Column(Numeric(15, 2), default=0.00)
    is_paid = Column(Boolean, default=False)
    paid_at = Column(DateTime, nullable=True)
    
    # Relationships
    loan = relationship("Loan", back_populates="schedules")


class LoanGuarantor(Base):
    """Loan guarantors - freeze savings"""
    __tablename__ = "loan_guarantors"
    
    id = Column(Integer, primary_key=True, index=True)
    loan_id = Column(Integer, ForeignKey("loans.id"), nullable=False)
    member_id = Column(Integer, ForeignKey("members.id"), nullable=False)
    
    guarantee_amount = Column(Numeric(15, 2), nullable=False)
    is_released = Column(Boolean, default=False)
    released_at = Column(DateTime, nullable=True)
    
    # Relationships
    loan = relationship("Loan", back_populates="guarantors")
    member = relationship("Member")


class AccountHold(Base):
    """Lien on account for guaranteed loans"""
    __tablename__ = "account_holds"
    
    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    loan_id = Column(Integer, ForeignKey("loans.id"), nullable=False)
    
    amount = Column(Numeric(15, 2), nullable=False)
    is_active = Column(Boolean, default=True)
    
    # Metadata
    created_at = Column(DateTime, server_default=func.now())
    released_at = Column(DateTime, nullable=True)
    
    # Relationships
    account = relationship("Account", back_populates="holds")
    loan = relationship("Loan", back_populates="holds")


class AuditLog(Base):
    """Immutable audit trail - COBAC Compliance"""
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Who
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    username = Column(String(50), nullable=False)
    ip_address = Column(String(45), nullable=False)
    
    # What
    action = Column(String(50), nullable=False)  # CREATE, UPDATE, DELETE, VIEW, LOGIN, etc.
    entity_type = Column(String(50), nullable=False)  # Member, Account, Transaction, etc.
    entity_id = Column(String(50), nullable=True)
    
    # Details
    old_values = Column(Text, nullable=True)  # JSON
    new_values = Column(Text, nullable=True)  # JSON
    description = Column(Text, nullable=True)
    
    # When - Immutable
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    user = relationship("User", back_populates="audit_logs")
    
    # Indexes for compliance queries
    __table_args__ = (
        Index('idx_audit_user', 'user_id', 'created_at'),
        Index('idx_audit_entity', 'entity_type', 'entity_id'),
        Index('idx_audit_action', 'action', 'created_at'),
    )


class OfflineQueue(Base):
    """Queue for offline transactions waiting to sync"""
    __tablename__ = "offline_queue"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Transaction data (serialized)
    transaction_type = Column(String(50), nullable=False)
    payload = Column(Text, nullable=False)  # JSON
    
    # Origin
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Sync status
    status = Column(Enum(SyncStatus), default=SyncStatus.PENDING)
    retry_count = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    synced_at = Column(DateTime, nullable=True)


class CobacReport(Base):
    """COBAC regulatory reports"""
    __tablename__ = "cobac_reports"
    
    id = Column(Integer, primary_key=True, index=True)
    report_type = Column(String(50), nullable=False)  # liquidity, risk, etc.
    report_period = Column(String(20), nullable=False)  # YYYY-MM
    
    # Report file
    file_path = Column(String(255), nullable=False)
    file_format = Column(String(10), nullable=False)  # PDF, Excel
    
    # Status
    generated_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    generated_at = Column(DateTime, server_default=func.now())
    submitted_to_cobac = Column(Boolean, default=False)
    submitted_at = Column(DateTime, nullable=True)
    
    # Checksum for integrity
    checksum = Column(String(64), nullable=False)


class RefreshToken(Base):
    """Refresh tokens for JWT authentication - Fineract-compliant"""
    __tablename__ = "refresh_tokens"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    
    # Token metadata
    created_at = Column(DateTime, server_default=func.now())
    expires_at = Column(DateTime, nullable=False, index=True)
    last_used_at = Column(DateTime, nullable=True)
    
    # Revocation
    is_revoked = Column(Boolean, default=False, index=True)
    revoked_at = Column(DateTime, nullable=True)
    revoked_reason = Column(String(100), nullable=True)
    
    # Device info for tracking
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(255), nullable=True)
    
    __table_args__ = (
        Index('idx_refresh_token_user', 'user_id', 'is_revoked'),
        Index('idx_refresh_token_expiry', 'expires_at', 'is_revoked'),
    )


class LoginAttempt(Base):
    """Track login attempts for brute force protection - Fineract-compliant"""
    __tablename__ = "login_attempts"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), nullable=False, index=True)
    ip_address = Column(String(45), nullable=False, index=True)
    success = Column(Boolean, nullable=False)
    attempted_at = Column(DateTime, server_default=func.now(), index=True)
    
    # Additional info
    user_agent = Column(String(255), nullable=True)
    failure_reason = Column(String(100), nullable=True)
    
    __table_args__ = (
        Index('idx_login_attempt_user_time', 'username', 'attempted_at'),
        Index('idx_login_attempt_ip_time', 'ip_address', 'attempted_at'),
    )


class TwoFactorAuth(Base):
    """Two-factor authentication settings - Fineract-compliant"""
    __tablename__ = "two_factor_auth"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    
    # 2FA settings
    is_enabled = Column(Boolean, default=False)
    method = Column(String(20), default="totp")  # totp, sms, email
    
    # TOTP secret (encrypted)
    secret_encrypted = Column(String(255), nullable=True)
    
    # Backup codes (hashed)
    backup_codes = Column(Text, nullable=True)  # JSON array of hashed codes
    
    # Verification
    verified_at = Column(DateTime, nullable=True)
    last_used_at = Column(DateTime, nullable=True)
    
    # Created
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class TwoFactorOTP(Base):
    """Temporary OTP codes for 2FA - Fineract-compliant"""
    __tablename__ = "two_factor_otp"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    # OTP code (hashed)
    code_hash = Column(String(64), nullable=False)
    
    # Delivery method
    delivery_method = Column(String(20), nullable=False)  # sms, email
    delivery_destination = Column(String(100), nullable=True)
    
    # Expiry
    created_at = Column(DateTime, server_default=func.now())
    expires_at = Column(DateTime, nullable=False, index=True)
    
    # Usage
    is_used = Column(Boolean, default=False)
    used_at = Column(DateTime, nullable=True)
    
    __table_args__ = (
        Index('idx_2fa_otp_user', 'user_id', 'is_used'),
    )


class PasswordHistory(Base):
    """Track password history to prevent reuse - Fineract-compliant"""
    __tablename__ = "password_history"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    changed_at = Column(DateTime, server_default=func.now())
    
    __table_args__ = (
        Index('idx_password_history_user', 'user_id', 'changed_at'),
    )


class IntercomMessage(Base):
    """Secure Internal Intercom Chat (WORM storage)"""
    __tablename__ = "intercom_messages"
    
    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # receiver_id is NULL for Broadcast messages
    receiver_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    
    content = Column(Text, nullable=False)
    
    # Context Attachment (Optional)
    attached_entity_type = Column(Enum(IntercomEntityType), nullable=True)
    attached_entity_id = Column(String(50), nullable=True)
    
    timestamp = Column(DateTime, server_default=func.now(), index=True)
    read_status = Column(Boolean, default=False)
    
    # Relationships
    sender = relationship("User", foreign_keys=[sender_id])
    receiver = relationship("User", foreign_keys=[receiver_id])
    
    __table_args__ = (
        Index('idx_intercom_sender_receiver', 'sender_id', 'receiver_id', 'timestamp'),
    )


class ApiKey(Base):
    """API keys for service-to-service authentication"""
    __tablename__ = "api_keys"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    key_hash = Column(String(64), unique=True, nullable=False, index=True)
    
    # Permissions
    permissions = Column(Text, nullable=False)  # JSON array of permissions
    
    # Status
    is_active = Column(Boolean, default=True)
    expires_at = Column(DateTime, nullable=True)
    
    # Usage tracking
    last_used_at = Column(DateTime, nullable=True)
    use_count = Column(Integer, default=0)
    
    # Created
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    revoked_at = Column(DateTime, nullable=True)
    revoked_reason = Column(String(100), nullable=True)


# =============================================================================
# EVENT SYSTEM MODELS - Fineract-style Event Sourcing
# =============================================================================

class EventStore(Base):
    """Event Store - Immutable event log for event sourcing"""
    __tablename__ = "event_store"
    
    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(String(36), unique=True, nullable=False, index=True)
    event_type = Column(String(50), nullable=False, index=True)
    entity_type = Column(String(50), nullable=False, index=True)
    entity_id = Column(String(50), nullable=False, index=True)
    
    # Event payload
    payload = Column(Text, nullable=False)  # JSON
    
    # Metadata
    tenant_id = Column(String(50), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Timestamp
    created_at = Column(DateTime, server_default=func.now(), index=True)
    
    __table_args__ = (
        Index('idx_event_entity', 'entity_type', 'entity_id'),
        Index('idx_event_type_time', 'event_type', 'created_at'),
    )


class Webhook(Base):
    """Webhooks for external integrations (MTN/Orange MoMo, SMS, etc.)"""
    __tablename__ = "webhooks"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    url = Column(String(500), nullable=False)
    
    # Events to subscribe to
    event_types = Column(Text, nullable=False)  # JSON array of EventType values
    
    # Security
    secret = Column(String(255), nullable=True)  # For HMAC signature
    
    # Status
    is_active = Column(Boolean, default=True)
    
    # Retry configuration
    max_retries = Column(Integer, default=3)
    retry_interval_seconds = Column(Integer, default=60)
    
    # Created
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    logs = relationship("WebhookLog", back_populates="webhook")


class WebhookLog(Base):
    """Log of webhook delivery attempts"""
    __tablename__ = "webhook_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    webhook_id = Column(Integer, ForeignKey("webhooks.id"), nullable=False, index=True)
    event_id = Column(String(36), nullable=False, index=True)
    event_type = Column(String(50), nullable=False)
    
    # Request/Response
    payload = Column(Text, nullable=False)
    response_status = Column(Integer, nullable=True)
    response_body = Column(Text, nullable=True)
    
    # Result
    success = Column(Boolean, nullable=False)
    error_message = Column(Text, nullable=True)
    
    # Timestamp
    created_at = Column(DateTime, server_default=func.now(), index=True)
    
    # Relationships
    webhook = relationship("Webhook", back_populates="logs")
    
    __table_args__ = (
        Index('idx_webhook_log_webhook', 'webhook_id', 'created_at'),
    )


# =============================================================================
# SCHEDULER MODELS - Fineract-style Job Scheduling
# =============================================================================

class ScheduledJobRun(Base):
    """Log of scheduled job executions"""
    __tablename__ = "scheduled_job_runs"
    
    id = Column(Integer, primary_key=True, index=True)
    job_type = Column(String(50), nullable=False, index=True)
    params = Column(Text, nullable=True)  # JSON
    
    # Execution
    status = Column(String(20), nullable=False)  # pending, running, completed, failed
    started_at = Column(DateTime, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    
    # Result
    result = Column(Text, nullable=True)  # JSON
    error_message = Column(Text, nullable=True)
    
    __table_args__ = (
        Index('idx_job_run_type_time', 'job_type', 'started_at'),
    )


# =============================================================================
# ACCOUNTING MODELS - Fineract-style GL Accounting
# =============================================================================

class GLAccount(Base):
    """General Ledger Accounts - OHADA Compliant"""
    __tablename__ = "gl_accounts"
    
    id = Column(Integer, primary_key=True, index=True)
    account_code = Column(String(20), unique=True, nullable=False, index=True)
    account_name = Column(String(100), nullable=False)
    
    # OHADA Classification
    account_class = Column(Integer, nullable=False)  # 1-9
    account_category = Column(String(10), nullable=False)  # e.g., "52"
    
    # Account Type
    account_type = Column(String(20), nullable=False)  # ASSET, LIABILITY, EQUITY, INCOME, EXPENSE
    
    # Usage
    usage = Column(String(20), default="DETAIL")  # HEADER, DETAIL
    
    # Parent for hierarchical structure
    parent_id = Column(Integer, ForeignKey("gl_accounts.id"), nullable=True)
    
    # Manual entries allowed
    manual_entries_allowed = Column(Boolean, default=True)
    
    # Description
    description = Column(Text, nullable=True)
    
    # Status
    is_active = Column(Boolean, default=True)
    
    # Created
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    parent = relationship("GLAccount", remote_side=[id])
    children = relationship("GLAccount", back_populates="parent")


class GLJournalEntry(Base):
    """General Ledger Journal Entries - Double Entry Bookkeeping"""
    __tablename__ = "gl_journal_entries"
    
    id = Column(Integer, primary_key=True, index=True)
    entry_date = Column(DateTime, nullable=False, index=True)
    
    # Transaction reference
    transaction_id = Column(String(50), nullable=True, index=True)
    transaction_type = Column(String(50), nullable=False)
    
    # Account
    gl_account_id = Column(Integer, ForeignKey("gl_accounts.id"), nullable=False, index=True)
    
    # Amount
    amount = Column(Numeric(15, 2), nullable=False)
    entry_type = Column(String(10), nullable=False)  # DEBIT or CREDIT
    
    # Currency
    currency = Column(String(3), default="XAF")
    
    # Description
    description = Column(Text, nullable=True)
    
    # Reconciliation
    is_reconciled = Column(Boolean, default=False)
    reconciled_at = Column(DateTime, nullable=True)
    
    # Created
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    gl_account = relationship("GLAccount")
    
    __table_args__ = (
        Index('idx_gl_entry_date', 'entry_date'),
        Index('idx_gl_entry_account', 'gl_account_id', 'entry_date'),
    )


class AccountingRule(Base):
    """Accounting Rules - Map transactions to GL accounts"""
    __tablename__ = "accounting_rules"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    
    # Transaction type this rule applies to
    transaction_type = Column(String(50), nullable=False, index=True)
    
    # GL Accounts
    debit_account_id = Column(Integer, ForeignKey("gl_accounts.id"), nullable=False)
    credit_account_id = Column(Integer, ForeignKey("gl_accounts.id"), nullable=False)
    
    # Status
    is_active = Column(Boolean, default=True)
    
    # Created
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    debit_account = relationship("GLAccount", foreign_keys=[debit_account_id])
    credit_account = relationship("GLAccount", foreign_keys=[credit_account_id])


# =============================================================================
# CHARGES & FEES MODELS - Fineract-style Charges
# =============================================================================

class ChargeTime(str, enum.Enum):
    """When to apply charge"""
    DISBURSEMENT = "disbursement"
    SPECIFIED_DUE_DATE = "specified_due_date"
    INSTALLMENT_FEE = "installment_fee"
    OVERDUE_INSTALLMENT_FEE = "overdue_installment_fee"
    WITHDRAWAL_FEE = "withdrawal_fee"
    ANNUAL_FEE = "annual_fee"
    MONTHLY_FEE = "monthly_fee"
    WEEKLY_FEE = "weekly_fee"
    ACTIVATION = "activation"
    CLOSE = "close"


class ChargeCalculationType(str, enum.Enum):
    """How to calculate charge amount"""
    FLAT = "flat"
    PERCENT_OF_AMOUNT = "percent_of_amount"
    PERCENT_OF_AMOUNT_AND_INTEREST = "percent_of_amount_and_interest"


class Charge(Base):
    """Charge/Fee Configuration"""
    __tablename__ = "charges"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    charge_code = Column(String(20), unique=True, nullable=False)
    
    # Charge applies to
    charge_applies_to = Column(String(20), nullable=False)  # LOAN, SAVINGS, CLIENT
    
    # Timing
    charge_time = Column(Enum(ChargeTime), nullable=False)
    
    # Calculation
    charge_calculation_type = Column(Enum(ChargeCalculationType), nullable=False)
    amount = Column(Numeric(15, 2), nullable=False)
    
    # Percentage (if applicable)
    percentage = Column(Numeric(5, 2), nullable=True)
    
    # Currency
    currency = Column(String(3), default="XAF")
    
    # Optional settings
    is_penalty = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    is_deleted = Column(Boolean, default=False)
    
    # GL Account for accounting
    gl_account_id = Column(Integer, ForeignKey("gl_accounts.id"), nullable=True)
    
    # Tax settings
    tax_inclusive = Column(Boolean, default=False)
    
    # Created
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class LoanCharge(Base):
    """Charges applied to loans"""
    __tablename__ = "loan_charges"
    
    id = Column(Integer, primary_key=True, index=True)
    loan_id = Column(Integer, ForeignKey("loans.id"), nullable=False, index=True)
    charge_id = Column(Integer, ForeignKey("charges.id"), nullable=False)
    
    # Amount
    amount = Column(Numeric(15, 2), nullable=False)
    amount_paid = Column(Numeric(15, 2), default=0)
    amount_outstanding = Column(Numeric(15, 2), nullable=False)
    
    # Status
    is_paid = Column(Boolean, default=False)
    is_waived = Column(Boolean, default=False)
    
    # Due date
    due_date = Column(DateTime, nullable=True)
    
    # Created
    created_at = Column(DateTime, server_default=func.now())
    paid_at = Column(DateTime, nullable=True)
    
    # Relationships
    loan = relationship("Loan", back_populates="charges")
    charge = relationship("Charge")


# Update Loan model to include charges relationship
# This is done in the back_populates above


# =============================================================================
# STANDING INSTRUCTIONS MODELS - Fineract-style Recurring Transfers
# =============================================================================

class StandingInstruction(Base):
    """Standing Instructions - Recurring transfers"""
    __tablename__ = "standing_instructions"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    
    # From account
    from_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    
    # To account
    to_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    
    # Amount
    amount = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(3), default="XAF")
    
    # Recurrence
    recurrence_type = Column(String(20), nullable=False)  # daily, weekly, monthly
    recurrence_interval = Column(Integer, default=1)  # Every N days/weeks/months
    
    # Schedule
    next_execution_date = Column(DateTime, nullable=False, index=True)
    
    # Validity
    valid_from = Column(DateTime, nullable=False)
    valid_to = Column(DateTime, nullable=True)
    
    # Execution tracking
    execution_count = Column(Integer, default=0)
    failure_count = Column(Integer, default=0)
    last_executed_at = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)
    
    # Status
    is_active = Column(Boolean, default=True)
    
    # Created
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


# =============================================================================
# HOLIDAY & WORKING DAYS MODELS
# =============================================================================

class Holiday(Base):
    """Holidays - Non-working days"""
    __tablename__ = "holidays"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    
    # Date range
    from_date = Column(DateTime, nullable=False)
    to_date = Column(DateTime, nullable=False)
    
    # Repayment rescheduling
    repayments_rescheduled_to = Column(DateTime, nullable=True)
    
    # Status
    is_active = Column(Boolean, default=True)
    
    # Created
    created_at = Column(DateTime, server_default=func.now())


class WorkingDays(Base):
    """Working days configuration"""
    __tablename__ = "working_days"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Which days are working days (0=Monday, 6=Sunday)
    monday = Column(Boolean, default=True)
    tuesday = Column(Boolean, default=True)
    wednesday = Column(Boolean, default=True)
    thursday = Column(Boolean, default=True)
    friday = Column(Boolean, default=True)
    saturday = Column(Boolean, default=False)
    sunday = Column(Boolean, default=False)
    
    # Repayment rescheduling rule
    repayment_rescheduling_rule = Column(String(50), default="same_day")  # same_day, move_to_next_working_day
    
    # Extend term for holidays
    extend_term_for_holidays = Column(Boolean, default=True)


# =============================================================================
# CURRENCY MODELS - Multi-currency Support
# =============================================================================

class Currency(Base):
    """Currency configuration"""
    __tablename__ = "currencies"
    
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(3), unique=True, nullable=False)  # XAF, USD, EUR
    name = Column(String(50), nullable=False)
    
    # Decimal places
    decimal_places = Column(Integer, default=0)  # FCFA has 0 decimal places
    
    # Display
    display_symbol = Column(String(10), nullable=False)  # FCFA, $, €
    name_code = Column(String(50), nullable=False)  # currency.XAF
    
    # Position
    display_label = Column(String(50), default="symbol")  # symbol, code
    
    # Status
    is_active = Column(Boolean, default=True)
    is_base_currency = Column(Boolean, default=False)
    
    # Exchange rate (to base currency)
    exchange_rate = Column(Numeric(15, 6), default=1.0)
    rate_updated_at = Column(DateTime, nullable=True)
    
    # Created
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


# =============================================================================
# TELLER MANAGEMENT MODELS
# =============================================================================

class TellerStatus(str, enum.Enum):
    """Teller status"""
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    PENDING = "PENDING"


class Teller(Base):
    """Teller/Cashier Management"""
    __tablename__ = "tellers"
    
    id = Column(Integer, primary_key=True, index=True)
    teller_code = Column(String(20), unique=True, nullable=False)
    
    # User
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    
    # Branch
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False)
    
    # Status
    status = Column(Enum(TellerStatus), default=TellerStatus.PENDING)
    
    # Cash limits
    cash_limit = Column(Numeric(15, 2), default=0)  # Maximum cash teller can hold
    
    # Created
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    user = relationship("User")
    branch = relationship("Branch")
    transactions = relationship("TellerTransaction", back_populates="teller")



class QueueTicket(Base):
    """Branch Queue Management System Tickets"""
    __tablename__ = "queue_tickets"

    id = Column(Integer, primary_key=True, index=True)
    ticket_number = Column(String(10), nullable=False, index=True)
    service_type = Column(Enum(QueueServiceType), nullable=False)
    status = Column(Enum(QueueStatus), default=QueueStatus.WAITING, nullable=False)
    is_vip = Column(Boolean, default=False)
    
    issued_at = Column(DateTime, default=datetime.utcnow)
    called_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    handled_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    counter_number = Column(String(20), nullable=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False)

    # Relationships
    user = relationship("User", foreign_keys=[handled_by_user_id])
    branch = relationship("Branch")


class TellerTransaction(Base):
    """Teller cash transactions"""
    __tablename__ = "teller_transactions"
    
    id = Column(Integer, primary_key=True, index=True)
    teller_id = Column(Integer, ForeignKey("tellers.id"), nullable=False, index=True)
    
    # Transaction type
    transaction_type = Column(String(20), nullable=False)  # ALLOCATION, CASH_IN, CASH_OUT, SETTLEMENT
    
    # Amount
    amount = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(3), default="XAF")
    
    # Balance after
    balance_after = Column(Numeric(15, 2), nullable=False)
    
    # Related transaction
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=True)
    
    # Description
    description = Column(Text, nullable=True)
    
    # Created
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    teller = relationship("Teller", back_populates="transactions")
    transaction = relationship("Transaction")


# =============================================================================
# DATA TABLES MODELS - Custom Fields (Fineract-style)
# =============================================================================

class DataTable(Base):
    """Custom data tables for extending entities"""
    __tablename__ = "data_tables"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    
    # Which entity this table extends
    entity_type = Column(String(50), nullable=False)  # member, loan, account, etc.
    
    # Description
    description = Column(Text, nullable=True)
    
    # Columns definition (JSON)
    columns = Column(Text, nullable=False)  # JSON array of column definitions
    
    # Status
    is_active = Column(Boolean, default=True)
    
    # Created
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class DataTableEntry(Base):
    """Entries in custom data tables"""
    __tablename__ = "data_table_entries"
    
    id = Column(Integer, primary_key=True, index=True)
    data_table_id = Column(Integer, ForeignKey("data_tables.id"), nullable=False)
    
    # Entity reference
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(String(50), nullable=False)
    
    # Data (JSON)
    data = Column(Text, nullable=False)  # JSON object with column values
    
    # Created
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    __table_args__ = (
        Index('idx_data_table_entity', 'entity_type', 'entity_id'),
    )


# =============================================================================
# MOBILE MONEY INTEGRATION MODELS
# =============================================================================

class MobileMoneyProvider(str, enum.Enum):
    """Mobile money providers"""
    MTN_MOMO = "MTN_MOMO"
    ORANGE_MONEY = "ORANGE_MONEY"
    AFRICELL_MONEY = "AFRICELL_MONEY"


class MobileMoneyTransaction(Base):
    """Mobile money transactions"""
    __tablename__ = "mobile_money_transactions"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Provider
    provider = Column(Enum(MobileMoneyProvider), nullable=False, index=True)
    
    # External reference
    external_transaction_id = Column(String(100), nullable=True, index=True)
    external_reference = Column(String(100), nullable=True)
    
    # Transaction type
    transaction_type = Column(String(20), nullable=False)  # DEPOSIT, WITHDRAWAL, TRANSFER
    
    # Account reference
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    
    # Phone number
    phone_number = Column(String(20), nullable=False)
    
    # Amount
    amount = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(3), default="XAF")
    
    # Fees
    provider_fee = Column(Numeric(15, 2), default=0)
    platform_fee = Column(Numeric(15, 2), default=0)
    
    # Status
    status = Column(String(20), default="PENDING")  # PENDING, PROCESSING, COMPLETED, FAILED
    
    # Response
    provider_response = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    
    # Related internal transaction
    internal_transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    completed_at = Column(DateTime, nullable=True)
    
    __table_args__ = (
        Index('idx_mm_provider_status', 'provider', 'status'),
        Index('idx_mm_phone', 'phone_number'),
    )


class MobileMoneyConfig(Base):
    """Mobile money provider configuration"""
    __tablename__ = "mobile_money_configs"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Provider
    provider = Column(Enum(MobileMoneyProvider), unique=True, nullable=False)
    
    # API Configuration
    api_base_url = Column(String(255), nullable=False)
    api_key = Column(String(255), nullable=True)
    api_secret = Column(String(255), nullable=True)
    
    # Collection/Disbursement settings
    collection_enabled = Column(Boolean, default=True)
    disbursement_enabled = Column(Boolean, default=True)
    
    # Fee configuration
    fee_percentage = Column(Numeric(5, 2), default=0)
    fee_fixed = Column(Numeric(15, 2), default=0)
    
    # Limits
    min_amount = Column(Numeric(15, 2), default=100)
    max_amount = Column(Numeric(15, 2), default=500000)
    
    # Status
    is_active = Column(Boolean, default=True)
    
    # Created
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class TellerReconciliation(Base):
    """Blind EOD Teller Reconciliation"""
    __tablename__ = "teller_reconciliations"
    
    id = Column(Integer, primary_key=True, index=True)
    teller_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False)
    
    # Financial fields - CASH
    declared_amount = Column(Numeric(15, 2), nullable=False)
    system_expected_amount = Column(Numeric(15, 2), nullable=False)
    variance_amount = Column(Numeric(15, 2), nullable=False)
    
    # Financial fields - DIGITAL FLOAT (MTN MoMo)
    declared_momo_balance = Column(Numeric(15, 2), nullable=False, default=0.00)
    system_expected_momo_balance = Column(Numeric(15, 2), nullable=False, default=0.00)
    momo_variance = Column(Numeric(15, 2), nullable=False, default=0.00)
    
    # Financial fields - DIGITAL FLOAT (ORANGE MONEY)
    declared_om_balance = Column(Numeric(15, 2), nullable=False, default=0.00)
    system_expected_om_balance = Column(Numeric(15, 2), nullable=False, default=0.00)
    om_variance = Column(Numeric(15, 2), nullable=False, default=0.00)
    
    # Denominations (JSON formatting for counts)
    denominations = Column(Text, nullable=True)
    
    # Status
    status = Column(String(20), default="PENDING_REVIEW")
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    notes = Column(Text, nullable=True)
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    teller = relationship("User", foreign_keys=[teller_id])
    reviewer = relationship("User", foreign_keys=[reviewed_by])
    branch = relationship("Branch")


class NjangiGroup(Base):
    """Njangi (Tontine) Group - Informal Savings digitization"""
    __tablename__ = "njangi_groups"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    
    contribution_amount = Column(Numeric(15, 2), nullable=False)
    cycle_frequency = Column(Enum(CycleInterval), default=CycleInterval.MONTHLY)
    
    # The escrow GL account where funds are safely held
    escrow_gl_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    
    president_id = Column(Integer, ForeignKey("members.id"), nullable=False)
    status = Column(Enum(NjangiGroupStatus), default=NjangiGroupStatus.DRAFT)
    
    # KYC & AML Compliance Documents (OHADA)
    bylaws_url = Column(String(255), nullable=True)
    meeting_minutes_url = Column(String(255), nullable=True)
    executive_signatories = Column(Text, nullable=True)  # JSON holding President, Secretary, Treasurer details
    
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    memberships = relationship("NjangiMembership", back_populates="group")
    cycles = relationship("NjangiCycle", back_populates="group")
    escrow_account = relationship("Account")
    president = relationship("Member", foreign_keys=[president_id])


class NjangiMembership(Base):
    """Junction between Member and NjangiGroup with behavioral metrics"""
    __tablename__ = "njangi_memberships"
    
    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("njangi_groups.id"), nullable=False)
    member_id = Column(Integer, ForeignKey("members.id"), nullable=False)
    
    payout_order = Column(Integer) # The order in which they receive the pot
    on_time_streak = Column(Integer, default=0)
    trust_score = Column(Numeric(5, 2), default=50.00)
    ai_default_risk_flag = Column(Boolean, default=False)
    
    joined_at = Column(DateTime, server_default=func.now())
    is_active = Column(Boolean, default=True)
    
    # Relationships
    group = relationship("NjangiGroup", back_populates="memberships")
    member = relationship("Member")


class NjangiCycle(Base):
    """A specific "round" of the Njangi"""
    __tablename__ = "njangi_cycles"
    
    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("njangi_groups.id"), nullable=False)
    cycle_number = Column(Integer, nullable=False)
    
    recipient_member_id = Column(Integer, ForeignKey("members.id"), nullable=False)
    
    start_date = Column(DateTime, nullable=False)
    due_date = Column(DateTime, nullable=False)
    
    pot_target_amount = Column(Numeric(15, 2), nullable=False)
    current_pot_amount = Column(Numeric(15, 2), default=0)
    
    status = Column(Enum(CycleStatus), default=CycleStatus.COLLECTING)
    
    # Relationships
    group = relationship("NjangiGroup", back_populates="cycles")
    recipient = relationship("Member")
    contributions = relationship("NjangiContribution", back_populates="cycle")
    payout = relationship("NjangiPayout", back_populates="cycle", uselist=False)


class NjangiContribution(Base):
    """Individual payments towards a Njangi cycle"""
    __tablename__ = "njangi_contributions"
    
    id = Column(Integer, primary_key=True, index=True)
    cycle_id = Column(Integer, ForeignKey("njangi_cycles.id"), nullable=False)
    member_id = Column(Integer, ForeignKey("members.id"), nullable=False)
    
    amount_paid = Column(Numeric(15, 2), nullable=False)
    payment_channel = Column(Enum(PaymentChannel), default=PaymentChannel.CASH)
    
    status = Column(Enum(ContributionStatus), default=ContributionStatus.PAID_ON_TIME)
    
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    cycle = relationship("NjangiCycle", back_populates="contributions")
    member = relationship("Member")
    transaction = relationship("Transaction")


class NjangiPayout(Base):
    """The automated disbursement from the Njangi Escrow to a Member wallet"""
    __tablename__ = "njangi_payouts"
    
    id = Column(Integer, primary_key=True, index=True)
    cycle_id = Column(Integer, ForeignKey("njangi_cycles.id"), nullable=False)
    recipient_member_id = Column(Integer, ForeignKey("members.id"), nullable=False)
    
    amount_disbursed = Column(Numeric(15, 2), nullable=False)
    destination_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    
    status = Column(Enum(PayoutStatus), default=PayoutStatus.PENDING)
    
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=True)
    disbursed_at = Column(DateTime, nullable=True)
    
    # Relationships
    cycle = relationship("NjangiCycle", back_populates="payout")
    recipient = relationship("Member")
    destination_account = relationship("Account")
    transaction = relationship("Transaction")


class NjangiAIInsight(Base):
    """AI-powered secretarial alerts for Njangi risk management"""
    __tablename__ = "njangi_ai_insights"
    
    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("njangi_groups.id"), nullable=False)
    member_id = Column(Integer, ForeignKey("members.id"), nullable=True)
    
    insight_type = Column(Enum(InsightType))
    message = Column(Text, nullable=False)
    
    is_acknowledged = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    group = relationship("NjangiGroup")
    member = relationship("Member")


class GlobalPolicy(Base):
    """
    Dynamic system policies that override config.py defaults.
    Enforces Board Governance via Maker-Checker.
    """
    __tablename__ = "global_policies"
    
    id = Column(Integer, primary_key=True, index=True)
    policy_key = Column(String(50), index=True, nullable=False)
    policy_value = Column(String(255), nullable=False) # Store as string, parse as needed
    
    status = Column(Enum(PolicyStatus), default=PolicyStatus.PROPOSED, nullable=False)
    effective_date = Column(DateTime, server_default=func.now())
    version = Column(Integer, default=1)
    
    proposed_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    approved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    change_reason = Column(Text, nullable=True)
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    proposed_by = relationship("User", foreign_keys=[proposed_by_id])
    approved_by = relationship("User", foreign_keys=[approved_by_id])

    __table_args__ = (
        # Ensure only one active version per policy key
        Index('ix_active_policy', policy_key, status, unique=True, postgresql_where=(status == 'ACTIVE')),
    )