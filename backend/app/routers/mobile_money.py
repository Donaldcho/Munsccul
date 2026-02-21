"""
Mobile Money Router - MTN/Orange MoMo Integration
"""
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, BackgroundTasks
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user, require_teller
from app.audit import AuditLogger
from app.integrations.mobile_money import get_mobile_money_service, MobileMoneyError
from app import models, schemas

router = APIRouter(prefix="/mobile-money", tags=["Mobile Money"])


@router.get("/providers")
async def list_providers(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List configured mobile money providers"""
    configs = db.query(models.MobileMoneyConfig).all()
    
    return [
        {
            "provider": c.provider.value,
            "collection_enabled": c.collection_enabled,
            "disbursement_enabled": c.disbursement_enabled,
            "min_amount": float(c.min_amount),
            "max_amount": float(c.max_amount),
            "fee_percentage": float(c.fee_percentage),
            "fee_fixed": float(c.fee_fixed),
            "is_active": c.is_active
        }
        for c in configs
    ]


@router.post("/collect")
async def collect_payment(
    request: Request,
    background_tasks: BackgroundTasks,
    provider: str,
    phone_number: str,
    amount: float,
    account_id: int,
    description: Optional[str] = "",
    current_user: models.User = Depends(require_teller),
    db: Session = Depends(get_db)
):
    """
    Collect payment from customer via mobile money
    
    - **provider**: mtn_momo or orange_money
    - **phone_number**: Customer phone number
    - **amount**: Amount to collect (FCFA)
    - **account_id**: Account to credit
    """
    try:
        # Get provider enum
        provider_enum = models.MobileMoneyProvider(provider)
        
        # Get service
        service = get_mobile_money_service(db)
        
        # Collect payment
        transaction = await service.collect_payment(
            provider=provider_enum,
            phone_number=phone_number,
            amount=Decimal(str(amount)),
            account_id=account_id,
            description=description
        )
        
        # Log
        audit = AuditLogger(db, current_user, request)
        audit.log(
            action="MOBILE_MONEY_COLLECTION",
            entity_type="MobileMoneyTransaction",
            entity_id=str(transaction.id),
            new_values={
                "provider": provider,
                "phone_number": phone_number,
                "amount": amount
            }
        )
        
        return {
            "transaction_id": transaction.id,
            "reference": transaction.external_reference,
            "status": transaction.status,
            "message": f"Collection request sent to {provider}"
        }
        
    except MobileMoneyError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid provider: {provider}"
        )


@router.post("/disburse")
async def disburse_funds(
    request: Request,
    provider: str,
    phone_number: str,
    amount: float,
    account_id: int,
    description: Optional[str] = "",
    current_user: models.User = Depends(require_teller),
    db: Session = Depends(get_db)
):
    """
    Disburse funds to customer via mobile money
    
    - **provider**: mtn_momo or orange_money
    - **phone_number**: Recipient phone number
    - **amount**: Amount to send (FCFA)
    - **account_id**: Account to debit
    """
    try:
        provider_enum = models.MobileMoneyProvider(provider)
        service = get_mobile_money_service(db)
        
        transaction = await service.disburse_funds(
            provider=provider_enum,
            phone_number=phone_number,
            amount=Decimal(str(amount)),
            account_id=account_id,
            description=description
        )
        
        # Log
        audit = AuditLogger(db, current_user, request)
        audit.log(
            action="MOBILE_MONEY_DISBURSEMENT",
            entity_type="MobileMoneyTransaction",
            entity_id=str(transaction.id),
            new_values={
                "provider": provider,
                "phone_number": phone_number,
                "amount": amount
            }
        )
        
        return {
            "transaction_id": transaction.id,
            "reference": transaction.external_reference,
            "status": transaction.status,
            "message": f"Disbursement request sent to {provider}"
        }
        
    except MobileMoneyError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/transactions")
async def list_transactions(
    provider: Optional[str] = None,
    status: Optional[str] = None,
    phone_number: Optional[str] = None,
    limit: int = 50,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List mobile money transactions"""
    query = db.query(models.MobileMoneyTransaction)
    
    if provider:
        query = query.filter(models.MobileMoneyTransaction.provider == provider)
    if status:
        status = status.upper()
        query = query.filter(models.MobileMoneyTransaction.status == status)
    if phone_number:
        query = query.filter(models.MobileMoneyTransaction.phone_number == phone_number)
    
    transactions = query.order_by(
        models.MobileMoneyTransaction.created_at.desc()
    ).limit(limit).all()
    
    return [
        {
            "id": t.id,
            "provider": t.provider.value,
            "transaction_type": t.transaction_type,
            "phone_number": t.phone_number,
            "amount": float(t.amount),
            "status": t.status,
            "external_reference": t.external_reference,
            "created_at": t.created_at,
            "completed_at": t.completed_at
        }
        for t in transactions
    ]


@router.get("/transactions/{transaction_id}")
async def get_transaction(
    transaction_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get mobile money transaction details"""
    transaction = db.query(models.MobileMoneyTransaction).filter(
        models.MobileMoneyTransaction.id == transaction_id
    ).first()
    
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found"
        )
    
    return {
        "id": transaction.id,
        "provider": transaction.provider.value,
        "transaction_type": transaction.transaction_type,
        "phone_number": transaction.phone_number,
        "amount": float(transaction.amount),
        "provider_fee": float(transaction.provider_fee),
        "platform_fee": float(transaction.platform_fee),
        "status": transaction.status,
        "external_reference": transaction.external_reference,
        "external_transaction_id": transaction.external_transaction_id,
        "provider_response": transaction.provider_response,
        "error_message": transaction.error_message,
        "created_at": transaction.created_at,
        "completed_at": transaction.completed_at
    }


@router.post("/callback/{provider}")
async def handle_callback(
    provider: str,
    data: dict,
    db: Session = Depends(get_db)
):
    """
    Handle callback from mobile money provider
    
    This endpoint is called by the mobile money provider
    to notify us of transaction status updates
    """
    try:
        provider_enum = models.MobileMoneyProvider(provider)
        service = get_mobile_money_service(db)
        
        result = await service.process_callback(provider_enum, data)
        
        return result
        
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid provider: {provider}"
        )


@router.post("/admin/configure")
async def configure_provider(
    request: Request,
    provider: str,
    api_base_url: str,
    api_key: Optional[str] = None,
    api_secret: Optional[str] = None,
    collection_enabled: bool = True,
    disbursement_enabled: bool = True,
    min_amount: float = 100,
    max_amount: float = 500000,
    fee_percentage: float = 0,
    fee_fixed: float = 0,
    current_user: models.User = Depends(get_current_user),  # Should be admin
    db: Session = Depends(get_db)
):
    """Configure a mobile money provider (Admin only)"""
    # Check admin permission
    if current_user.role.value not in ["SYSTEM_ADMIN", "BRANCH_MANAGER"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required"
        )
    
    try:
        provider_enum = models.MobileMoneyProvider(provider)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid provider: {provider}"
        )
    
    # Check if config exists
    config = db.query(models.MobileMoneyConfig).filter(
        models.MobileMoneyConfig.provider == provider_enum
    ).first()
    
    if config:
        # Update existing
        config.api_base_url = api_base_url
        if api_key:
            config.api_key = api_key
        if api_secret:
            config.api_secret = api_secret
        config.collection_enabled = collection_enabled
        config.disbursement_enabled = disbursement_enabled
        config.min_amount = Decimal(str(min_amount))
        config.max_amount = Decimal(str(max_amount))
        config.fee_percentage = Decimal(str(fee_percentage))
        config.fee_fixed = Decimal(str(fee_fixed))
    else:
        # Create new
        config = models.MobileMoneyConfig(
            provider=provider_enum,
            api_base_url=api_base_url,
            api_key=api_key,
            api_secret=api_secret,
            collection_enabled=collection_enabled,
            disbursement_enabled=disbursement_enabled,
            min_amount=Decimal(str(min_amount)),
            max_amount=Decimal(str(max_amount)),
            fee_percentage=Decimal(str(fee_percentage)),
            fee_fixed=Decimal(str(fee_fixed))
        )
        db.add(config)
    
    db.commit()
    db.refresh(config)
    
    # Log
    audit = AuditLogger(db, current_user, request)
    audit.log(
        action="MOBILE_MONEY_CONFIG",
        entity_type="MobileMoneyConfig",
        entity_id=str(config.id),
        new_values={
            "provider": provider,
            "api_base_url": api_base_url,
            "collection_enabled": collection_enabled,
            "disbursement_enabled": disbursement_enabled
        }
    )
    
    return {
        "message": f"{provider} configured successfully",
        "config": {
            "provider": config.provider.value,
            "collection_enabled": config.collection_enabled,
            "disbursement_enabled": config.disbursement_enabled
        }
    }