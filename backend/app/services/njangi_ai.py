from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Dict, Any
from app import models

class NjangiAIService:
    @staticmethod
    def calculate_loan_readiness(member_id: int, db: Session) -> Dict[str, Any]:
        """
        Calculate a member's readiness for a formal loan based on Njangi behavior.
        """
        memberships = db.query(models.NjangiMembership).filter(
            models.NjangiMembership.member_id == member_id
        ).all()
        
        if not memberships:
            return {"member_id": member_id, "readiness_score": 0, "status": "No Njangi History", "avg_trust_score": 0, "total_on_time_streak": 0}
            
        avg_trust = sum(m.trust_score for m in memberships) / len(memberships)
        total_streak = sum(m.on_time_streak for m in memberships)
        
        # Simple readiness formula: 
        # (Avg Trust Score * 0.7) + (Max Streak bonus * 0.3)
        readiness = (avg_trust * Decimal("0.7")) + (Decimal(min(total_streak, 10)) * Decimal("3.0"))
        readiness = min(Decimal("100.00"), readiness)
        
        status = "Excellent" if readiness > 80 else "Good" if readiness > 50 else "Building Trust"
        
        return {
            "member_id": member_id,
            "readiness_score": float(readiness),
            "status": status,
            "avg_trust_score": float(avg_trust),
            "total_on_time_streak": total_streak
        }

    @staticmethod
    def analyze_group_health(group_id: int, db: Session) -> List[models.NjangiAIInsight]:
        """
        Generate insights based on recent group activity.
        """
        insights = []
        
        # 1. Check for Default Risks
        at_risk_members = db.query(models.NjangiMembership).filter(
            models.NjangiMembership.group_id == group_id,
            models.NjangiMembership.trust_score < 40
        ).all()
        
        for m in at_risk_members:
            insight = models.NjangiAIInsight(
                group_id=group_id,
                insight_type=models.InsightType.DEFAULT_WARNING,
                message=f"High Risk: Member {m.member.first_name} has a declining trust score ({m.trust_score})."
            )
            db.add(insight)
            insights.append(insight)
            
        # 2. Check for Streaks
        champion_members = db.query(models.NjangiMembership).filter(
            models.NjangiMembership.group_id == group_id,
            models.NjangiMembership.on_time_streak >= 5
        ).all()
        
        for m in champion_members:
            insight = models.NjangiAIInsight(
                group_id=group_id,
                insight_type=models.InsightType.STREAK_ACHIEVEMENT,
                message=f"Achievement: {m.member.first_name} has reached a 5-cycle on-time streak!"
            )
            db.add(insight)
            insights.append(insight)
            
        db.commit()
        return insights
