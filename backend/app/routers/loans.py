"""
Loan Management Router
Handles loan products, applications, disbursements, and repayments
"""
from typing import Optional, List
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta

from app.database import get_db
from app.config import settings
from app.auth import get_current_user, require_teller, require_credit_officer, generate_loan_number
from app.security.permissions import require_permission, Permission
from app.audit import AuditLogger
from app import models, schemas
from app.services.accounting import AccountingService
from app.services.policies import PolicyService
from app.services.risk_scoring import evaluate_member_risk

router = APIRouter(prefix="/loans", tags=["Loan Management"])


def calculate_amortization_schedule(
    principal: Decimal,
    annual_rate: Decimal,
    term_months: int,
    interest_type: str = "declining_balance"
) -> List[schemas.LoanScheduleItem]:
    """
    Calculate loan amortization schedule
    
    Args:
        principal: Loan principal amount
        annual_rate: Annual interest rate (percentage)
        term_months: Loan term in months
        interest_type: 'flat' or 'declining_balance'
    
    Returns:
        List of schedule items
    """
    schedule = []
    monthly_rate = annual_rate / 100 / 12
    
    if interest_type == "flat":
        # Flat interest: interest calculated on original principal
        total_interest = principal * (annual_rate / 100) * (term_months / 12)
        monthly_principal = principal / term_months
        monthly_interest = total_interest / term_months
        
        balance = principal
        for i in range(1, term_months + 1):
            due_date = datetime.now() + relativedelta(months=i)
            schedule.append(schemas.LoanScheduleItem(
                installment_number=i,
                due_date=due_date.date(),
                principal_amount=monthly_principal,
                interest_amount=monthly_interest,
                total_amount=monthly_principal + monthly_interest
            ))
    
    else:  # declining_balance
        # Declining balance: interest calculated on remaining balance
        # Using standard amortization formula
        if monthly_rate > 0:
            monthly_payment = principal * (
                monthly_rate * (1 + monthly_rate) ** term_months
            ) / (
                (1 + monthly_rate) ** term_months - 1
            )
        else:
            monthly_payment = principal / term_months
        
        balance = principal
        for i in range(1, term_months + 1):
            interest_amount = balance * monthly_rate
            principal_amount = monthly_payment - interest_amount
            balance -= principal_amount
            
            due_date = datetime.now() + relativedelta(months=i)
            schedule.append(schemas.LoanScheduleItem(
                installment_number=i,
                due_date=due_date.date(),
                principal_amount=round(principal_amount, 2),
                interest_amount=round(interest_amount, 2),
                total_amount=round(monthly_payment, 2)
            ))
    
    return schedule


# ============== LOAN PRODUCT ENDPOINTS ==============

