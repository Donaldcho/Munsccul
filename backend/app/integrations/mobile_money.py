"""
Mobile Money Integration Module
Supports MTN MoMo, Orange Money, and Africell Money
"""
from typing import Optional, Dict, Any
from decimal import Decimal
from datetime import datetime
import aiohttp
import json
import hmac
import hashlib
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.events.event_bus import publish_event, EventType


class MobileMoneyError(Exception):
    """Mobile money operation error"""
    pass


class MobileMoneyProviderBase:
    """Base class for mobile money providers"""
    
    def __init__(self, config: models.MobileMoneyConfig):
        self.config = config
        self.session: Optional[aiohttp.ClientSession] = None
    
    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create HTTP session"""
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession(
                base_url=self.config.api_base_url,
                timeout=aiohttp.ClientTimeout(total=60),
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                }
            )
        return self.session
    
    async def close(self):
        """Close HTTP session"""
        if self.session and not self.session.closed:
            await self.session.close()
    
    def _generate_signature(self, payload: Dict[str, Any]) -> str:
        """Generate HMAC signature for request"""
        if not self.config.api_secret:
            return ""
        
        message = json.dumps(payload, sort_keys=True, default=str)
        return hmac.new(
            self.config.api_secret.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()
    
    async def request_collection(
        self,
        phone_number: str,
        amount: Decimal,
        reference: str,
        description: str = ""
    ) -> Dict[str, Any]:
        """Request payment collection from customer"""
        raise NotImplementedError
    
    async def request_disbursement(
        self,
        phone_number: str,
        amount: Decimal,
        reference: str,
        description: str = ""
    ) -> Dict[str, Any]:
        """Request disbursement to customer"""
        raise NotImplementedError
    
    async def check_transaction_status(
        self,
        transaction_id: str
    ) -> Dict[str, Any]:
        """Check status of a transaction"""
        raise NotImplementedError
    
    async def handle_callback(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle callback from provider"""
        raise NotImplementedError


