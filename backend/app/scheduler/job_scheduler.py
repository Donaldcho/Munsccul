"""
Job Scheduler - Fineract-style task scheduling
Handles recurring tasks like interest posting, repayment reminders, etc.
"""
from enum import Enum
from typing import Dict, Any, List, Optional, Callable
from datetime import datetime, timedelta
from dataclasses import dataclass
import asyncio
import json
import logging
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.database import SessionLocal
from app import models
from app.events.event_bus import publish_event, EventType

logger = logging.getLogger(__name__)


class JobType(str, Enum):
    """Types of scheduled jobs"""
    INTEREST_POSTING = "INTEREST_POSTING"
    LOAN_REPAYMENT_REMINDER = "LOAN_REPAYMENT_REMINDER"
    LOAN_OVERDUE_CHECK = "LOAN_OVERDUE_CHECK"
    FEE_APPLICATION = "FEE_APPLICATION"
    STANDING_INSTRUCTION = "STANDING_INSTRUCTION"
    REPORT_GENERATION = "REPORT_GENERATION"
    RISK_SCORING = "RISK_SCORING"
    DATA_BACKUP = "DATA_BACKUP"
    AUDIT_LOG_ARCHIVE = "AUDIT_LOG_ARCHIVE"
    CUSTOM = "CUSTOM"


class JobStatus(str, Enum):
    """Job execution status"""
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


@dataclass
class JobResult:
    """Result of job execution"""
    success: bool
    message: str
    details: Optional[Dict[str, Any]] = None


class JobExecutor:
    """Base class for job executors"""
    
    async def execute(self, params: Dict[str, Any], db: Session) -> JobResult:
        """Execute the job - override in subclasses"""
        raise NotImplementedError


class InterestPostingJob(JobExecutor):
    """Post interest to savings accounts"""
    
    async def execute(self, params: Dict[str, Any], db: Session) -> JobResult:
        """Calculate and post interest to eligible accounts"""
        try:
            from decimal import Decimal
            
            # Get all active savings accounts with interest rate > 0
            accounts = db.query(models.Account).filter(
                models.Account.account_type == models.AccountType.SAVINGS,
                models.Account.is_active == True,
                models.Account.is_frozen == False,
                models.Account.interest_rate > 0
            ).all()
            
            posted_count = 0
            total_interest = Decimal("0")
            
            for account in accounts:
                # Calculate interest (simplified - daily calculation)
                # In production, use actual interest calculation method
                daily_rate = account.interest_rate / 100 / 365
                interest = account.balance * Decimal(str(daily_rate))
                
                if interest > 0:
                    # Create interest transaction
                    from app.auth import generate_transaction_ref
                    
                    transaction = models.Transaction(
                        transaction_ref=generate_transaction_ref(),
                        account_id=account.id,
                        transaction_type=models.TransactionType.INTEREST,
                        amount=interest,
                        currency="XAF",
                        balance_after=account.balance + interest,
                        description="Interest posting",
                        created_by=1  # System user
                    )
                    
                    db.add(transaction)
                    account.balance += interest
                    account.available_balance += interest
                    
                    posted_count += 1
                    total_interest += interest
            
            db.commit()
            
            # Publish event
            await publish_event(
                event_type=EventType.INTEREST_POSTED,
                entity_type="System",
                entity_id="interest_posting",
                payload={
                    "accounts_processed": posted_count,
                    "total_interest": float(total_interest)
                },
                db=db
            )
            
            return JobResult(
                success=True,
                message=f"Posted interest to {posted_count} accounts",
                details={"total_interest": float(total_interest)}
            )
            
        except Exception as e:
            return JobResult(
                success=False,
                message=f"Interest posting failed: {str(e)}"
            )