@router.get("/products", response_model=List[schemas.LoanProductResponse])
async def list_loan_products(
    is_active: bool = True,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    List available loan products
    """
    # If auditing/manager, might want to see inactive products too
    # But default is active only for dropdowns
    query = db.query(models.LoanProduct)
    if is_active:
        query = query.filter(models.LoanProduct.is_active == True)
        
    products = query.all()
    
    return [schemas.LoanProductResponse.model_validate(p) for p in products]


@router.post("/products", response_model=schemas.LoanProductResponse)
async def create_loan_product(
    request: Request,
    product_data: schemas.LoanProductCreate,
    authorized: bool = Depends(require_permission(Permission.LOAN_PRODUCT_CREATE)),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new loan product (Ops Manager only)
    """
    # Check if code already exists
    existing = db.query(models.LoanProduct).filter(
        models.LoanProduct.code == product_data.code
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Product code already exists"
        )
    
    # Create product
    product = models.LoanProduct(
        name=product_data.name,
        code=product_data.code,
        description=product_data.description,
        interest_rate=product_data.interest_rate,
        interest_type=product_data.interest_type,
        min_amount=product_data.min_amount,
        max_amount=product_data.max_amount,
        min_term_months=product_data.min_term_months,
        max_term_months=product_data.max_term_months,
        requires_guarantor=product_data.requires_guarantor,
        guarantor_percentage=product_data.guarantor_percentage,
        # GL Mapping
        gl_portfolio_account=product_data.gl_portfolio_account,
        gl_interest_account=product_data.gl_interest_account,
        gl_penalty_account=product_data.gl_penalty_account
    )
    
    db.add(product)
    db.commit()
    db.refresh(product)
    
    # Log creation
    audit = AuditLogger(db, current_user, request)
    audit.log_create(
        entity_type="LoanProduct",
        entity_id=str(product.id),
        new_values={
            "name": product.name,
            "code": product.code,
            "interest_rate": float(product.interest_rate),
            "gl_portfolio": product.gl_portfolio_account
        }
    )
    
    return schemas.LoanProductResponse.model_validate(product)


@router.put("/products/{product_id}/deactivate", response_model=schemas.LoanProductResponse)
async def deactivate_loan_product(
    product_id: int,
    request: Request,
    authorized: bool = Depends(require_permission(Permission.LOAN_PRODUCT_CREATE)),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Deactivate a loan product ("Safety Lock").
    Prevents further use but keeps history.
    """
    product = db.query(models.LoanProduct).filter(models.LoanProduct.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
        
    if not product.is_active:
        return schemas.LoanProductResponse.model_validate(product)

    product.is_active = False
    db.commit()
    db.refresh(product)
    
    # Log deactivation
    audit = AuditLogger(db, current_user, request)
    audit.log_update(
        entity_type="LoanProduct",
        entity_id=str(product.id),
        old_values={"is_active": True},
        new_values={"is_active": False}
    )
    
    return schemas.LoanProductResponse.model_validate(product)


# ============== ELIGIBILITY CHECK ENDPOINT ==============

@router.get("/eligibility/{member_id}")
async def check_eligibility(
    member_id: int,
    current_user: models.User = Depends(require_credit_officer),
    db: Session = Depends(get_db)
):
    """
    COBAC Pre-Check: Verify member eligibility before loan application.
    Called automatically by the Credit Officer wizard at Step 2.
    """
    checks = {}
    eligible = True

    # 1. Verify member exists and is active
    member = db.query(models.Member).filter(models.Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    if member.is_active:
        checks["membership_active"] = {
            "passed": True,
            "label": "Active Membership",
            "detail": f"Active since {member.created_at.strftime('%d %b %Y')}"
        }
    else:
        checks["membership_active"] = {
            "passed": False,
            "label": "Active Membership",
            "detail": "Member account is inactive. Cannot originate loans for inactive members."
        }
        eligible = False

    # 2. Cooling-off period (C8) — must be member for ≥90 days
    days_since_joined = (datetime.now() - member.created_at).days
    # Policy Resolution: Dynamic Cooling-Off Period
    cooling_off_days = int(PolicyService.get_value(db, "cooling_off_days", settings.COOLING_OFF_DAYS))
    
    if days_since_joined >= cooling_off_days:
        checks["cooling_off"] = {
            "passed": True,
            "label": f"Cooling-Off Period ({cooling_off_days} days)",
            "detail": f"Member for {days_since_joined} days — eligible"
        }
    else:
        remaining = cooling_off_days - days_since_joined
        checks["cooling_off"] = {
            "passed": False,
            "label": f"Cooling-Off Period ({cooling_off_days} days)",
            "detail": f"Member for only {days_since_joined} days. {remaining} days remaining before loan eligibility."
        }
        eligible = False

    # 3. Savings rule (C6) — calculate max loan = 3× (shares + savings)
    member_accounts = db.query(models.Account).filter(
        models.Account.member_id == member_id,
        models.Account.is_active == True,
        models.Account.account_type.in_([
            models.AccountType.SAVINGS,
            models.AccountType.SHARES,
            models.AccountType.CURRENT
        ])
    ).all()
    
    total_savings = sum(float(a.balance) for a in member_accounts if a.account_type != models.AccountType.SHARES)
    total_shares = sum(float(a.balance) for a in member_accounts if a.account_type == models.AccountType.SHARES)
    total_stake = total_savings + total_shares
    
    # Policy Resolution: Dynamic Borrowing Ratio
    loan_multiplier = PolicyService.get_loan_multiplier(db)
    max_loan_amount = total_stake * Decimal(str(loan_multiplier))
    
    # Policy Resolution: Dynamic Min Share Capital
    min_share_capital = PolicyService.get_min_share_capital(db)
    
    # Membership Status Logic: Applicant (< 10k) or Full Member (>= 10k)
    membership_status = "APPLICANT"
    if total_shares >= Decimal(str(min_share_capital)):
        membership_status = "FULL MEMBER"

    if total_stake > 0:
        checks["savings_rule"] = {
            "passed": True,
            "label": f"{loan_multiplier}× Stake Rule (Shares + Savings)",
            "detail": f"Total Stake: {total_stake:,.0f} FCFA (Shares: {total_shares:,.0f}, Savings: {total_savings:,.0f}) → Maximum eligible loan: {max_loan_amount:,.0f} FCFA"
        }
    else:
        checks["savings_rule"] = {
            "passed": False,
            "label": f"{loan_multiplier}× Stake Rule",
            "detail": "Member has no savings or shares. Must save before applying for a loan."
        }
        eligible = False
    
    # Mandatory Share Check for Full Membership
    if membership_status != "FULL MEMBER":
        # Note: COBAC often allows loans for applicants but with lower limits or higher scrutiny.
        # Here we just track the status.
        pass

    # 4. Delinquency check — any active loans past due?
    delinquent_loans = db.query(models.Loan).filter(
        models.Loan.member_id == member_id,
        models.Loan.status == models.LoanStatus.DELINQUENT
    ).count()

    if delinquent_loans == 0:
        checks["delinquency"] = {
            "passed": True,
            "label": "No Delinquent Loans",
            "detail": "No outstanding delinquent loans"
        }
    else:
        checks["delinquency"] = {
            "passed": False,
            "label": "No Delinquent Loans",
            "detail": f"Member has {delinquent_loans} delinquent loan(s). Must clear arrears before applying."
        }
        eligible = False

    # 5. Dormancy check (C10) — any dormant accounts?
    dormant_accounts = db.query(models.Account).filter(
        models.Account.member_id == member_id,
        models.Account.dormancy_status == "DORMANT"
    ).count()

    if dormant_accounts == 0:
        checks["dormancy"] = {
            "passed": True,
            "label": "All Accounts Active",
            "detail": "No dormant accounts detected"
        }
    else:
        checks["dormancy"] = {
            "passed": False,
            "label": "All Accounts Active",
            "detail": f"{dormant_accounts} account(s) flagged as dormant. Must reactivate before applying."
        }
        eligible = False

    return {
        "eligible": eligible,
        "checks": checks,
        "max_loan_amount": max_loan_amount,
        "total_savings": total_savings,
        "total_shares": total_shares,
        "total_stake": total_stake,
        "membership_status": membership_status,
        "monthly_income": float(member.monthly_income) if member.monthly_income else None,
        "member_name": f"{member.first_name} {member.last_name}",
        "member_since": member.created_at.strftime("%d %b %Y")
    }


# ============== LOAN APPLICATION ENDPOINTS ==============

@router.post("/applications", response_model=schemas.LoanResponse)
async def apply_for_loan(
    request: Request,
    application: schemas.LoanApplicationRequest,
    current_user: models.User = Depends(require_credit_officer),
    db: Session = Depends(get_db)
):
    """
    Submit a loan application
    
    - Validates member eligibility
    - Calculates amortization schedule
    - Handles guarantor requirements
    """
    # Verify member exists
    member = db.query(models.Member).filter(
        models.Member.id == application.member_id,
        models.Member.is_active == True
    ).first()
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found or inactive"
        )
    
    # Verify product exists
    product = db.query(models.LoanProduct).filter(
        models.LoanProduct.id == application.product_id,
        models.LoanProduct.is_active == True
    ).first()
    
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Loan product not found or inactive"
        )
    
    # Validate amount within product limits
    if application.principal_amount < product.min_amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Amount below minimum of {product.min_amount} FCFA"
        )
    
    if application.principal_amount > product.max_amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Amount exceeds maximum of {product.max_amount} FCFA"
        )
    
    # Validate term within product limits
    if application.term_months < product.min_term_months:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Term below minimum of {product.min_term_months} months"
        )
    
    if application.term_months > product.max_term_months:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Term exceeds maximum of {product.max_term_months} months"
        )
    
    # Handle guarantors if required
    if product.requires_guarantor:
        if not application.guarantors or len(application.guarantors) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This product requires at least one guarantor"
            )
        
        total_guarantee = sum(g.guarantee_amount for g in application.guarantors)
        required_guarantee = application.principal_amount * (product.guarantor_percentage / 100)
        
        if total_guarantee < required_guarantee:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Total guarantee must be at least {required_guarantee} FCFA"
            )
    
    # ========== COBAC CONSTRAINT CHECKS ==========
    
    # COBAC C8: Cooling-off period — new members must save for 90 days
    days_since_joined = (datetime.now() - member.created_at).days
    if days_since_joined < settings.COOLING_OFF_DAYS:
        remaining = settings.COOLING_OFF_DAYS - days_since_joined
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "cobac_code": "C8",
                "title": "Cooling-Off Period Not Met",
                "message": f"This member joined {days_since_joined} days ago. A minimum of {settings.COOLING_OFF_DAYS} days of active saving is required before loan eligibility.",
                "suggestion": f"{remaining} days remaining. The member can apply after completing the required saving period."
            }
        )
    
    # COBAC C6: 3× Savings Multiplier — max loan = 3 × (shares + savings)
    member_accounts = db.query(models.Account).filter(
        models.Account.member_id == application.member_id,
        models.Account.is_active == True,
        models.Account.account_type.in_([models.AccountType.SAVINGS, models.AccountType.SHARES, models.AccountType.CURRENT])
    ).all()
    total_savings = sum(float(a.balance) for a in member_accounts)
    max_loan_amount = total_savings * settings.SAVINGS_MULTIPLIER
    
    if float(application.principal_amount) > max_loan_amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "cobac_code": "C6",
                "title": "Loan Amount Exceeds Savings Limit",
                "message": f"Requested loan of {application.principal_amount:,.0f} FCFA exceeds the maximum eligible amount of {max_loan_amount:,.0f} FCFA.",
                "suggestion": f"Maximum loan = {settings.SAVINGS_MULTIPLIER}× total savings. Member total savings: {total_savings:,.0f} FCFA. Increase savings or reduce loan amount."
            }
        )
    
    # COBAC C7: 1/3 Debt Service Ratio — monthly installment ≤ 33% of income
    if member.monthly_income and float(member.monthly_income) > 0:
        # Calculate estimated monthly installment
        monthly_installment = float(application.principal_amount) / application.term_months
        max_monthly_payment = float(member.monthly_income) * settings.DEBT_SERVICE_RATIO
        
        if monthly_installment > max_monthly_payment:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "cobac_code": "C7",
                    "title": "Debt Service Ratio Exceeded",
                    "message": f"Monthly repayment of {monthly_installment:,.0f} FCFA exceeds the maximum allowed of {max_monthly_payment:,.0f} FCFA (33% of income).",
                    "suggestion": f"Member income: {float(member.monthly_income):,.0f} FCFA/month. Consider extending the loan term or reducing the principal amount."
                }
            )
    
    # ========== END COBAC CHECKS ==========
    
    # Calculate amortization schedule
    schedule = calculate_amortization_schedule(
        principal=application.principal_amount,
        annual_rate=product.interest_rate,
        term_months=application.term_months,
        interest_type=product.interest_type
    )
    
    total_interest = sum(s.interest_amount for s in schedule)
    total_due = application.principal_amount + total_interest
    
    # Generate loan number
    loan_number = generate_loan_number()
    while db.query(models.Loan).filter(models.Loan.loan_number == loan_number).first():
        loan_number = generate_loan_number()
    
    # AI Risk Scoring Integration (XGBoost)
    age = (datetime.now().date() - member.date_of_birth).days // 365 if getattr(member, 'date_of_birth', None) else 35
    njangi_cycle_size = float(max_loan_amount) / 10.0 if 'max_loan_amount' in locals() else 50000.0
    days_late_last_3 = 0
    frequency_of_payments = 12
    ai_risk_score = evaluate_member_risk(age, njangi_cycle_size, days_late_last_3, frequency_of_payments)
    
    # Create loan record
    loan = models.Loan(
        loan_number=loan_number,
        member_id=application.member_id,
        product_id=application.product_id,
        principal_amount=application.principal_amount,
        interest_rate=product.interest_rate,
        term_months=application.term_months,
        total_interest=total_interest,
        total_due=total_due,
        amount_outstanding=total_due,
        status=models.LoanStatus.DRAFT,
        maturity_date=datetime.now() + relativedelta(months=application.term_months),
        applied_by=current_user.id,
        ai_risk_score=ai_risk_score
    )
    
    # Check if Insider Loan (Member email matches a User email)
    if member.email:
        insider = db.query(models.User).filter(models.User.email == member.email).first()
        if insider:
            loan.is_insider_loan = True
    
    db.add(loan)
    db.flush()  # Get loan ID
    
    # Create schedule records
    for item in schedule:
        schedule_record = models.LoanSchedule(
            loan_id=loan.id,
            installment_number=item.installment_number,
            due_date=item.due_date,
            principal_amount=item.principal_amount,
            interest_amount=item.interest_amount,
            total_amount=item.total_amount
        )
        db.add(schedule_record)
    
    # Create guarantor records if applicable
    if application.guarantors:
        for guarantor_data in application.guarantors:
            guarantor = models.LoanGuarantor(
                loan_id=loan.id,
                member_id=guarantor_data.member_id,
                guarantee_amount=guarantor_data.guarantee_amount
            )
            db.add(guarantor)
            
            # Freeze guarantor's savings (simplified - would need proper implementation)
            # This would involve creating a hold on the guarantor's account
    
    db.commit()
    db.refresh(loan)
    
    # Log application
    audit = AuditLogger(db, current_user, request)
    audit.log(
        action="LOAN_APPLICATION",
        entity_type="Loan",
        entity_id=loan.loan_number,
        new_values={
            "principal": float(application.principal_amount),
            "term": application.term_months,
            "product": product.name
        },
        description=f"Loan application {loan.loan_number} for {member.member_id}"
    )
    
    return schemas.LoanResponse.model_validate(loan)


@router.get("/applications", response_model=List[schemas.LoanResponse])
async def list_loan_applications(
    member_id: Optional[int] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    List loan applications with filters
    """
    query = db.query(models.Loan)
    
    if member_id:
        query = query.filter(models.Loan.member_id == member_id)
    
    if status:
        status = status.upper()
        query = query.filter(models.Loan.status == status)
    
    loans = query.order_by(models.Loan.application_date.desc()).offset(skip).limit(limit).all()
    
    return [schemas.LoanResponse.model_validate(l) for l in loans]


@router.post("/applications/{loan_id}/submit", response_model=schemas.LoanResponse)
async def submit_loan(
    request: Request,
    loan_id: int,
    current_user: models.User = Depends(require_credit_officer),
    db: Session = Depends(get_db)
):
    """
    Submit a DRAFT loan for review (Step 2 & 3)
    - Places AccountHold on Guarantors' savings accounts
    - Changes status to PENDING_REVIEW
    """
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
        
    if loan.status != models.LoanStatus.DRAFT:
        raise HTTPException(status_code=400, detail=f"Loan is not in DRAFT state (current: {loan.status})")
        
    # Place Guarantor Liens (AccountHolds)
    if loan.guarantors:
        for guarantor in loan.guarantors:
            # Find guarantor's savings account
            savings_acc = db.query(models.Account).filter(
                models.Account.member_id == guarantor.member_id,
                models.Account.account_type == models.AccountType.SAVINGS,
                models.Account.is_active == True
            ).first()
            
            if not savings_acc:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Guarantor {guarantor.member_id} does not have an active savings account for the lien."
                )
            
            hold = models.AccountHold(
                account_id=savings_acc.id,
                loan_id=loan.id,
                amount=guarantor.guarantee_amount,
                is_active=True
            )
            db.add(hold)
    
    loan.status = models.LoanStatus.PENDING_REVIEW
    db.commit()
    db.refresh(loan)
    
    audit = AuditLogger(db, current_user, request)
    audit.log(
        action="LOAN_SUBMIT",
        entity_type="Loan",
        entity_id=loan.loan_number,
        new_values={"status": "PENDING_REVIEW"},
        description=f"Submitted loan {loan.loan_number} for review. Guarantor liens placed."
    )
    
    return schemas.LoanResponse.model_validate(loan)


@router.post("/applications/{loan_id}/return", response_model=schemas.LoanResponse)
async def return_loan_for_correction(
    request: Request,
    loan_id: int,
    body: schemas.LoanApprovalRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Return a loan application to the Credit Officer for correction.
    - Only Managers / Ops Managers / Ops Directors can return loans
    - Status changes from PENDING_REVIEW -> RETURNED
    - Releases all guarantor AccountHolds (liens)
    """
    # Permission check: only management roles
    if current_user.role not in [
        models.UserRole.BRANCH_MANAGER,
        models.UserRole.OPS_MANAGER,
        models.UserRole.OPS_DIRECTOR,
    ]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Managers can return loans for correction."
        )

    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")

    if loan.status != models.LoanStatus.PENDING_REVIEW:
        raise HTTPException(
            status_code=400,
            detail=f"Loan is not in PENDING_REVIEW state (current: {loan.status.value})"
        )

    # Release Guarantor Liens (AccountHolds)
    holds = db.query(models.AccountHold).filter(
        models.AccountHold.loan_id == loan.id,
        models.AccountHold.is_active == True
    ).all()
    for hold in holds:
        hold.is_active = False
        hold.released_at = datetime.utcnow()

    if hasattr(loan, 'guarantors') and loan.guarantors:
        for guarantor in loan.guarantors:
            guarantor.is_released = True
            guarantor.released_at = datetime.utcnow()

    loan.status = models.LoanStatus.RETURNED
    db.commit()
    db.refresh(loan)

    audit = AuditLogger(db, current_user, request)
    audit.log(
        action="LOAN_RETURN",
        entity_type="Loan",
        entity_id=loan.loan_number,
        new_values={"status": "RETURNED", "reason": body.reason},
        description=f"Returned loan {loan.loan_number} for correction. Reason: {body.reason}"
    )

    return schemas.LoanResponse.model_validate(loan)


@router.get("/applications/{loan_id}")
async def get_loan_application(
    loan_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get loan application details with schedule
    """
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    
    if not loan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Loan not found"
        )
    
    # Build member name from the member relationship
    member = db.query(models.Member).filter(models.Member.id == loan.member_id).first()
    member_name = f"{member.first_name} {member.last_name}" if member else None
    
    # Build guarantors list
    guarantors = []
    if hasattr(loan, 'guarantors') and loan.guarantors:
        for g in loan.guarantors:
            guarantors.append({
                "member_id": g.member_id,
                "guarantee_amount": float(g.guarantee_amount)
            })
    
    return {
        "id": loan.id,
        "loan_number": loan.loan_number,
        "member_id": loan.member_id,
        "member_name": member_name,
        "product_id": loan.product_id,
        "principal_amount": float(loan.principal_amount),
        "interest_rate": float(loan.interest_rate),
        "term_months": loan.term_months,
        "total_interest": float(loan.total_interest) if loan.total_interest else 0,
        "total_due": float(loan.total_due) if loan.total_due else 0,
        "amount_paid": float(loan.amount_paid) if loan.amount_paid else 0,
        "amount_outstanding": float(loan.amount_outstanding) if loan.amount_outstanding else 0,
        "status": loan.status.value if hasattr(loan.status, 'value') else str(loan.status),
        "delinquency_days": loan.delinquency_days if hasattr(loan, 'delinquency_days') else 0,
        "application_date": loan.application_date.isoformat() if loan.application_date else None,
        "approval_date": loan.approval_date.isoformat() if loan.approval_date else None,
        "disbursement_date": loan.disbursement_date.isoformat() if loan.disbursement_date else None,
        "maturity_date": loan.maturity_date.isoformat() if loan.maturity_date else None,
        "applied_by": loan.applied_by,
        "approved_by": loan.approved_by,
        "tier2_approved_by": loan.tier2_approved_by,
        "board_approval_1_by": loan.board_approval_1_by,
        "board_approval_2_by": loan.board_approval_2_by,
        "is_insider_loan": loan.is_insider_loan if hasattr(loan, 'is_insider_loan') else False,
        "purpose": loan.purpose if hasattr(loan, 'purpose') else None,
        "guarantors": guarantors,
        "schedules": []
    }


@router.post("/applications/{loan_id}/approve", response_model=schemas.LoanResponse)
async def approve_loan(
    request: Request,
    loan_id: int,
    approval: schemas.LoanApprovalRequest,
    current_user: models.User = Depends(require_credit_officer),
    db: Session = Depends(get_db)
):
    """
    Approve or reject a loan application
    
    - Only Credit Officers or Managers can approve
    - Approver cannot be the same as applicant
    """
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    
    if not loan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Loan not found"
        )
    
    if loan.status != models.LoanStatus.PENDING_REVIEW:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Loan is not pending review (current status: {loan.status.value})"
        )
    
    # Check approver is not applicant
    if loan.applied_by == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot approve your own loan application"
        )
    
    if approval.approved:
        # COBAC Rule B: Single Exposure Limit Check
        equity = getattr(settings, 'TOTAL_EQUITY_CAPITAL', Decimal("100000000.00"))
        exposure_limit = getattr(settings, 'SINGLE_EXPOSURE_LIMIT_PERCENT', Decimal("0.15"))
        max_exposure = equity * exposure_limit
        
        active_loans = db.query(models.Loan).filter(
            models.Loan.member_id == loan.member_id,
            models.Loan.status.in_([models.LoanStatus.ACTIVE, models.LoanStatus.DELINQUENT, models.LoanStatus.APPROVED_AWAITING_DISBURSEMENT])
        ).all()
        current_exposure = sum(l.amount_outstanding for l in active_loans)
        
        if current_exposure + loan.principal_amount > max_exposure:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Single Exposure Limit Exceeded: Member exposure would exceed {max_exposure:,.2f} FCFA max allowed."
            )

        is_tier1 = loan.principal_amount <= Decimal("1000000.00")
        is_tier2 = loan.principal_amount > Decimal("1000000.00") and loan.principal_amount <= Decimal("5000000.00")
        is_tier3 = loan.principal_amount > Decimal("5000000.00") or loan.is_insider_loan
        
        if is_tier3:
            if current_user.role in [models.UserRole.BRANCH_MANAGER, models.UserRole.OPS_MANAGER]:
                loan.approved_by = current_user.id # Manager Recommendation
            elif current_user.role == models.UserRole.BOARD_MEMBER:
                if not loan.approved_by and not loan.is_insider_loan:
                    raise HTTPException(status_code=400, detail="Manager recommendation required first.")
                
                if not loan.board_approval_1_by:
                    loan.board_approval_1_by = current_user.id
                elif loan.board_approval_1_by != current_user.id:
                    loan.board_approval_2_by = current_user.id
                    loan.status = models.LoanStatus.APPROVED_AWAITING_DISBURSEMENT
                    loan.approval_date = datetime.utcnow()
                else:
                    raise HTTPException(status_code=400, detail="You have already signed this approval.")
            else:
                raise HTTPException(status_code=403, detail="Unauthorized tier 3 approver.")
                
        elif is_tier2:
            if current_user.role in [models.UserRole.BRANCH_MANAGER, models.UserRole.OPS_MANAGER]:
                loan.approved_by = current_user.id # Manager Recommendation
            elif current_user.role == models.UserRole.OPS_DIRECTOR:
                if not loan.approved_by:
                    raise HTTPException(status_code=400, detail="Manager recommendation required first.")
                loan.tier2_approved_by = current_user.id
                loan.status = models.LoanStatus.APPROVED_AWAITING_DISBURSEMENT
                loan.approval_date = datetime.utcnow()
            else:
                raise HTTPException(status_code=403, detail="Unauthorized tier 2 approver.")
                
        elif is_tier1:
            if current_user.role not in [models.UserRole.BRANCH_MANAGER, models.UserRole.OPS_MANAGER, models.UserRole.OPS_DIRECTOR]:
                raise HTTPException(status_code=403, detail="Unauthorized tier 1 approver.")
            loan.approved_by = current_user.id
            loan.status = models.LoanStatus.APPROVED_AWAITING_DISBURSEMENT
            loan.approval_date = datetime.utcnow()
        
        db.commit()
        db.refresh(loan)
        
        audit = AuditLogger(db, current_user, request)
        audit.log_approval(
            entity_type="Loan",
            entity_id=loan.loan_number,
            approved=True,
            reason=approval.reason
        )
    else:
        # Reject loan
        loan.status = models.LoanStatus.REJECTED
        loan.approved_by = current_user.id
        
        # Release Guarantor Liens (AccountHolds)
        holds = db.query(models.AccountHold).filter(
            models.AccountHold.loan_id == loan.id, 
            models.AccountHold.is_active == True
        ).all()
        for hold in holds:
            hold.is_active = False
            hold.released_at = datetime.utcnow()
            
        for guarantor in loan.guarantors:
            guarantor.is_released = True
            guarantor.released_at = datetime.utcnow()
        
        db.commit()
        db.refresh(loan)
        
        audit = AuditLogger(db, current_user, request)
        audit.log_approval(
            entity_type="Loan",
            entity_id=loan.loan_number,
            approved=False,
            reason=approval.reason
        )
    
    return schemas.LoanResponse.model_validate(loan)


