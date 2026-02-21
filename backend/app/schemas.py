"""
Pydantic Schemas for Request/Response Validation
"""
from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from decimal import Decimal
from enum import Enum


# ============== ENUMS ==============
class QueueServiceType(str, Enum):
    CASH = "CASH"
    SERVICE = "SERVICE"
    LOAN = "LOAN"


class QueueStatus(str, Enum):
    WAITING = "WAITING"
    SERVING = "SERVING"
    COMPLETED = "COMPLETED"
    NO_SHOW = "NO_SHOW"


class UserRole(str, Enum):
    TELLER = "TELLER"
    BRANCH_MANAGER = "BRANCH_MANAGER"
    CREDIT_OFFICER = "CREDIT_OFFICER"
    SYSTEM_ADMIN = "SYSTEM_ADMIN"
    OPS_MANAGER = "OPS_MANAGER"
    OPS_DIRECTOR = "OPS_DIRECTOR"
    BOARD_MEMBER = "BOARD_MEMBER"
    AUDITOR = "AUDITOR"


class AccountType(str, Enum):
    SAVINGS = "SAVINGS"
    CURRENT = "CURRENT"
    LOAN = "LOAN"
    FIXED_DEPOSIT = "FIXED_DEPOSIT"
    SHARES = "SHARES"


class TransactionType(str, Enum):
    DEPOSIT = "DEPOSIT"
    WITHDRAWAL = "WITHDRAWAL"
    TRANSFER = "TRANSFER"
    LOAN_DISBURSEMENT = "LOAN_DISBURSEMENT"
    LOAN_REPAYMENT = "LOAN_REPAYMENT"
    FEE = "FEE"
    INTEREST = "INTEREST"


class LoanStatus(str, Enum):
    DRAFT = "DRAFT"
    PENDING_REVIEW = "PENDING_REVIEW"
    APPROVED_AWAITING_DISBURSEMENT = "APPROVED_AWAITING_DISBURSEMENT"
    RETURNED = "RETURNED"
    REJECTED = "REJECTED"
    ACTIVE = "ACTIVE"
    DELINQUENT = "DELINQUENT"
    CLOSED = "CLOSED"
    DEFAULTED = "DEFAULTED"


# ============== USER SCHEMAS ==============
class UserApprovalStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class UserBase(BaseModel):
    username: str
    email: Optional[str] = None
    full_name: str
    role: UserRole
    branch_id: Optional[int] = None
    is_active: bool = True
    approval_status: Optional[UserApprovalStatus] = UserApprovalStatus.PENDING
    transaction_limit: Optional[Decimal] = Decimal("0.00")

    @validator('email', pre=True, always=True)
    def empty_string_to_none(cls, v):
        if v == "":
            return None
        return v


class UserCreate(UserBase):
    password: str = Field(..., min_length=8)