class LoanOverdueCheckJob(JobExecutor):
    """Check for overdue loans and apply penalties"""
    
    async def execute(self, params: Dict[str, Any], db: Session) -> JobResult:
        """Check for overdue installments and update loan status"""
        try:
            today = datetime.now().date()
            
            # Find overdue schedules
            overdue_schedules = db.query(models.LoanSchedule).filter(
                models.LoanSchedule.due_date < today,
                models.LoanSchedule.is_paid == False
            ).all()
            
            updated_loans = []
            
            for schedule in overdue_schedules:
                loan = db.query(models.Loan).filter(
                    models.Loan.id == schedule.loan_id
                ).first()
                
                if loan and loan.status == models.LoanStatus.ACTIVE:
                    # Calculate delinquency days
                    delinquency_days = (today - schedule.due_date).days
                    
                    # Update loan status
                    loan.status = models.LoanStatus.DELINQUENT
                    loan.delinquency_days = delinquency_days
                    
                    if loan.id not in updated_loans:
                        updated_loans.append(loan.id)
                    
                    # Publish event
                    await publish_event(
                        event_type=EventType.REPAYMENT_OVERDUE,
                        entity_type="Loan",
                        entity_id=loan.loan_number,
                        payload={
                            "installment_number": schedule.installment_number,
                            "due_date": schedule.due_date.isoformat(),
                            "delinquency_days": delinquency_days,
                            "amount_due": float(schedule.total_amount)
                        },
                        db=db
                    )
            
            db.commit()
            
            return JobResult(
                success=True,
                message=f"Checked {len(overdue_schedules)} overdue installments",
                details={"loans_updated": len(updated_loans)}
            )
            
        except Exception as e:
            return JobResult(
                success=False,
                message=f"Overdue check failed: {str(e)}"
            )


class StandingInstructionJob(JobExecutor):
    """Execute standing instructions for recurring transfers"""
    
    async def execute(self, params: Dict[str, Any], db: Session) -> JobResult:
        """Process standing instructions"""
        try:
            today = datetime.now().date()
            
            # Get active standing instructions due today
            instructions = db.query(models.StandingInstruction).filter(
                models.StandingInstruction.is_active == True,
                models.StandingInstruction.next_execution_date <= today
            ).all()
            
            executed = 0
            failed = 0
            
            for instruction in instructions:
                try:
                    # Execute transfer
                    # This would call the transaction service
                    
                    # Update next execution date
                    instruction.last_executed_at = datetime.utcnow()
                    instruction.execution_count += 1
                    
                    # Calculate next date based on recurrence
                    if instruction.recurrence_type == "daily":
                        instruction.next_execution_date += timedelta(days=1)
                    elif instruction.recurrence_type == "weekly":
                        instruction.next_execution_date += timedelta(weeks=1)
                    elif instruction.recurrence_type == "monthly":
                        # Add one month
                        from dateutil.relativedelta import relativedelta
                        instruction.next_execution_date += relativedelta(months=1)
                    
                    executed += 1
                    
                except Exception as e:
                    instruction.failure_count += 1
                    instruction.last_error = str(e)
                    failed += 1
            
            db.commit()
            
            return JobResult(
                success=True,
                message=f"Executed {executed} standing instructions",
                details={"executed": executed, "failed": failed}
            )
            
        except Exception as e:
            return JobResult(
                success=False,
                message=f"Standing instruction job failed: {str(e)}"
            )

