"""
Pydantic Schemas for Request/Response Validation
"""
from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from decimal import Decimal
from enum import Enum


# ============== ENUMS ==============
class IntercomEntityType(str, Enum):
    TRANSACTION = "TRANSACTION"
    MEMBER_PROFILE = "MEMBER_PROFILE"
    LOAN_APP = "LOAN_APP"
    NJANGI_GROUP = "NJANGI_GROUP"
    VOICE_SIGNAL = "VOICE_SIGNAL"

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
    NJANGI_CONTRIBUTION = "NJANGI_CONTRIBUTION"
    NJANGI_PAYOUT = "NJANGI_PAYOUT"
    SHARE_PURCHASE = "SHARE_PURCHASE"
    ENTRANCE_FEE = "ENTRANCE_FEE"


class VaultTransferType(str, Enum):
    """Types of vault/cash movements"""
    VAULT_TO_TELLER = "VAULT_TO_TELLER"
    TELLER_TO_VAULT = "TELLER_TO_VAULT"
    BANK_TO_VAULT = "BANK_TO_VAULT"
    VAULT_ADJUSTMENT = "VAULT_ADJUSTMENT"
    VAULT_TO_EXTERNAL = "VAULT_TO_EXTERNAL"
    EXTERNAL_TO_DIGITAL = "EXTERNAL_TO_DIGITAL"
    DIGITAL_TO_EXTERNAL = "DIGITAL_TO_EXTERNAL"


class TreasuryAccountType(str, Enum):
    """Types of treasury liquidity pools"""
    VAULT = "VAULT"
    BANK = "BANK"
    CREDIT_UNION = "CREDIT_UNION"
    MOBILE_MONEY = "MOBILE_MONEY"


class VaultTransferStatus(str, Enum):
    """Status of manual cash transfers"""
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class PaymentChannel(str, Enum):
    CASH = "CASH"
    MTN_MOMO = "MTN_MOMO"
    ORANGE_MONEY = "ORANGE_MONEY"
    BANK_TRANSFER = "BANK_TRANSFER"
    BALI_CO = "BALI_CO"
    GLOVIC = "GLOVIC"
    MICROFINANCE_A = "MICROFINANCE_A"


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


class BranchStatus(str, Enum):
    OPEN = "OPEN"
    EOD_IN_PROGRESS = "EOD_IN_PROGRESS"
    CLOSED = "CLOSED"


class OverrideStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class CycleInterval(str, Enum):
    WEEKLY = "WEEKLY"
    BI_WEEKLY = "BI_WEEKLY"
    MONTHLY = "MONTHLY"


class NjangiGroupStatus(str, Enum):
    DRAFT = "DRAFT"
    PENDING_KYC = "PENDING_KYC"
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    DISSOLVED = "DISSOLVED"


class CycleStatus(str, Enum):
    COLLECTING = "COLLECTING"
    READY_FOR_PAYOUT = "READY_FOR_PAYOUT"
    COMPLETED = "COMPLETED"


class ContributionStatus(str, Enum):
    PAID_ON_TIME = "PAID_ON_TIME"
    PAID_LATE = "PAID_LATE"
    MISSED = "MISSED"
class OnboardPaymentRequest(BaseModel):
    member_id: int
    shares_amount: Decimal = Field(..., gt=0)
    fee_amount: Decimal = Field(..., gt=0)
    payment_channel: PaymentChannel = PaymentChannel.CASH
    description: Optional[str] = None


class PayoutStatus(str, Enum):
    PENDING = "PENDING"
    DISBURSED = "DISBURSED"
    FAILED = "FAILED"


class InsightType(str, Enum):
    DEFAULT_WARNING = "DEFAULT_WARNING"
    STREAK_ACHIEVEMENT = "STREAK_ACHIEVEMENT"
    LIQUIDITY_RISK = "LIQUIDITY_RISK"


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
    counter_number: Optional[str] = None

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
    is_first_login: bool
    
    class Config:
        from_attributes = True


class UserLogin(BaseModel):
    username: str
    password: str
    
    
class UserApprovalRequest(BaseModel):
    approve: bool
    transaction_limit: Optional[Decimal] = Field(default=Decimal("0.00"), ge=0)


# --- Intercom ---

class IntercomMessageBase(BaseModel):
    content: str
    attached_entity_type: Optional[IntercomEntityType] = None
    attached_entity_id: Optional[str] = None

class IntercomMessageCreate(IntercomMessageBase):
    receiver_id: Optional[int] = None

class IntercomMessageOut(IntercomMessageBase):
    id: int
    sender_id: int
    receiver_id: Optional[int]
    timestamp: datetime
    read_status: bool
    
    # Ideally we'd include sender details here, but we keep it simple for now
    
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse

