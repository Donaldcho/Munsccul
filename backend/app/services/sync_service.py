from sqlalchemy.orm import Session
from app import models
from app.schemas import BulkSyncRequest
from app.services.accounting import AccountingService
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)

def process_bulk_sync(db: Session, payload: BulkSyncRequest) -> dict:
    """
    Processes incoming branch transactions with STRICT IDEMPOTENCY.
    """
    received_count = len(payload.transactions)
    if received_count == 0:
        return {"received": 0, "processed": 0, "skipped": 0}

    # 1. Extract all incoming transaction references
    incoming_refs = [txn.transaction_ref for txn in payload.transactions]

    # 2. Bulk Idempotency Check (O(1) lookup against DB)
    # Fetch all refs from the DB that match the incoming batch
    existing_records = db.query(models.Transaction.transaction_ref)\
        .filter(models.Transaction.transaction_ref.in_(incoming_refs)).all()
    
    # Create a fast-lookup set of already processed references
    existing_ref_set = {record[0] for record in existing_records}

    processed_count = 0
    skipped_count = len(existing_ref_set)

    try:
        # 3. Process ONLY new transactions
        for item in payload.transactions:
            if item.transaction_ref in existing_ref_set:
                continue # IDEMPOTENCY HIT: Skip to prevent double-counting

            # Find the account at HQ by its number
            account = db.query(models.Account).filter(models.Account.account_number == item.account_id).first()
            if not account:
                logger.error(f"Sync error: Account {item.account_id} not found at HQ for txn {item.transaction_ref}")
                continue # Skip or handle error

            # Calculate balance after locally at HQ if possible, 
            # or just accept the branch's view (riskier but sometimes necessary if HQ state is out of sync)
            # For now, we'll use a placeholder or calculate it.
            # Realistically, HQ should maintain its own ledger state.
            
            # Create the Transaction Record
            new_txn = models.Transaction(
                transaction_ref=item.transaction_ref,
                account_id=account.id,
                amount=Decimal(str(item.amount)),
                transaction_type=item.transaction_type,
                branch_origin_id=item.branch_id,
                description=item.description,
                debit_account=item.debit_account,
                credit_account=item.credit_account,
                currency=item.currency,
                balance_after=account.balance, # Temporary, will be updated by AccountingService
                created_by=item.created_by,
                sync_status=models.SyncStatus.SYNCED,
                created_at=item.timestamp
            )
            db.add(new_txn)

            # Update General Ledger using existing AccountingService
            AccountingService.record_transaction(
                db=db,
                transaction_id=item.transaction_ref,
                transaction_type=item.transaction_type,
                amount=Decimal(str(item.amount)),
                description=item.description or f"Synced transaction {item.transaction_ref}",
                created_by=item.created_by,
                debit_gl_code=item.debit_account,
                credit_gl_code=item.credit_account
            )
            
            # Update the account balance at HQ
            if item.transaction_type in ["DEPOSIT", "LOAN_REPAYMENT", "SHARE_PURCHASE"]:
                account.balance += Decimal(str(item.amount))
                account.available_balance += Decimal(str(item.amount))
            elif item.transaction_type in ["WITHDRAWAL", "TRANSFER"]:
                account.balance -= Decimal(str(item.amount))
                account.available_balance -= Decimal(str(item.amount))
            
            # Correct the balance_after
            new_txn.balance_after = account.balance
            
            processed_count += 1

        # 4. Atomic Commit: All new transactions in this batch succeed or fail together
        db.commit()

        logger.info(f"Sync from {payload.branch_code}: Received={received_count}, Processed={processed_count}, Skipped={skipped_count}")
        return {
            "received": received_count,
            "processed": processed_count,
            "skipped": skipped_count,
            "status": "success"
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Bulk sync failed for {payload.branch_code}: {str(e)}")
        raise e