from fastapi import Body

@router.post("/applications/{loan_id}/disburse", response_model=schemas.TransactionResponse)
async def disburse_loan(
    request: Request,
    loan_id: int,
    body: dict = Body(default=None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Disburse an approved loan to member's account
    
    - Creates disbursement transaction
    - Updates loan status to DISBURSED
    """
    # COBAC Step 5: Tellers handle disbursement
    allowed_roles = [
        models.UserRole.TELLER,
        models.UserRole.CREDIT_OFFICER,
        models.UserRole.BRANCH_MANAGER,
        models.UserRole.OPS_MANAGER,
    ]
    if current_user.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Required roles: TELLER, CREDIT_OFFICER, BRANCH_MANAGER, OPS_MANAGER"
        )

    from app.auth import generate_transaction_ref
    
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    
    if not loan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Loan not found"
        )
    
    if loan.status != models.LoanStatus.APPROVED_AWAITING_DISBURSEMENT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Loan must be approved before disbursement (current status: {loan.status.value})"
        )
    
    # Get disbursement account — accept from body or auto-detect member's savings
    disbursement_account_id = None
    if body:
        disbursement_account_id = body.get("disbursement_account_id") or body.get("source_account_id")
    
    account = None
    if disbursement_account_id:
        account = db.query(models.Account).filter(
            models.Account.id == disbursement_account_id,
            models.Account.member_id == loan.member_id,
            models.Account.is_active == True
        ).first()
    
    # Auto-detect: find the member's primary savings account
    if not account:
        account = db.query(models.Account).filter(
            models.Account.member_id == loan.member_id,
            models.Account.is_active == True
        ).first()
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Disbursement account not found or inactive"
        )
    
    # Create disbursement transaction
    transaction = models.Transaction(
        transaction_ref=generate_transaction_ref(),
        account_id=account.id,
        transaction_type=models.TransactionType.LOAN_DISBURSEMENT,
        amount=loan.principal_amount,
        currency="XAF",
        debit_account="1210", # Loan Portfolio
        credit_account=account.account_number,
        balance_after=account.balance + loan.principal_amount,
        description=f"Loan disbursement - {loan.loan_number}",
        created_by=current_user.id,
        approved_by=current_user.id,
        approved_at=datetime.utcnow()
    )
    
    db.add(transaction)
    
    # automated GL Journalization
    # Debit: Loan Portfolio (1210)
    # Credit: Member Savings (2010)
    AccountingService.record_transaction(
        db=db,
        transaction_id=transaction.transaction_ref,
        transaction_type=models.TransactionType.LOAN_DISBURSEMENT.value,
        amount=loan.principal_amount,
        description=f"Loan Disbursement: {loan.loan_number} -> {account.account_number}",
        created_by=current_user.id,
        debit_gl_code="1210",
        credit_gl_code="2010"
    )
    
    # Update account balance
    account.balance += loan.principal_amount
    account.available_balance += loan.principal_amount
    
    # COBAC C3: Freeze member's SHARES account as collateral
    shares_account = db.query(models.Account).filter(
        models.Account.member_id == loan.member_id,
        models.Account.account_type == models.AccountType.SHARES,
        models.Account.is_active == True
    ).first()
    if shares_account and not shares_account.is_frozen:
        shares_account.is_frozen = True
        shares_account.frozen_reason = f"COBAC C3: Collateral lock for active loan {loan.loan_number}"
    
    # Update loan status
    loan.status = models.LoanStatus.ACTIVE
    loan.disbursement_date = datetime.utcnow()
    
    db.commit()
    db.refresh(transaction)
    
    # Log disbursement
    audit = AuditLogger(db, current_user, request)
    audit.log_transaction(
        transaction_type="LOAN_DISBURSEMENT",
        transaction_id=transaction.transaction_ref,
        amount=float(loan.principal_amount),
        account_id=account.account_number,
        description=f"Disbursed loan {loan.loan_number} to account {account.account_number}"
    )
    
    return schemas.TransactionResponse.model_validate(transaction)


@router.post("/repayments", response_model=schemas.TransactionResponse)
async def make_loan_repayment(
    request: Request,
    repayment: schemas.LoanRepaymentRequest,
    current_user: models.User = Depends(require_teller),
    db: Session = Depends(get_db)
):
    """
    Process a loan repayment
    
    - Validates loan is active
    - Updates payment tracking
    - Creates repayment transaction
    """
    from app.auth import generate_transaction_ref
    
    loan = db.query(models.Loan).filter(models.Loan.id == repayment.loan_id).first()
    
    if not loan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Loan not found"
        )
    
    if loan.status not in [models.LoanStatus.ACTIVE, models.LoanStatus.DELINQUENT]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Loan is not active (current status: {loan.status.value})"
        )
    
    # Get payment account
    account = db.query(models.Account).filter(
        models.Account.id == repayment.account_id,
        models.Account.member_id == loan.member_id,
        models.Account.is_active == True
    ).first()
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment account not found or inactive"
        )
    
    # Check sufficient funds
    if account.available_balance < repayment.amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Insufficient funds in payment account"
        )
    
    # Create repayment transaction
    transaction = models.Transaction(
        transaction_ref=generate_transaction_ref(),
        account_id=account.id,
        transaction_type=models.TransactionType.LOAN_REPAYMENT,
        amount=repayment.amount,
        currency="XAF",
        debit_account=account.account_number,
        credit_account="1210",  # Loan Portfolio
        balance_after=account.balance - repayment.amount,
        description=f"Loan repayment - {loan.loan_number}",
        created_by=current_user.id
    )
    
    db.add(transaction)
    
    # Update account balance
    account.balance -= repayment.amount
    account.available_balance -= repayment.amount
    
    # Update loan tracking
    loan.amount_paid += repayment.amount
    loan.amount_outstanding -= repayment.amount
    loan.last_payment_date = datetime.utcnow()
    
    # Update schedule items
    remaining_payment = repayment.amount
    total_principal_paid = Decimal("0")
    total_interest_paid = Decimal("0")

    for schedule_item in loan.schedules:
        if not schedule_item.is_paid and remaining_payment > 0:
            amount_due = schedule_item.total_amount - schedule_item.principal_paid - schedule_item.interest_paid
            
            if remaining_payment >= amount_due:
                # Full installment payment
                p_paid = schedule_item.principal_amount - schedule_item.principal_paid
                i_paid = schedule_item.interest_amount - schedule_item.interest_paid
                
                schedule_item.principal_paid = schedule_item.principal_amount
                schedule_item.interest_paid = schedule_item.interest_amount
                schedule_item.is_paid = True
                schedule_item.paid_at = datetime.utcnow()
                
                total_principal_paid += p_paid
                total_interest_paid += i_paid
                remaining_payment -= amount_due
            else:
                # Partial payment (apply to interest first, then principal)
                interest_remaining = schedule_item.interest_amount - schedule_item.interest_paid
                
                if remaining_payment >= interest_remaining:
                    # Pays off all interest, rest to principal
                    total_interest_paid += interest_remaining
                    schedule_item.interest_paid = schedule_item.interest_amount
                    remaining_payment -= interest_remaining
                    
                    total_principal_paid += remaining_payment
                    schedule_item.principal_paid += remaining_payment
                    remaining_payment = 0
                else:
                    # All goes to interest
                    total_interest_paid += remaining_payment
                    schedule_item.interest_paid += remaining_payment
                    remaining_payment = 0

    # automated GL Journalization
    # Debit: Member Savings (2010)
    # Credit: Loan Portfolio (1210) for Principal
    # Credit: Interest Income (4110) for Interest
    if total_principal_paid > 0:
        AccountingService.record_transaction(
            db=db,
            transaction_id=f"PRN-{transaction.transaction_ref}",
            transaction_type="LOAN_PRINCIPAL_REPAYMENT",
            amount=total_principal_paid,
            description=f"Loan Principal Repayment: {account.account_number} -> {loan.loan_number}",
            created_by=current_user.id,
            debit_gl_code="2010",
            credit_gl_code="1210"
        )
    
    if total_interest_paid > 0:
        AccountingService.record_transaction(
            db=db,
            transaction_id=f"INT-{transaction.transaction_ref}",
            transaction_type="LOAN_INTEREST_REPAYMENT",
            amount=total_interest_paid,
            description=f"Loan Interest Repayment: {account.account_number} -> {loan.loan_number}",
            created_by=current_user.id,
            debit_gl_code="2010",
            credit_gl_code="4110"
        )
    
    # Check if loan is fully paid
    if loan.amount_outstanding <= 0:
        loan.status = models.LoanStatus.CLOSED
        
        # Release guarantors
        for guarantor in loan.guarantors:
            guarantor.is_released = True
            guarantor.released_at = datetime.utcnow()
    
    # Check delinquency
    elif loan.status == models.LoanStatus.DELINQUENT:
        # Check if now current
        overdue_schedules = [s for s in loan.schedules if not s.is_paid and s.due_date < datetime.now().date()]
        if not overdue_schedules:
            loan.status = models.LoanStatus.ACTIVE
            loan.delinquency_days = 0
    
    db.commit()
    db.refresh(transaction)
    
    # Log repayment
    audit = AuditLogger(db, current_user, request)
    audit.log_transaction(
        transaction_type="LOAN_REPAYMENT",
        transaction_id=transaction.transaction_ref,
        amount=float(repayment.amount),
        account_id=account.account_number,
        description=f"Repayment of {repayment.amount} FCFA for loan {loan.loan_number}"
    )
    
    return schemas.TransactionResponse.model_validate(transaction)


@router.get("/stats/portfolio")
async def get_loan_portfolio_stats(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get loan portfolio statistics
    """
    # Total portfolio
    total_principal = db.query(func.sum(models.Loan.principal_amount)).scalar() or Decimal("0")
    total_outstanding = db.query(func.sum(models.Loan.amount_outstanding)).scalar() or Decimal("0")
    
    # By status
    active_loans = db.query(models.Loan).filter(models.Loan.status == models.LoanStatus.ACTIVE).count()
    delinquent_loans = db.query(models.Loan).filter(models.Loan.status == models.LoanStatus.DELINQUENT).count()
    
    delinquent_amount = db.query(func.sum(models.Loan.amount_outstanding)).filter(
        models.Loan.status == models.LoanStatus.DELINQUENT
    ).scalar() or Decimal("0")
    
    # Today's disbursements
    from datetime import date
    today = date.today()
    disbursed_today = db.query(func.sum(models.Loan.principal_amount)).filter(
        func.date(models.Loan.disbursement_date) == today
    ).scalar() or Decimal("0")
    
    return {
        "total_portfolio": float(total_principal),
        "total_outstanding": float(total_outstanding),
        "active_loans": active_loans,
        "delinquent_loans": delinquent_loans,
        "delinquent_amount": float(delinquent_amount),
        "disbursed_today": float(disbursed_today),
        "par_rate": float(delinquent_amount / total_outstanding * 100) if total_outstanding > 0 else 0
    }

@router.get("/applications/{loan_id}/dossier")
async def get_loan_dossier(
    loan_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Detailed dossier for Credit Committee review"""
    if current_user.role not in [models.UserRole.BOARD_MEMBER, models.UserRole.SYSTEM_ADMIN, models.UserRole.OPS_DIRECTOR]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return ReportingService.get_loan_dossier(db, loan_id)