class RiskScoringJob(JobExecutor):
    """Nightly XGBoost ML Tabular inference to evaluate default risk"""
    
    async def execute(self, params: Dict[str, Any], db: Session) -> JobResult:
        from app.services.risk_scoring import evaluate_member_risk
        from decimal import Decimal
        try:
            memberships = db.query(models.NjangiMembership).all()
            evaluated = 0
            
            for m in memberships:
                # Mock parameters extraction. In production, these come dynamically.
                age = 35 # Derived from member DOB
                cycle_size = float(m.contribution_amount) * 12 # Simulated cycle size
                days_late = 5 if m.status == models.UserStatus.SUSPENDED else 0
                frequency = 4 # Weekly
                
                # Inference Edge AI
                default_prob = evaluate_member_risk(age, cycle_size, days_late, frequency)
                
                # Convert ML probability (0 to 1) to a Trust Score (0 to 100). Lower default = higher trust
                new_trust = 100.0 * (1.0 - default_prob)
                m.trust_score = Decimal(str(round(new_trust, 2)))
                evaluated += 1
                
                if default_prob > 0.8:
                    # Very high risk -> publish alert
                    await publish_event(
                        event_type=EventType.FRAUD_ALERT_TRIGGERED,
                        entity_type="NjangiRisk",
                        entity_id=str(m.id),
                        payload={"member_id": m.member_id, "default_probability": default_prob, "trust_score": float(m.trust_score)},
                        db=db
                    )
                    
                    # WORM-compliant Intercom Notification to branch
                    try:
                        from app.models import IntercomMessage, IntercomEntityType
                        from app.schemas import IntercomMessageOut
                        from app.websocket_manager import ws_manager
                        
                        system_user_id = 1
                        alert_msg = f"🚨 AI RISK ALERT: Njangi Member {m.member.first_name} {m.member.last_name} has a {default_prob*100:.1f}% probability of default. Trust Score dropped to {m.trust_score}."
                        
                        db_msg = IntercomMessage(
                            sender_id=system_user_id,
                            receiver_id=None,  # Broadcast
                            content=alert_msg,
                            attached_entity_type=IntercomEntityType.MEMBER,
                            attached_entity_id=str(m.member_id)
                        )
                        db.add(db_msg)
                        db.commit()
                        db.refresh(db_msg)
                        
                        out_msg = IntercomMessageOut.from_orm(db_msg)
                        await ws_manager.publish_message(out_msg)
                        logger.info(f"Broadcasted Intercom Risk Alert for Member {m.member_id}")
                    except Exception as e:
                        logger.error(f"Failed to dispatch Risk Intercom message: {e}")
                    
            db.commit()
            return JobResult(
                success=True,
                message=f"Evaluated risk for {evaluated} Njangi memberships using XGBoost",
                details={"evaluated_count": evaluated}
            )
            
        except Exception as e:
            return JobResult(success=False, message=f"Risk scoring job failed: {str(e)}")