class UserUpdate(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    branch_id: Optional[int] = None
    is_active: Optional[bool] = None
    approval_status: Optional[UserApprovalStatus] = None

    @validator('email', pre=True, always=True)
    def empty_string_to_none(cls, v):
        if v == "":
            return None
        return v


class UserResponse(UserBase):
    id: int
    last_login: Optional[datetime]
    created_at: datetime
    approval_status: Optional[UserApprovalStatus]
    created_by: Optional[int] = None
    approved_by: Optional[int] = None
    transaction_limit: Decimal
    
    class Config:
        from_attributes = True


class UserLogin(BaseModel):
    username: str
    password: str
    
    
class UserApprovalRequest(BaseModel):
    approve: bool
    transaction_limit: Optional[Decimal] = Field(default=Decimal("0.00"), ge=0)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


# ============== BRANCH SCHEMAS ==============
class BranchBase(BaseModel):
    code: str
    name: str
    address: Optional[str] = None
    city: str
    region: str
    phone: Optional[str] = None
    email: Optional[str] = None


class BranchCreate(BranchBase):
    pass


class BranchResponse(BranchBase):
    id: int
    is_active: bool
    created_at: datetime
    server_api_key: Optional[str] = None
    gl_vault_code: Optional[str] = None
    
    class Config:
        from_attributes = True


# ============== MEMBER SCHEMAS ==============
class MemberBase(BaseModel):
    first_name: str
    last_name: str
    date_of_birth: date
    gender: Optional[str] = None
    marital_status: Optional[str] = None
    
    # KYC
    national_id: Optional[str] = None
    passport_photo_path: Optional[str] = None
    signature_scan_path: Optional[str] = None
    phone_primary: str
    phone_secondary: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    
    # Next of Kin
    next_of_kin_name: str
    next_of_kin_phone: str
    next_of_kin_relationship: str
    
    # Geolocation
    geo_latitude: Optional[float] = None
    geo_longitude: Optional[float] = None


class MemberCreate(MemberBase):
    branch_id: int


class MemberUpdate(BaseModel):
    phone_primary: Optional[str] = None
    phone_secondary: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    next_of_kin_name: Optional[str] = None
    next_of_kin_phone: Optional[str] = None
    next_of_kin_relationship: Optional[str] = None
    geo_latitude: Optional[float] = None
    geo_longitude: Optional[float] = None


class MemberResponse(MemberBase):
    id: int
    member_id: str
    branch_id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class MemberDetailResponse(MemberResponse):
    accounts: List['AccountResponse'] = []
    loans: List['LoanResponse'] = []


# ============== ACCOUNT SCHEMAS ==============
class AccountBase(BaseModel):
    account_type: AccountType = AccountType.SAVINGS
    interest_rate: Optional[Decimal] = Decimal("0.00")
    minimum_balance: Optional[Decimal] = Decimal("0.00")


class AccountCreate(AccountBase):
    member_id: int


class AccountResponse(BaseModel):
    id: int
    account_number: str
    member_id: int
    account_type: AccountType
    balance: Decimal
    available_balance: Decimal
    interest_rate: Decimal
    minimum_balance: Decimal
    is_active: bool
    is_frozen: bool
    opened_at: datetime
    
    class Config:
        from_attributes = True


class AccountHoldBase(BaseModel):
    amount: Decimal
    is_active: bool


class AccountHoldResponse(AccountHoldBase):
    id: int
    account_id: int
    loan_id: int
    created_at: datetime
    released_at: Optional[datetime]

    class Config:
        from_attributes = True


# ============== TRANSACTION SCHEMAS ==============
class TransactionBase(BaseModel):
    transaction_type: TransactionType
    amount: Decimal = Field(..., gt=0)
    description: Optional[str] = None


class DepositRequest(BaseModel):
    account_id: int
    amount: Decimal = Field(..., gt=0)
    description: Optional[str] = None


class WithdrawalRequest(BaseModel):
    account_id: int
    amount: Decimal = Field(..., gt=0)
    description: Optional[str] = None


class TransferRequest(BaseModel):
    from_account_id: int
    to_account_id: int
    amount: Decimal = Field(..., gt=0)
    description: Optional[str] = None


class ApprovalRequest(BaseModel):
    transaction_id: int
    approved: bool
    reason: Optional[str] = None


class TransactionResponse(BaseModel):
    id: int
    transaction_ref: str
    account_id: int
    transaction_type: TransactionType
    amount: Decimal
    currency: str
    balance_after: Decimal
    description: Optional[str]
    created_by: int
    approved_by: Optional[int]
    approved_at: Optional[datetime]
    created_at: datetime
    
    class Config:
        from_attributes = True


class TransactionListResponse(BaseModel):
    transactions: List[TransactionResponse]
    total: int
    page: int
    page_size: int


# ============== LOAN PRODUCT SCHEMAS ==============
class LoanProductBase(BaseModel):
    name: str
    code: str
    description: Optional[str] = None
    interest_rate: Decimal = Field(..., gt=0, le=100)
    interest_type: str = "declining_balance"  # flat or declining_balance
    min_amount: Decimal
    max_amount: Decimal
    min_term_months: int
    max_term_months: int
    requires_guarantor: bool = False
    guarantor_percentage: Decimal = Decimal("100.00")
    
    # Accounting (GL) Mapping
    gl_portfolio_account: Optional[str] = None
    gl_interest_account: Optional[str] = None
    gl_penalty_account: Optional[str] = None


class LoanProductCreate(LoanProductBase):
    pass


class LoanProductResponse(LoanProductBase):
    id: int
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


# ============== LOAN SCHEMAS ==============
class LoanScheduleItem(BaseModel):
    installment_number: int
    due_date: date
    principal_amount: Decimal
    interest_amount: Decimal
    total_amount: Decimal


class GuarantorRequest(BaseModel):
    member_id: int
    guarantee_amount: Decimal


class LoanApplicationRequest(BaseModel):
    member_id: int
    product_id: int
    principal_amount: Decimal
    term_months: int
    purpose: Optional[str] = None
    guarantors: Optional[List[GuarantorRequest]] = []


class LoanResponse(BaseModel):
    id: int
    loan_number: str
    member_id: int
    product_id: int
    principal_amount: Decimal
    interest_rate: Decimal
    term_months: int
    total_interest: Decimal
    total_due: Decimal
    amount_paid: Decimal
    amount_outstanding: Decimal
    status: LoanStatus
    delinquency_days: int
    application_date: datetime
    approval_date: Optional[datetime]
    disbursement_date: Optional[datetime]
    maturity_date: Optional[datetime]
    applied_by: int
    approved_by: Optional[int]
    tier2_approved_by: Optional[int]
    board_approval_1_by: Optional[int]
    board_approval_2_by: Optional[int]
    is_insider_loan: bool
    
    class Config:
        from_attributes = True


class LoanDetailResponse(LoanResponse):
    schedules: List[LoanScheduleItem] = []


class LoanApprovalRequest(BaseModel):
    approved: bool
    reason: Optional[str] = None


class LoanRepaymentRequest(BaseModel):
    loan_id: int
    amount: Decimal
    account_id: int  # Account to debit


# ============== AUDIT LOG SCHEMAS ==============
class AuditLogResponse(BaseModel):
    id: int
    username: str
    ip_address: str
    action: str
    entity_type: str
    entity_id: Optional[str]
    description: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True


# ============== REPORT SCHEMAS ==============
class ReportRequest(BaseModel):
    report_type: str
    period: str  # YYYY-MM format


class ReportResponse(BaseModel):
    id: int
    report_type: str
    report_period: str
    file_path: str
    file_format: str
    generated_by: int
    generated_at: datetime
    submitted_to_cobac: bool
    
    class Config:
        from_attributes = True


class DailyCashPosition(BaseModel):
    branch_id: int
    branch_name: str
    date: date
    opening_balance: Decimal
    total_deposits: Decimal
    total_withdrawals: Decimal
    net_position: Decimal
    closing_balance: Decimal
    transaction_count: int


# ============== DASHBOARD SCHEMAS ==============
class DashboardStats(BaseModel):
    total_members: int
    total_accounts: int
    total_deposits: Decimal
    total_loans: Decimal
    loans_disbursed_today: Decimal
    collections_today: Decimal
    pending_approvals: int


class BranchDashboard(BaseModel):
    branch_id: int
    branch_name: str
    stats: DashboardStats


# ============== SYNC SCHEMAS ==============
class SyncRequest(BaseModel):
    branch_id: int
    transactions: List[Dict[str, Any]]


class SyncResponse(BaseModel):
    synced: int
    failed: int
    pending: int
    errors: List[str]


# ============== ERROR SCHEMAS ==============
class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
    code: Optional[str] = None


# ============== TELLER SCHEMAS ==============
class Denominations(BaseModel):
    bill_10000: int = Field(0, ge=0)
    bill_5000: int = Field(0, ge=0)
    bill_2000: int = Field(0, ge=0)
    bill_1000: int = Field(0, ge=0)
    bill_500: int = Field(0, ge=0)
    coin_500: int = Field(0, ge=0)
    coin_100: int = Field(0, ge=0)
    coin_50: int = Field(0, ge=0)
    coin_25: int = Field(0, ge=0)

class BlindEODRequest(BaseModel):
    denominations: Denominations

class VaultDropRequest(BaseModel):
    amount: Decimal = Field(..., gt=0)

class ManagerOverrideRequest(BaseModel):
    manager_pin: str
    amount: Decimal = Field(..., gt=0)
    
class TellerReconciliationResponse(BaseModel):
    id: int
    teller_id: int
    branch_id: int
    declared_amount: Decimal
    system_expected_amount: Decimal
    variance_amount: Decimal
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class VerifyPinRequest(BaseModel):
    pin: str

# ============== QMS SCHEMAS ==============
class QueueTicketCreate(BaseModel):
    service_type: QueueServiceType
    is_vip: Optional[bool] = False
    branch_id: int

class QueueTicketResponse(BaseModel):
    id: int
    ticket_number: str
    service_type: QueueServiceType
    status: QueueStatus
    is_vip: bool
    issued_at: datetime
    called_at: Optional[datetime]
    completed_at: Optional[datetime]
    handled_by_user_id: Optional[int]
    counter_number: Optional[str] = None
    branch_id: int

    class Config:
        from_attributes = True

class QueueCallNextRequest(BaseModel):
    service_type: QueueServiceType
    counter_number: str

class QueueStats(BaseModel):
    waiting_count: int
    serving_count: int
    longest_wait_minutes: int
    active_tellers: int

# Forward references
MemberDetailResponse.model_rebuild()
