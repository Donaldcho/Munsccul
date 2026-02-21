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
            pdf.set_font('helvetica', '', 9)
            for row in data:
                for key in headers:
                    val = row.get(key, "")
                    if isinstance(val, float):
                        val = f"{val:,.2f}"
                    pdf.cell(col_width, 10, str(val)[:20], border=1)
                pdf.ln()

        # Create temp file
        fd, path = tempfile.mkstemp(suffix=".pdf", prefix=f"{report_name}_")
        os.close(fd)
        
        pdf.output(path)
        return path