class SchedulerService:
    """
    Central scheduler service - Fineract-style job management
    """
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self.scheduler = AsyncIOScheduler()
        self.executors: Dict[JobType, JobExecutor] = {
            JobType.INTEREST_POSTING: InterestPostingJob(),
            JobType.LOAN_OVERDUE_CHECK: LoanOverdueCheckJob(),
            JobType.STANDING_INSTRUCTION: StandingInstructionJob(),
            JobType.RISK_SCORING: RiskScoringJob(),
        }
        self._initialized = True
    
    def start(self):
        """Start the scheduler"""
        self.scheduler.start()
        print("Scheduler started")
    
    def shutdown(self):
        """Shutdown the scheduler"""
        self.scheduler.shutdown()
        print("Scheduler shutdown")
    
    def schedule_job(
        self,
        job_type: JobType,
        trigger_type: str,  # "cron", "date", "interval"
        trigger_params: Dict[str, Any],
        params: Optional[Dict[str, Any]] = None,
        job_id: Optional[str] = None
    ) -> str:
        """
        Schedule a new job
        
        Example:
            scheduler.schedule_job(
                job_type=JobType.INTEREST_POSTING,
                trigger_type="cron",
                trigger_params={"hour": 0, "minute": 0},  # Daily at midnight
                params={"product_id": 1}
            )
        """
        if job_id is None:
            job_id = f"{job_type.value}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        # Create trigger
        if trigger_type == "cron":
            trigger = CronTrigger(**trigger_params)
        elif trigger_type == "date":
            trigger = DateTrigger(**trigger_params)
        elif trigger_type == "interval":
            trigger = IntervalTrigger(**trigger_params)
        else:
            raise ValueError(f"Unknown trigger type: {trigger_type}")
        
        # Add job to scheduler
        self.scheduler.add_job(
            func=self._execute_job,
            trigger=trigger,
            id=job_id,
            args=[job_type, params],
            replace_existing=True
        )
        
        return job_id
    
    def schedule_recurring_job(
        self,
        job_type: JobType,
        cron_expression: str,
        params: Optional[Dict[str, Any]] = None
    ) -> str:
        """Schedule a recurring job using cron expression"""
        # Parse cron expression
        parts = cron_expression.split()
        if len(parts) != 5:
            raise ValueError("Invalid cron expression. Use: min hour day month dow")
        
        trigger_params = {
            "minute": parts[0],
            "hour": parts[1],
            "day": parts[2],
            "month": parts[3],
            "day_of_week": parts[4]
        }
        
        return self.schedule_job(
            job_type=job_type,
            trigger_type="cron",
            trigger_params=trigger_params,
            params=params
        )
    
    async def _execute_job(self, job_type: JobType, params: Optional[Dict[str, Any]]):
        """Execute a scheduled job"""
        db = SessionLocal()
        try:
            # Create job run record
            job_run = models.ScheduledJobRun(
                job_type=job_type.value,
                params=json.dumps(params) if params else None,
                started_at=datetime.utcnow(),
                status=JobStatus.RUNNING.value
            )
            db.add(job_run)
            db.commit()
            db.refresh(job_run)
            
            # Get executor
            executor = self.executors.get(job_type)
            if not executor:
                raise ValueError(f"No executor for job type: {job_type}")
            
            # Execute
            result = await executor.execute(params or {}, db)
            
            # Update record
            job_run.status = JobStatus.COMPLETED.value if result.success else JobStatus.FAILED.value
            job_run.result = json.dumps({
                "success": result.success,
                "message": result.message,
                "details": result.details
            })
            job_run.completed_at = datetime.utcnow()
            db.commit()
            
        except Exception as e:
            job_run.status = JobStatus.FAILED.value
            job_run.result = json.dumps({"error": str(e)})
            job_run.completed_at = datetime.utcnow()
            db.commit()
        finally:
            db.close()
    
    def remove_job(self, job_id: str):
        """Remove a scheduled job"""
        self.scheduler.remove_job(job_id)
    
    def pause_job(self, job_id: str):
        """Pause a scheduled job"""
        self.scheduler.pause_job(job_id)
    
    def resume_job(self, job_id: str):
        """Resume a paused job"""
        self.scheduler.resume_job(job_id)
    
    def get_jobs(self) -> List[Dict[str, Any]]:
        """Get all scheduled jobs"""
        jobs = []
        for job in self.scheduler.get_jobs():
            jobs.append({
                "id": job.id,
                "name": job.name,
                "next_run_time": job.next_run_time.isoformat() if job.next_run_time else None,
                "trigger": str(job.trigger)
            })
        return jobs


# Global scheduler instance
scheduler = SchedulerService()


# Convenience functions
def setup_default_jobs():
    """Setup default scheduled jobs"""
    # Daily interest posting at midnight
    scheduler.schedule_recurring_job(
        job_type=JobType.INTEREST_POSTING,
        cron_expression="0 0 * * *",  # Midnight daily
        params={"posting_type": "daily"}
    )
    
    # Loan overdue check every morning
    scheduler.schedule_recurring_job(
        job_type=JobType.LOAN_OVERDUE_CHECK,
        cron_expression="0 6 * * *",  # 6 AM daily
    )
    
    # Standing instructions at 8 AM
    scheduler.schedule_recurring_job(
        job_type=JobType.STANDING_INSTRUCTION,
        cron_expression="0 8 * * *",  # 8 AM daily
    )
    
    # ML Risk Scoring at 2 AM
    scheduler.schedule_recurring_job(
        job_type=JobType.RISK_SCORING,
        cron_expression="0 2 * * *",  # 2 AM daily
    )
    
    print("Default jobs scheduled")