class OnboardingSetupRequest(BaseModel):
    new_password: str = Field(..., min_length=8)
    new_pin: str = Field(..., min_length=4, max_length=4, pattern=r'^\d{4}$')

class PINUpdateRequest(BaseModel):
    current_password: str
    new_pin: str = Field(..., min_length=4, max_length=4, pattern=r'^\d{4}$')

class PINResetConfirmRequest(BaseModel):
    token: str
    new_pin: str = Field(..., min_length=4, max_length=4, pattern=r'^\d{4}$')


# ============== BRANCH SCHEMAS ==============
class BranchBase(BaseModel):
    code: str
    name: str
    address: Optional[str] = None
    city: str
    region: str
    phone: Optional[str] = None
    email: Optional[str] = None


class BranchStatusUpdate(BaseModel):
    status: BranchStatus


class BranchCreate(BranchBase):
    pass


class BranchResponse(BranchBase):
    id: int
    is_active: bool
    created_at: datetime
    server_api_key: Optional[str] = None
    gl_vault_code: Optional[str] = None
    status: BranchStatus
    vault_cash_limit: Decimal
    mtn_float: Decimal
    orange_float: Decimal
    
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
    
    # Njangi metadata
    trust_score: Decimal
    on_time_streak: int
    ai_default_risk_flag: bool
    
    created_at: datetime
    updated_at: datetime
    
    # Computed Fields
    total_stake: Optional[Decimal] = Decimal("0.00")
    membership_status: Optional[str] = "APPLICANT"
    
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
    payment_channel: PaymentChannel = PaymentChannel.CASH
    purpose: str = "SAVINGS"
    external_reference: Optional[str] = None
    description: Optional[str] = None
    comments: Optional[str] = None


class WithdrawalRequest(BaseModel):
    account_id: int
    amount: Decimal = Field(..., gt=0)
    payment_channel: PaymentChannel = PaymentChannel.CASH
    purpose: str = "SAVINGS"
    external_reference: Optional[str] = None
    description: Optional[str] = None
    comments: Optional[str] = None


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
    payment_channel: PaymentChannel
    purpose: Optional[str]
    external_reference: Optional[str]
    comments: Optional[str]
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


class TransactionOverrideCreate(BaseModel):
    amount: Decimal
    transaction_type: str
    member_id: Optional[int] = None
    description: Optional[str] = None


class TransactionOverrideResponse(BaseModel):
    id: int
    teller_id: int
    manager_id: Optional[int] = None
    branch_id: int
    amount: Decimal
    transaction_type: str
    member_id: Optional[int] = None
    status: OverrideStatus
    requested_at: datetime
    responded_at: Optional[datetime] = None
    manager_comments: Optional[str] = None

    class Config:
        from_attributes = True


class DirectOverrideApproveRequest(BaseModel):
    override_id: int
    manager_pin: str
    comments: Optional[str] = None


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
    purpose: Optional[str] = None
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
    ai_risk_score: Optional[float] = None
    
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


# ============== LIQUIDITY MATRIX SCHEMAS ==============
class LiquidityCategoryDetail(BaseModel):
    name: str
    balance: Decimal
    limit: Optional[Decimal] = None
    account_number: Optional[str] = None

class LiquidityCategory(BaseModel):
    name: str
    category_type: str # INTERNAL, EXTERNAL, DIGITAL
    total_balance: Decimal
    items: List[LiquidityCategoryDetail]

class LiquidityMatrixResponse(BaseModel):
    branch_id: int
    total_liquidity: Decimal
    categories: List[LiquidityCategory]


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
    momo_balance: Decimal = Field(default=Decimal("0.00"), ge=0)
    om_balance: Decimal = Field(default=Decimal("0.00"), ge=0)

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
    
    # Digital balances
    declared_momo_balance: Decimal
    system_expected_momo_balance: Decimal
    momo_variance: Decimal
    declared_om_balance: Decimal
    system_expected_om_balance: Decimal
    om_variance: Decimal
    
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


# ============== TREASURY SCHEMAS ==============
class TreasuryAccountBase(BaseModel):
    name: str
    account_type: TreasuryAccountType
    account_number: Optional[str] = None
    gl_account_code: str
    max_limit: Optional[Decimal] = None
    is_active: bool = True

class TreasuryAccountCreate(TreasuryAccountBase):
    pass

class TreasuryAccountResponse(TreasuryAccountBase):
    id: int
    branch_id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class VaultAdjustmentRequest(BaseModel):
    amount: Decimal = Field(..., gt=0)
    description: str


class VaultTransferRequestData(BaseModel):
    amount: Decimal = Field(..., gt=0)
    transfer_type: VaultTransferType
    description: Optional[str] = None
    source_treasury_id: Optional[int] = None
    destination_treasury_id: Optional[int] = None
    teller_id: Optional[int] = None