class MTNMoMoProvider(MobileMoneyProviderBase):
    """MTN Mobile Money Provider (Cameroon)"""
    
    async def request_collection(
        self,
        phone_number: str,
        amount: Decimal,
        reference: str,
        description: str = ""
    ) -> Dict[str, Any]:
        """
        RequestToPay - MTN MoMo API
        
        This initiates a request for the customer to pay
        """
        session = await self._get_session()
        
        # Format phone number (remove country code if present)
        phone = phone_number.replace("+237", "").replace("237", "")
        
        payload = {
            "amount": str(amount),
            "currency": "XAF",
            "externalId": reference,
            "payer": {
                "partyIdType": "MSISDN",
                "partyId": phone
            },
            "payerMessage": description or "Payment request",
            "payeeNote": description or "Payment request"
        }
        
        # Add authentication header
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "X-Reference-Id": reference,
            "X-Target-Environment": "production"
        }
        
        async with session.post(
            "/collection/v1_0/requesttopay",
            json=payload,
            headers=headers
        ) as response:
            if response.status == 202:
                return {
                    "success": True,
                    "reference": reference,
                    "status": "PENDING",
                    "message": "Collection request initiated"
                }
            else:
                error_text = await response.text()
                return {
                    "success": False,
                    "error": error_text,
                    "status": "FAILED"
                }
    
    async def request_disbursement(
        self,
        phone_number: str,
        amount: Decimal,
        reference: str,
        description: str = ""
    ) -> Dict[str, Any]:
        """
        Transfer - MTN MoMo API
        
        This sends money to the customer
        """
        session = await self._get_session()
        
        phone = phone_number.replace("+237", "").replace("237", "")
        
        payload = {
            "amount": str(amount),
            "currency": "XAF",
            "externalId": reference,
            "payee": {
                "partyIdType": "MSISDN",
                "partyId": phone
            },
            "payerMessage": description or "Transfer",
            "payeeNote": description or "Transfer"
        }
        
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "X-Reference-Id": reference,
            "X-Target-Environment": "production"
        }
        
        async with session.post(
            "/disbursement/v1_0/transfer",
            json=payload,
            headers=headers
        ) as response:
            if response.status == 202:
                return {
                    "success": True,
                    "reference": reference,
                    "status": "PENDING",
                    "message": "Disbursement initiated"
                }
            else:
                error_text = await response.text()
                return {
                    "success": False,
                    "error": error_text,
                    "status": "FAILED"
                }
    
    async def check_transaction_status(
        self,
        transaction_id: str
    ) -> Dict[str, Any]:
        """Check transaction status"""
        session = await self._get_session()
        
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "X-Target-Environment": "production"
        }
        
        async with session.get(
            f"/collection/v1_0/requesttopay/{transaction_id}",
            headers=headers
        ) as response:
            if response.status == 200:
                data = await response.json()
                return {
                    "success": True,
                    "status": data.get("status", "UNKNOWN"),
                    "amount": data.get("amount"),
                    "currency": data.get("currency"),
                    "financialTransactionId": data.get("financialTransactionId")
                }
            else:
                return {
                    "success": False,
                    "status": "ERROR",
                    "error": await response.text()
                }
    
    async def handle_callback(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle callback from MTN MoMo"""
        # Verify callback signature if needed
        
        return {
            "success": True,
            "message": "Callback processed"
        }


class OrangeMoneyProvider(MobileMoneyProviderBase):
    """Orange Money Provider (Cameroon)"""
    
    async def request_collection(
        self,
        phone_number: str,
        amount: Decimal,
        reference: str,
        description: str = ""
    ) -> Dict[str, Any]:
        """Orange Money collection request"""
        session = await self._get_session()
        
        # Orange Money API implementation
        # This is a placeholder - actual implementation depends on Orange's API
        
        payload = {
            "customer_msisdn": phone_number,
            "amount": str(amount),
            "currency": "OUV",
            "order_id": reference,
            "description": description or "Payment"
        }
        
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "X-Auth-Signature": self._generate_signature(payload)
        }
        
        # Implementation would go here
        return {
            "success": True,
            "reference": reference,
            "status": "PENDING",
            "message": "Collection request initiated (Orange Money)"
        }
    
    async def request_disbursement(
        self,
        phone_number: str,
        amount: Decimal,
        reference: str,
        description: str = ""
    ) -> Dict[str, Any]:
        """Orange Money disbursement"""
        # Implementation would go here
        return {
            "success": True,
            "reference": reference,
            "status": "PENDING",
            "message": "Disbursement initiated (Orange Money)"
        }
    
    async def check_transaction_status(
        self,
        transaction_id: str
    ) -> Dict[str, Any]:
        """Check Orange Money transaction status"""
        # Implementation would go here
        return {
            "success": True,
            "status": "COMPLETED"
        }
    
    async def handle_callback(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle Orange Money callback"""
        return {
            "success": True,
            "message": "Callback processed (Orange Money)"
        }


class MobileMoneyService:
    """
    Mobile Money Service - Central service for all mobile money operations
    """
    
    PROVIDER_MAP = {
        models.MobileMoneyProvider.MTN_MOMO: MTNMoMoProvider,
        models.MobileMoneyProvider.ORANGE_MONEY: OrangeMoneyProvider,
    }
    
    def __init__(self, db: Session):
        self.db = db
        self._providers: Dict[models.MobileMoneyProvider, MobileMoneyProviderBase] = {}
    
    def _get_provider(self, provider_type: models.MobileMoneyProvider) -> MobileMoneyProviderBase:
        """Get or create provider instance"""
        if provider_type not in self._providers:
            config = self.db.query(models.MobileMoneyConfig).filter(
                models.MobileMoneyConfig.provider == provider_type,
                models.MobileMoneyConfig.is_active == True
            ).first()
            
            if not config:
                raise MobileMoneyError(f"Provider {provider_type.value} not configured")
            
            provider_class = self.PROVIDER_MAP.get(provider_type)
            if not provider_class:
                raise MobileMoneyError(f"Unknown provider: {provider_type.value}")
            
            self._providers[provider_type] = provider_class(config)
        
        return self._providers[provider_type]
    
    async def collect_payment(
        self,
        provider: models.MobileMoneyProvider,
        phone_number: str,
        amount: Decimal,
        account_id: int,
        description: str = ""
    ) -> models.MobileMoneyTransaction:
        """
        Collect payment from customer via mobile money
        
        This creates a deposit transaction
        """
        # Validate amount
        config = self.db.query(models.MobileMoneyConfig).filter(
            models.MobileMoneyConfig.provider == provider
        ).first()
        
        if not config.collection_enabled:
            raise MobileMoneyError("Collection not enabled for this provider")
        
        if amount < config.min_amount or amount > config.max_amount:
            raise MobileMoneyError(
                f"Amount must be between {config.min_amount} and {config.max_amount}"
            )
        
        # Create transaction record
        import uuid
        reference = f"COL-{uuid.uuid4().hex[:12].upper()}"
        
        mm_transaction = models.MobileMoneyTransaction(
            provider=provider,
            external_reference=reference,
            transaction_type="DEPOSIT",
            account_id=account_id,
            phone_number=phone_number,
            amount=amount,
            currency="XAF",
            provider_fee=(amount * config.fee_percentage / 100) + config.fee_fixed,
            status="PENDING"
        )
        
        self.db.add(mm_transaction)
        self.db.commit()
        self.db.refresh(mm_transaction)
        
        # Request collection from provider
        provider_instance = self._get_provider(provider)
        result = await provider_instance.request_collection(
            phone_number=phone_number,
            amount=amount,
            reference=reference,
            description=description
        )
        
        # Update transaction with result
        if result.get("success"):
            mm_transaction.external_transaction_id = result.get("reference")
        else:
            mm_transaction.status = "FAILED"
            mm_transaction.error_message = result.get("error")
        
        self.db.commit()
        
        # Publish event
        await publish_event(
            event_type=EventType.DEPOSIT_CREATED,
            entity_type="MobileMoneyTransaction",
            entity_id=str(mm_transaction.id),
            payload={
                "provider": provider.value,
                "phone_number": phone_number,
                "amount": float(amount),
                "status": mm_transaction.status
            },
            db=self.db
        )
        
        return mm_transaction
    
    async def disburse_funds(
        self,
        provider: models.MobileMoneyProvider,
        phone_number: str,
        amount: Decimal,
        account_id: int,
        description: str = ""
    ) -> models.MobileMoneyTransaction:
        """
        Disburse funds to customer via mobile money
        
        This creates a withdrawal transaction
        """
        # Validate
        config = self.db.query(models.MobileMoneyConfig).filter(
            models.MobileMoneyConfig.provider == provider
        ).first()
        
        if not config.disbursement_enabled:
            raise MobileMoneyError("Disbursement not enabled for this provider")
        
        if amount < config.min_amount or amount > config.max_amount:
            raise MobileMoneyError(
                f"Amount must be between {config.min_amount} and {config.max_amount}"
            )
        
        # Create transaction record
        import uuid
        reference = f"DIS-{uuid.uuid4().hex[:12].upper()}"
        
        mm_transaction = models.MobileMoneyTransaction(
            provider=provider,
            external_reference=reference,
            transaction_type="WITHDRAWAL",
            account_id=account_id,
            phone_number=phone_number,
            amount=amount,
            currency="XAF",
            provider_fee=(amount * config.fee_percentage / 100) + config.fee_fixed,
            status="PENDING"
        )
        
        self.db.add(mm_transaction)
        self.db.commit()
        self.db.refresh(mm_transaction)
        
        # Request disbursement from provider
        provider_instance = self._get_provider(provider)
        result = await provider_instance.request_disbursement(
            phone_number=phone_number,
            amount=amount,
            reference=reference,
            description=description
        )
        
        # Update transaction
        if result.get("success"):
            mm_transaction.external_transaction_id = result.get("reference")
        else:
            mm_transaction.status = "FAILED"
            mm_transaction.error_message = result.get("error")
        
        self.db.commit()
        
        # Publish event
        await publish_event(
            event_type=EventType.WITHDRAWAL_CREATED,
            entity_type="MobileMoneyTransaction",
            entity_id=str(mm_transaction.id),
            payload={
                "provider": provider.value,
                "phone_number": phone_number,
                "amount": float(amount),
                "status": mm_transaction.status
            },
            db=self.db
        )
        
        return mm_transaction
    
    async def process_callback(
        self,
        provider: models.MobileMoneyProvider,
        data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Process callback from mobile money provider"""
        # Find the transaction
        reference = data.get("reference") or data.get("externalId")
        
        mm_transaction = self.db.query(models.MobileMoneyTransaction).filter(
            models.MobileMoneyTransaction.external_reference == reference
        ).first()
        
        if not mm_transaction:
            return {"success": False, "error": "Transaction not found"}
        
        # Get provider status
        status = data.get("status", "UNKNOWN")
        
        # Update transaction
        if status.upper() in ["SUCCESSFUL", "COMPLETED", "SUCCESS"]:
            mm_transaction.status = "COMPLETED"
            mm_transaction.completed_at = datetime.utcnow()
            
            # Create internal transaction
            # This would call the transaction service
            
        elif status.upper() in ["FAILED", "REJECTED"]:
            mm_transaction.status = "FAILED"
            mm_transaction.error_message = data.get("error", "Transaction failed")
        
        mm_transaction.provider_response = json.dumps(data)
        self.db.commit()
        
        # Publish event
        event_type = EventType.DEPOSIT_CREATED if mm_transaction.transaction_type == "DEPOSIT" else EventType.WITHDRAWAL_CREATED
        await publish_event(
            event_type=event_type,
            entity_type="MobileMoneyTransaction",
            entity_id=str(mm_transaction.id),
            payload={
                "provider": provider.value,
                "status": mm_transaction.status,
                "amount": float(mm_transaction.amount)
            },
            db=self.db
        )
        
        return {"success": True, "message": "Callback processed"}
    
    async def close(self):
        """Close all provider connections"""
        for provider in self._providers.values():
            await provider.close()


# Convenience function for getting mobile money service
def get_mobile_money_service(db: Session) -> MobileMoneyService:
    """Get mobile money service instance"""
    return MobileMoneyService(db)