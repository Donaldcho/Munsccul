from datetime import date
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_

from app import models

class ReportingService:
    """
    Financial & Regulatory Reporting Engine (COBAC Compliant)
    Relies exclusively on the Double-Entry General Ledger (GLJournalEntry) for accuracy.
    """

    @staticmethod
    def generate_trial_balance(db: Session, as_of_date: date) -> List[Dict[str, Any]]:
        """
        Generates the Trial Balance (Balance Générale).
        Returns a list of all GL accounts with their total Debits, Credits, and Net Balance.
        Must balance to exactly 0 globally.
        """
        results = db.query(
            models.GLAccount.account_code,
            models.GLAccount.account_name,
            models.GLAccount.account_type,
            func.sum(
                case(
                    (func.date(models.GLJournalEntry.entry_date) < as_of_date, 
                     case((models.GLJournalEntry.entry_type == 'DEBIT', models.GLJournalEntry.amount), else_=-models.GLJournalEntry.amount)),
                    else_=0
                )
            ).label('opening_balance'),
            func.sum(
                case(
                    (and_(func.date(models.GLJournalEntry.entry_date) == as_of_date, models.GLJournalEntry.entry_type == 'DEBIT'), models.GLJournalEntry.amount),
                    else_=0
                )
            ).label('total_debit'),
            func.sum(
                case(
                    (and_(func.date(models.GLJournalEntry.entry_date) == as_of_date, models.GLJournalEntry.entry_type == 'CREDIT'), models.GLJournalEntry.amount),
                    else_=0
                )
            ).label('total_credit')
        ).outerjoin(
            models.GLJournalEntry, 
            models.GLAccount.id == models.GLJournalEntry.gl_account_id
        ).group_by(
            models.GLAccount.account_code,
            models.GLAccount.account_name,
            models.GLAccount.account_type
        ).order_by(models.GLAccount.account_code).all()

        trial_balance = []
        for row in results:
            opening = float(row.opening_balance or 0)
            debit = float(row.total_debit or 0)
            credit = float(row.total_credit or 0)
            
            # Closing Balance calculation (Opening + Movement)
            # Net signed balance ensures total sum is zero
            closing = opening + debit - credit

            # Only include accounts with activity or a balance
            if opening != 0 or debit != 0 or credit != 0:
                trial_balance.append({
                    "account_code": row.account_code,
                    "account_name": row.account_name,
                    "account_type": row.account_type,
                    "opening_balance": opening,
                    "debit": debit,
                    "credit": credit,
                    "closing_balance": closing
                })

        return trial_balance

    @staticmethod
    def generate_balance_sheet(db: Session, as_of_date: date) -> Dict[str, Any]:
        """
        Generates the Balance Sheet (Bilan).
        Assets = Liabilities + Equity
        """
        tb = ReportingService.generate_trial_balance(db, as_of_date)
        
        assets = []
        liabilities = []
        equity = []
        
        total_assets = 0.0
        total_liabilities = 0.0
        total_equity = 0.0

        for account in tb:
            val = account['balance'] if account['balance_type'] == 'DEBIT' else -account['balance']
            if account['account_type'] == 'ASSET':
                assets.append(account)
                total_assets += account['balance'] if account['balance_type'] == 'DEBIT' else -account['balance']
            
            val = account['balance'] if account['balance_type'] == 'CREDIT' else -account['balance']
            if account['account_type'] == 'LIABILITY':
                liabilities.append(account)
                total_liabilities += account['balance'] if account['balance_type'] == 'CREDIT' else -account['balance']
            elif account['account_type'] == 'EQUITY':
                equity.append(account)
                total_equity += account['balance'] if account['balance_type'] == 'CREDIT' else -account['balance']

        # Note: Current Year Net Income should roll into Equity for the BS to balance perfectly.
        # We simulate this by calculating net income from the TB
        net_income = sum([a['balance'] if a['balance_type'] == 'CREDIT' else -a['balance'] for a in tb if a['account_type'] == 'INCOME']) - \
                     sum([a['balance'] if a['balance_type'] == 'DEBIT' else -a['balance'] for a in tb if a['account_type'] == 'EXPENSE'])
                     
        total_equity += net_income
        equity.append({
            "account_code": "NET_INC",
            "account_name": "Net Income (Current Period)",
            "account_type": "EQUITY",
            "balance": abs(net_income),
            "balance_type": "CREDIT" if net_income >=0 else "DEBIT"
        })

        return {
            "as_of_date": as_of_date,
            "assets": {"items": assets, "total": total_assets},
            "liabilities": {"items": liabilities, "total": total_liabilities},
            "equity": {"items": equity, "total": total_equity},
            "is_balanced": abs(total_assets - (total_liabilities + total_equity)) < 0.01 # Float precision allowance
        }

    @staticmethod
    def generate_income_statement(db: Session, start_date: date, end_date: date) -> Dict[str, Any]:
        """
        Generates the Income Statement (Compte de Résultat).
        Revenue - Expenses = Net Profit/Loss
        """
        # For Income Statement we only look at activity within the period
        results = db.query(
            models.GLAccount.account_code,
            models.GLAccount.account_name,
            models.GLAccount.account_type,
            func.sum(
                case((models.GLJournalEntry.entry_type == 'DEBIT', models.GLJournalEntry.amount), else_=0)
            ).label('total_debit'),
            func.sum(
                case((models.GLJournalEntry.entry_type == 'CREDIT', models.GLJournalEntry.amount), else_=0)
            ).label('total_credit')
        ).join(
            models.GLJournalEntry, 
            models.GLAccount.id == models.GLJournalEntry.gl_account_id
        ).filter(
            func.date(models.GLJournalEntry.entry_date) >= start_date,
            func.date(models.GLJournalEntry.entry_date) <= end_date,
            models.GLAccount.account_type.in_(['INCOME', 'EXPENSE'])
        ).group_by(
            models.GLAccount.account_code,
            models.GLAccount.account_name,
            models.GLAccount.account_type
        ).order_by(models.GLAccount.account_code).all()

        income = []
        expenses = []
        total_income = 0.0
        total_expenses = 0.0

        for row in results:
            debit = float(row.total_debit or 0)
            credit = float(row.total_credit or 0)
            
            if row.account_type == 'INCOME':
                balance = credit - debit
                income.append({
                    "account_code": row.account_code,
                    "account_name": row.account_name,
                    "balance": balance
                })
                total_income += balance
            elif row.account_type == 'EXPENSE':
                balance = debit - credit
                expenses.append({
                    "account_code": row.account_code,
                    "account_name": row.account_name,
                    "balance": balance
                })
                total_expenses += balance

        net_profit = total_income - total_expenses

        return {
            "period_start": start_date,
            "period_end": end_date,
            "income": {"items": income, "total": total_income},
            "expenses": {"items": expenses, "total": total_expenses},
            "net_profit": net_profit
        }

    @staticmethod
    def generate_par_report(db: Session, as_of_date: date, officer_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Generates Portfolio At Risk (PAR) Report.
        Groups delinquent loans into 30, 60, 90+ day buckets.
        If officer_id is provided, only aggregates loans assigned to that officer.
        """
        # This queries the Loan table directly since it's a sub-ledger report
        # In a strict environment, we'd reconcile this sub-ledger total with the GL 1210 total
        
        query = db.query(models.Loan).filter(
            models.Loan.status.in_(['ACTIVE', 'DELINQUENT']),
            models.Loan.amount_outstanding > 0
        )
        
        if officer_id is not None:
             query = query.filter(models.Loan.applied_by == officer_id)
             
        loans = query.all()

        par_buckets = {
            "current": {"count": 0, "principal_outstanding": 0.0},
            "par_30": {"count": 0, "principal_outstanding": 0.0},
            "par_60": {"count": 0, "principal_outstanding": 0.0},
            "par_90_plus": {"count": 0, "principal_outstanding": 0.0}
        }
        
        total_portfolio = 0.0

        for loan in loans:
            outstanding = float(loan.amount_outstanding)
            total_portfolio += outstanding
            
            if loan.status == 'ACTIVE' or loan.delinquency_days == 0:
                par_buckets["current"]["count"] += 1
                par_buckets["current"]["principal_outstanding"] += outstanding
            elif loan.delinquency_days <= 30:
                par_buckets["par_30"]["count"] += 1
                par_buckets["par_30"]["principal_outstanding"] += outstanding
            elif loan.delinquency_days <= 60:
                par_buckets["par_60"]["count"] += 1
                par_buckets["par_60"]["principal_outstanding"] += outstanding
            else:
                par_buckets["par_90_plus"]["count"] += 1
                par_buckets["par_90_plus"]["principal_outstanding"] += outstanding

        par_ratio = 0.0
        if total_portfolio > 0:
             # PAR is typically defined as outstanding balance of loans > 30 days late
             total_at_risk = par_buckets["par_30"]["principal_outstanding"] + \
                             par_buckets["par_60"]["principal_outstanding"] + \
                             par_buckets["par_90_plus"]["principal_outstanding"]
             par_ratio = (total_at_risk / total_portfolio) * 100

        return {
            "as_of_date": as_of_date,
            "total_portfolio_outstanding": total_portfolio,
            "par_ratio_percentage": round(par_ratio, 2),
            "buckets": par_buckets
        }

    @staticmethod
    def generate_daily_cash_flow(db: Session, target_date: date) -> List[Dict[str, Any]]:
        """
        Generates the Daily Cash Flow Matrix Report.
        Groups transactions by 'purpose' and pivots by 'payment_channel'.
        """
        from datetime import datetime
        start_of_day = datetime.combine(target_date, datetime.min.time())
        end_of_day = datetime.combine(target_date, datetime.max.time())

        # 1. Fetch Transactions for the day
        transactions = db.query(
            models.Transaction.purpose,
            models.Transaction.payment_channel,
            func.sum(models.Transaction.amount).label('total_amount'),
            func.group_concat(models.Transaction.external_reference).label('refs'),
            func.group_concat(models.Transaction.comments).label('all_comments')
        ).filter(
            models.Transaction.created_at >= start_of_day,
            models.Transaction.created_at <= end_of_day
        ).group_by(
            models.Transaction.purpose,
            models.Transaction.payment_channel
        ).all()

        # 2. Map purposes to human-readable rows
        rows_map = {}
        for row in transactions:
            purpose = row.purpose or "OTHER"
            if purpose not in rows_map:
                rows_map[purpose] = {
                    "description": purpose.replace("_", " ").title(),
                    "refs": "",
                    "corp_banks": 0.0,
                    "mf_balico": 0.0,
                    "mf_a": 0.0,
                    "mf_glovic": 0.0,
                    "cash": 0.0,
                    "mobile_om": 0.0,
                    "mobile_mtn": 0.0,
                    "total": 0.0,
                    "comments": ""
                }
            
            amount = float(row.total_amount)
            channel = row.payment_channel
            
            # Update columns based on channel
            if channel == models.PaymentChannel.BANK_TRANSFER: rows_map[purpose]["corp_banks"] += amount
            elif channel == models.PaymentChannel.BALI_CO: rows_map[purpose]["mf_balico"] += amount
            elif channel == models.PaymentChannel.MICROFINANCE_A: rows_map[purpose]["mf_a"] += amount
            elif channel == models.PaymentChannel.GLOVIC: rows_map[purpose]["mf_glovic"] += amount
            elif channel == models.PaymentChannel.CASH: rows_map[purpose]["cash"] += amount
            elif channel == models.PaymentChannel.ORANGE_MONEY: rows_map[purpose]["mobile_om"] += amount
            elif channel == models.PaymentChannel.MTN_MOMO: rows_map[purpose]["mobile_mtn"] += amount
            
            rows_map[purpose]["total"] += amount
            if row.refs:
                rows_map[purpose]["refs"] = (rows_map[purpose]["refs"] + ", " + row.refs).strip(", ")
            if row.all_comments:
                rows_map[purpose]["comments"] = (rows_map[purpose]["comments"] + "; " + row.all_comments).strip("; ")

        # 3. Handle "Brought Forward" (Opening Balances)
        # In a real system, this would query the previous day's closing balance.
        # Simplified: We'll add a header row.
        matrix = []
        # Add BF row if exists or empty placeholder
        matrix.append({
            "description": "BROUGHT FORWARD BALANCES",
            "corp_banks": 0.0, "mf_balico": 0.0, "mf_a": 0.0, "mf_glovic": 0.0, 
            "cash": 0.0, "mobile_om": 0.0, "mobile_mtn": 0.0, "total": 0.0
        })

        for purpose in sorted(rows_map.keys()):
            matrix.append(rows_map[purpose])

        return matrix

    @staticmethod
    def export_to_excel(report_name: str, data: List[Dict[str, Any]] | Dict[str, Any]) -> str:
        """
        Exports report data to an Excel file and returns the file path.
        """
        import pandas as pd
        import tempfile
        import os

        # Handle different data structures
        if isinstance(data, dict):
            # Flatten dict to list for simple export, or just export parts of it
            # Simplified for Trial Balance which is a list naturally
            if "items" in data:  # e.g., Income Statement
                df = pd.DataFrame(data["items"])
            else:
                df = pd.DataFrame([data])
        else:
            df = pd.DataFrame(data)

        # Create temp file
        fd, path = tempfile.mkstemp(suffix=".xlsx", prefix=f"{report_name}_")
        os.close(fd)
        
        df.to_excel(path, index=False)
        return path

    @staticmethod
    def export_to_pdf(report_name: str, title: str, data: List[Dict[str, Any]]) -> str:
        """
        Exports list-based report data to a simple PDF table using fpdf2.
        """
        from fpdf import FPDF
        import tempfile
        import os

        pdf = FPDF()
        pdf.add_page()
        pdf.set_font('helvetica', 'B', 16)
        pdf.cell(0, 10, title, new_x="LMARGIN", new_y="NEXT", align='C')
        pdf.ln(10)

        if not data:
            pdf.set_font('helvetica', '', 12)
            pdf.cell(0, 10, "No data available.", new_x="LMARGIN", new_y="NEXT")
        else:
            # Table Header
            pdf.set_font('helvetica', 'B', 10)
            headers = list(data[0].keys())
            
            # Very basic column width division
            col_width = pdf.epw / len(headers)
            
            for header in headers:
                pdf.cell(col_width, 10, header.replace("_", " ").title(), border=1)
            pdf.ln()

            # Table Data
            pdf.set_font('helvetica', '', 8)
            grand_total_debit = 0.0
            grand_total_credit = 0.0

            for row in data:
                # Track max height for the row
                max_h = 10
                
                # Calculate grand totals if this is a Trial Balance
                if "debit" in row: grand_total_debit += float(row.get("debit", 0))
                if "credit" in row: grand_total_credit += float(row.get("credit", 0))

                # Start drawing cells
                for key in headers:
                    val = row.get(key, "")
                    if isinstance(val, float):
                        val = f"{val:,.0f}"
                    
                    # Implementation of text wrap using multi_cell
                    # Remember current position to draw borders correctly
                    x = pdf.get_x()
                    y = pdf.get_y()
                    pdf.multi_cell(col_width, 5, str(val), border=1, align='L')
                    # Update max height for the row move to the next cell's start position
                    pdf.set_xy(x + col_width, y)
                pdf.ln(10) # Move to next line after all columns done

            # Grand Totals Row
            if "debit" in data[0] or "credit" in data[0]:
                pdf.set_font('helvetica', 'B', 9)
                pdf.set_fill_color(240, 243, 246)
                pdf.cell(col_width * 3, 10, "GRAND TOTAL:", border=1, fill=True, align='R')
                pdf.cell(col_width, 10, f"{grand_total_debit:,.0f}", border=1, fill=True)
                pdf.cell(col_width, 10, f"{grand_total_credit:,.0f}", border=1, fill=True)
                # Fill remaining cells
                for _ in range(len(headers) - 5):
                    pdf.cell(col_width, 10, "", border=1, fill=True)
                pdf.ln()

        # Create temp file
        fd, path = tempfile.mkstemp(suffix=".pdf", prefix=f"{report_name}_")
        os.close(fd)
        
        pdf.output(path)
        return path
