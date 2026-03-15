from sqlalchemy.orm import Session
from app import models
from app.config import settings
from typing import Any
import json

class PolicyService:
    @staticmethod
    def get_value(db: Session, key: str, default_value: Any = None) -> Any:
        """
        Hierarchy resolution:
        1. DB Active Override
        2. Provided default (usually from settings.XXX)
        """
        active_policy = db.query(models.GlobalPolicy).filter(
            models.GlobalPolicy.policy_key == key,
            models.GlobalPolicy.status == models.PolicyStatus.ACTIVE
        ).first()
        
        if active_policy:
            val = active_policy.policy_value
            # Try to parse as float if it looks like one
            try:
                if "." in val:
                    return float(val)
                return int(val)
            except ValueError:
                return val
                
        return default_value

    @staticmethod
    def get_loan_multiplier(db: Session) -> float:
        return float(PolicyService.get_value(db, "max_borrowing_ratio", settings.SAVINGS_MULTIPLIER))

    @staticmethod
    def get_share_price(db: Session) -> float:
        return float(PolicyService.get_value(db, "share_unit_price", settings.SHARE_PRICE))

    @staticmethod
    def get_min_share_capital(db: Session) -> float:
        return float(PolicyService.get_value(db, "min_share_capital", settings.MIN_SHARE_CAPITAL))

    @staticmethod
    def get_ctr_threshold(db: Session) -> float:
        return float(PolicyService.get_value(db, "ctr_threshold", settings.CTR_THRESHOLD))