class VaultTransferApprovalReq(BaseModel):
    approved: bool
    manager_pin: str


class VaultTransferResponse(BaseModel):
    id: int
    transfer_ref: str
    transfer_type: VaultTransferType
    branch_id: int
    teller_id: Optional[int] = None
    source_treasury_id: Optional[int] = None
    destination_treasury_id: Optional[int] = None
    amount: Decimal
    status: VaultTransferStatus
    description: Optional[str] = None
    created_by: int
    approved_by: Optional[int] = None
    created_at: datetime
    approved_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Forward references
MemberDetailResponse.model_rebuild()

class VaultDropByManagerRequest(BaseModel):
    teller_id: int
    amount: Decimal = Field(..., gt=0)
    manager_pin: str


# ============== NJANGI SCHEMAS ==============
class NjangiGroupBase(BaseModel):
    name: str
    description: Optional[str] = None
    contribution_amount: Decimal
    cycle_frequency: CycleInterval = CycleInterval.MONTHLY
    escrow_gl_account_id: Optional[int] = None
    president_id: int
    bylaws_url: Optional[str] = None
    meeting_minutes_url: Optional[str] = None
    executive_signatories: Optional[str] = None

class NjangiGroupCreate(NjangiGroupBase):
    pass

class NjangiGroupKYCUpload(BaseModel):
    bylaws_url: str
    meeting_minutes_url: str

class NjangiGroupKYCApprove(BaseModel):
    escrow_gl_account_id: int

class NjangiGroupResponse(NjangiGroupBase):
    id: int
    status: NjangiGroupStatus
    created_at: datetime

    class Config:
        from_attributes = True

class NjangiMembershipBase(BaseModel):
    group_id: int
    member_id: int
    payout_order: Optional[int] = None

class NjangiMembershipResponse(NjangiMembershipBase):
    id: int
    on_time_streak: int
    trust_score: Decimal
    ai_default_risk_flag: bool
    joined_at: datetime
    is_active: bool

    class Config:
        from_attributes = True

class NjangiMembershipWithGroupResponse(NjangiMembershipResponse):
    group: NjangiGroupResponse

    class Config:
        from_attributes = True

class MemberNjangiStatusResponse(BaseModel):
    memberships: List[NjangiMembershipWithGroupResponse]
    aggregate_trust_score: float

class NjangiCycleBase(BaseModel):
    group_id: int
    cycle_number: int
    recipient_member_id: int
    start_date: datetime
    due_date: datetime
    pot_target_amount: Decimal

class NjangiCycleResponse(NjangiCycleBase):
    id: int
    current_pot_amount: Decimal
    status: CycleStatus

    class Config:
        from_attributes = True

class NjangiContributionBase(BaseModel):
    cycle_id: int
    member_id: int
    amount_paid: Decimal
    payment_channel: PaymentChannel = PaymentChannel.CASH

class NjangiContributionResponse(NjangiContributionBase):
    id: int
    status: ContributionStatus
    transaction_id: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True

class NjangiPayoutResponse(BaseModel):
    id: int
    cycle_id: int
    recipient_member_id: int
    amount_disbursed: Decimal
    destination_account_id: int
    status: PayoutStatus
    transaction_id: Optional[int]
    disbursed_at: Optional[datetime]

    class Config:
        from_attributes = True

class NjangiAIInsightResponse(BaseModel):
    id: int
    group_id: int
    member_id: Optional[int]
    insight_type: InsightType
    message: str
    is_acknowledged: bool
    created_at: datetime

    class Config:
        from_attributes = True

class NjangiReadinessResponse(BaseModel):
    member_id: int
    readiness_score: float


# ============== POLICY & GOVERNANCE SCHEMAS ==============

class PolicyBase(BaseModel):
    policy_key: str
    policy_value: str
    effective_date: Optional[datetime] = None

    @validator('effective_date', pre=True)
    def parse_date(cls, v):
        if isinstance(v, str):
            if not v:
                return None
            try:
                # Handle ISO format from new Date().toISOString()
                return datetime.fromisoformat(v.replace('Z', '+00:00'))
            except ValueError:
                # Fallback for plain YYYY-MM-DD
                try:
                    return datetime.strptime(v, "%Y-%m-%d")
                except ValueError:
                    return None
        return v

class PolicyProposalCreate(PolicyBase):
    change_reason: str

class PolicyResponse(PolicyBase):
    id: int
    status: str
    version: int
    proposed_by_id: int
    approved_by_id: Optional[int] = None
    change_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class PolicyApprovalRequest(BaseModel):
    reason: Optional[str] = None
