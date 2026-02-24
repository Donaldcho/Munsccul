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
    def generate_daily_cash_flow(db: Session, target_date: date) -> Dict[str, Any]:
        """
        Generates the Daily Cash Flow Matrix Report.
        Groups transactions by 'purpose' and pivots by 'payment_channel'.
        Supports structured categories for the Cameroonian standard layout.
        """
        from datetime import datetime
        start_of_day = datetime.combine(target_date, datetime.min.time())
        end_of_day = datetime.combine(target_date, datetime.max.time())

        # 1. Fetch Transactions for the day
        transactions = db.query(
            models.Transaction.purpose,
            models.Transaction.payment_channel,
            models.Transaction.transaction_type,
            func.sum(models.Transaction.amount).label('total_amount'),
            func.string_agg(models.Transaction.external_reference, ', ').label('refs'),
            func.string_agg(models.Transaction.comments, '; ').label('all_comments')
        ).filter(
            models.Transaction.created_at >= start_of_day,
            models.Transaction.created_at <= end_of_day
        ).group_by(
            models.Transaction.purpose,
            models.Transaction.payment_channel,
            models.Transaction.transaction_type
        ).all()

        # 2. Calculate Brought Forward (B/F) Balances per channel
        # We look at all transactions before today
        bf_query = db.query(
            models.Transaction.payment_channel,
            func.sum(
                case(
                    (models.Transaction.transaction_type.in_([
                        models.TransactionType.DEPOSIT, 
                        models.TransactionType.LOAN_REPAYMENT,
                        models.TransactionType.FEE,
                        models.TransactionType.INTEREST
                    ]), models.Transaction.amount),
                    (models.Transaction.transaction_type.in_([
                        models.TransactionType.WITHDRAWAL,
                        models.TransactionType.LOAN_DISBURSEMENT,
                        models.TransactionType.TRANSFER # Transfers from source
                    ]), -models.Transaction.amount),
                    else_=0
                )
            ).label('balance')
        ).filter(
            models.Transaction.created_at < start_of_day
        ).group_by(
            models.Transaction.payment_channel
        ).all()

        bf_row = {
            "description": "BROUGHT FORWARD BALANCES",
            "corp_banks": 0.0, "mf_balico": 0.0, "mf_a": 0.0, "mf_glovic": 0.0, 
            "cash": 0.0, "mobile_om": 0.0, "mobile_mtn": 0.0, "total": 0.0, "refs": "", "comments": ""
        }
        
        for row in bf_query:
            amount = float(row.balance or 0)
            channel = row.payment_channel
            if channel == models.PaymentChannel.BANK_TRANSFER: bf_row["corp_banks"] += amount
            elif channel == models.PaymentChannel.BALI_CO: bf_row["mf_balico"] += amount
            elif channel == models.PaymentChannel.MICROFINANCE_A: bf_row["mf_a"] += amount
            elif channel == models.PaymentChannel.GLOVIC: bf_row["mf_glovic"] += amount
            elif channel == models.PaymentChannel.CASH: bf_row["cash"] += amount
            elif channel == models.PaymentChannel.ORANGE_MONEY: bf_row["mobile_om"] += amount
            elif channel == models.PaymentChannel.MTN_MOMO: bf_row["mobile_mtn"] += amount
            bf_row["total"] += amount

        # 3. Define Sections
        sections = {
            "INFLOWS": [],
            "EXPENSES": [],
            "PROJECTED_EXPENSES": []
        }

        # Purpose groups (case-insensitive for robustness)
        inflow_purposes = ["SAVINGS", "DEPOSIT", "CURRENT_ACT", "SHARE_CAPITAL", "ENTRANCE_FEES", 
                          "SOLIDARITY_FUND", "BUILDING_CONTRIBUTION", "LOAN_REPAYMENT", 
                          "PREFERENCE_SHARES", "LOAN_PROCESSING_FEES", "CASH_FROM_BALICOP"]
        expense_purposes = ["PAYMENT_OF_A_SUPPLIER", "CASH_EXPENSES", "CLIENT_EXPENSES"]
        projected_purposes = ["SALARIES", "LOANS", "TAXATION_AND_CNPS"]

        rows_data = {}
        for row in transactions:
            p_orig = row.purpose or "OTHER"
            purpose = p_orig.upper()
            
            if purpose not in rows_data:
                rows_data[purpose] = {
                    "description": p_orig.replace("_", " ").title(),
                    "refs": "",
                    "corp_banks": 0.0, "mf_balico": 0.0, "mf_a": 0.0, "mf_glovic": 0.0,
                    "cash": 0.0, "mobile_om": 0.0, "mobile_mtn": 0.0, 
                    "total": 0.0, "comments": ""
                }
            
            amount = float(row.total_amount)
            # Adjust sign based on transaction type if necessary? 
            # In Daily Cash Flow matrix, usually absolute movement per purpose/channel is shown.
            # But flows are positive in their respective sections.
            
            channel = row.payment_channel
            if channel == models.PaymentChannel.BANK_TRANSFER: rows_data[purpose]["corp_banks"] += amount
            elif channel == models.PaymentChannel.BALI_CO: rows_data[purpose]["mf_balico"] += amount
            elif channel == models.PaymentChannel.MICROFINANCE_A: rows_data[purpose]["mf_a"] += amount
            elif channel == models.PaymentChannel.GLOVIC: rows_data[purpose]["mf_glovic"] += amount
            elif channel == models.PaymentChannel.CASH: rows_data[purpose]["cash"] += amount
            elif channel == models.PaymentChannel.ORANGE_MONEY: rows_data[purpose]["mobile_om"] += amount
            elif channel == models.PaymentChannel.MTN_MOMO: rows_data[purpose]["mobile_mtn"] += amount
            
            rows_data[purpose]["total"] += amount
            if row.refs: rows_data[purpose]["refs"] = (rows_data[purpose]["refs"] + ", " + row.refs).strip(", ")
            if row.all_comments: rows_data[purpose]["comments"] = (rows_data[purpose]["comments"] + "; " + row.all_comments).strip("; ")

        # Distribute into sections
        for purpose, data in rows_data.items():
            if any(p in purpose for p in inflow_purposes):
                sections["INFLOWS"].append(data)
            elif any(p in purpose for p in expense_purposes):
                sections["EXPENSES"].append(data)
            elif any(p in purpose for p in projected_purposes):
                sections["PROJECTED_EXPENSES"].append(data)
            else:
                # Default to inflows if unknown for now, or another category
                sections["INFLOWS"].append(data)

        # 4. Final calculation
        report = {
            "date": target_date.isoformat(),
            "year": target_date.year,
            "brought_forward": bf_row,
            "sections": sections
        }
        
        return report

    @staticmethod
    def export_to_excel(report_name: str, data: List[Dict[str, Any]] | Dict[str, Any]) -> str:
        """
        Exports report data to an Excel file and returns the file path.
        Handles specialized formatting for Daily Cash Flow reports.
        """
        import pandas as pd
        import tempfile
        import os

        # Specialized formatting for Daily Cash Flow
        if report_name == "daily_cash_flow" and isinstance(data, dict) and "sections" in data:
            return ReportingService._format_daily_cash_flow_excel(data)

        # Handle different data structures for generic export
        if isinstance(data, dict):
            if "items" in data:
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
    def _format_daily_cash_flow_excel(report_data: Dict[str, Any]) -> str:
        """
        Advanced Excel formatting for Daily Cash Flow Statement matching the requested image.
        Uses openpyxl for merging, borders, and backgrounds.
        """
        from openpyxl import Workbook
        from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
        import tempfile
        import os

        wb = Workbook()
        ws = wb.active
        ws.title = "Daily Cash Flow"

        # Styles
        title_font = Font(bold=True, color="FFFFFF", size=14)
        header_font = Font(bold=True, color="FFFFFF", size=10)
        bold_font = Font(bold=True)
        center_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
        left_align = Alignment(horizontal="left", vertical="center")
        blue_fill = PatternFill(start_color="3366FF", fill_type="solid")
        light_blue_fill = PatternFill(start_color="CCE5FF", fill_type="solid")
        grey_fill = PatternFill(start_color="E0E0E0", fill_type="solid")
        
        thin_border = Border(
            left=Side(style='thin'), right=Side(style='thin'), 
            top=Side(style='thin'), bottom=Side(style='thin')
        )

        # 1. Title
        ws.merge_cells('A1:L1')
        title_cell = ws['A1']
        title_cell.value = f"DAILY CASH FLOW STATEMENT {report_data['year']}"
        title_cell.font = title_font
        title_cell.fill = blue_fill
        title_cell.alignment = center_align

        # 2. Main Headers
        # Column A, B, C span rows 3 to 5
        for col, text in [(1, "DATES"), (2, "DESCRIPTION"), (3, "REFS"), (11, "TOTAL"), (12, "COMMENTS")]:
            ws.merge_cells(start_row=3, start_column=col, end_row=5, end_column=col)
            cell = ws.cell(row=3, column=col)
            cell.value = text
            cell.font = header_font
            cell.fill = blue_fill
            cell.alignment = center_align
            # Apply border to all cells in the merge range
            for r in range(3, 6):
                ws.cell(row=r, column=col).border = thin_border

        # PAYMENT CENTRES top header (D3:J3)
        ws.merge_cells(start_row=3, start_column=4, end_row=3, end_column=10)
        cell = ws.cell(row=3, column=4)
        cell.value = "PAYMENT CENTRES"
        cell.font = header_font
        cell.fill = blue_fill
        cell.alignment = center_align
        for c in range(4, 11):
            ws.cell(row=3, column=c).border = thin_border

        # Sub-headers (Row 4)
        sub_headers = [
            (4, 5, "CORPORATE BANKS"), (6, 8, "MICRO FINANCE / PARTNERS"), (9, 10, "MOBILE CASH")
        ]
        for start_col, end_col, text in sub_headers:
            ws.merge_cells(start_row=4, start_column=start_col, end_row=4, end_column=end_col)
            cell = ws.cell(row=4, column=start_col)
            cell.value = text
            cell.font = header_font
            cell.fill = blue_fill
            cell.alignment = center_align
            for c in range(start_col, end_col + 1):
                ws.cell(row=4, column=c).border = thin_border

        # Sub-sub-headers (Row 5)
        cols = [
            (4, "CORPBANK"), (5, "BALICO-X"), (6, "BALI CO"), (7, "A"), (8, "GLOVIC"), (9, "OM"), (10, "MTN MoMo")
        ]
        for col, text in cols:
            cell = ws.cell(row=5, column=col)
            cell.value = text
            cell.font = header_font
            cell.fill = blue_fill
            cell.alignment = center_align
            cell.border = thin_border

        # 3. Data Printing
        current_row = 6
        
        def write_row(row_data, is_total=False):
            nonlocal current_row
            desc_cell = ws.cell(row=current_row, column=2, value=row_data.get("description", ""))
            ws.cell(row=current_row, column=1, value=report_data.get("date", "")) # Date
            ws.cell(row=current_row, column=3, value=row_data.get("refs", ""))
            
            # Map channels
            mapping = {4: "corp_banks", 5: "mf_balico", 6: "mf_balico", 7: "mf_a", 8: "mf_glovic", 9: "mobile_om", 10: "mobile_mtn", 11: "total"}
            for col, key in mapping.items():
                val = row_data.get(key, 0.0)
                cell = ws.cell(row=current_row, column=col, value=val)
                cell.number_format = '#,##0'
                if is_total: cell.font = bold_font
                cell.border = thin_border
            
            ws.cell(row=current_row, column=12, value=row_data.get("comments", ""))
            
            # Styles for desc and date
            for col in [1, 2, 3, 12]:
                ws.cell(row=current_row, column=col).border = thin_border
                if is_total: ws.cell(row=current_row, column=col).font = bold_font
            
            current_row += 1

        # A. Brought Forward
        write_row(report_data["brought_forward"])
        # Format BF row
        for c in range(1, 13):
            ws.cell(row=current_row-1, column=c).fill = light_blue_fill

        # B. Inflows Section
        ws.cell(row=current_row, column=2, value="INFLOWS").font = bold_font
        current_row += 1
        
        inflow_total = {k: 0.0 for k in ["corp_banks", "mf_balico", "mf_a", "mf_glovic", "mobile_om", "mobile_mtn", "total"]}
        for row in report_data["sections"]["INFLOWS"]:
            write_row(row)
            for k in inflow_total: inflow_total[k] += row.get(k, 0.0)
        
        # Total Inflows row
        inflow_total["description"] = "TOTAL INFLOWS"
        write_row(inflow_total, is_total=True)
        for c in range(1, 13): ws.cell(row=current_row-1, column=c).fill = grey_fill

        # C. Expenses Section
        ws.cell(row=current_row, column=2, value="EXPENSES").font = bold_font
        current_row += 1
        
        expense_total = {k: 0.0 for k in ["corp_banks", "mf_balico", "mf_a", "mf_glovic", "mobile_om", "mobile_mtn", "total"]}
        for row in report_data["sections"]["EXPENSES"]:
            write_row(row)
            for k in expense_total: expense_total[k] += row.get(k, 0.0)
            
        expense_total["description"] = "TOTAL EXPENSES"
        write_row(expense_total, is_total=True)
        for c in range(1, 13): ws.cell(row=current_row-1, column=c).fill = grey_fill

        # D. Projected Section
        ws.cell(row=current_row, column=2, value="PROJECTED EXPENSES").font = bold_font
        current_row += 1
        for row in report_data["sections"]["PROJECTED_EXPENSES"]:
            write_row(row)

        # E. Closing Balance (Balance @ Hand)
        closing_bal = {
            "description": "BALANCE @ HAND",
            "corp_banks": report_data["brought_forward"]["corp_banks"] + inflow_total["corp_banks"] - expense_total["corp_banks"],
            "mf_balico": report_data["brought_forward"]["mf_balico"] + inflow_total["mf_balico"] - expense_total["mf_balico"],
            "mf_a": report_data["brought_forward"]["mf_a"] + inflow_total["mf_a"] - expense_total["mf_a"],
            "mf_glovic": report_data["brought_forward"]["mf_glovic"] + inflow_total["mf_glovic"] - expense_total["mf_glovic"],
            "mobile_om": report_data["brought_forward"]["mobile_om"] + inflow_total["mobile_om"] - expense_total["mobile_om"],
            "mobile_mtn": report_data["brought_forward"]["mobile_mtn"] + inflow_total["mobile_mtn"] - expense_total["mobile_mtn"],
            "total": report_data["brought_forward"]["total"] + inflow_total["total"] - expense_total["total"]
        }
        write_row(closing_bal, is_total=True)
        for c in range(1, 13): ws.cell(row=current_row-1, column=c).fill = blue_fill; ws.cell(row=current_row-1, column=c).font = Font(bold=True, color="FFFFFF")

        # Column widths
        ws.column_dimensions['B'].width = 40
        ws.column_dimensions['C'].width = 15
        for col_letter in 'DEFGHIJK':
             ws.column_dimensions[col_letter].width = 12

        # Create temp file
        fd, path = tempfile.mkstemp(suffix=".xlsx", prefix="DailyCashFlow_")
        os.close(fd)
        wb.save(path)
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

    @staticmethod
    def generate_cobac_liquidity(db: Session, period: str = 'daily') -> Dict[str, Any]:
        """
        Calculates the COBAC Liquidity Ratio.
        Ratio = (Liquid Assets) / (Short-term Liabilities)
        Standard requires > 100% for compliance.
        """
        # 1. Liquid Assets (Cash + Banks + Equivalents - Class 1, Category 10)
        # We sum all journal entries for accounts starting with '10'
        liquid_assets_query = db.query(
            func.sum(
                case(
                    (models.GLJournalEntry.entry_type == 'DEBIT', models.GLJournalEntry.amount),
                    else_=-models.GLJournalEntry.amount
                )
            )
        ).join(
            models.GLAccount, 
            models.GLAccount.id == models.GLJournalEntry.gl_account_id
        ).filter(
            models.GLAccount.account_code.like('10%')
        ).scalar() or 0.0

        # 2. Short-term Liabilities (Member Deposits - Class 2, Category 20)
        # We sum all journal entries for accounts starting with '20'
        # For liabilities, Credits increase the balance
        liabilities_query = db.query(
            func.sum(
                case(
                    (models.GLJournalEntry.entry_type == 'CREDIT', models.GLJournalEntry.amount),
                    else_=-models.GLJournalEntry.amount
                )
            )
        ).join(
            models.GLAccount, 
            models.GLAccount.id == models.GLJournalEntry.gl_account_id
        ).filter(
            models.GLAccount.account_code.like('20%')
        ).scalar() or 0.0

        liquid_assets = float(liquid_assets_query)
        short_term_liabilities = float(liabilities_query)

        # Calculate ratio
        if short_term_liabilities > 0:
            ratio = (liquid_assets / short_term_liabilities) * 100
        else:
            # If no liabilities but we have cash, we are effectively 100%+ liquid
            ratio = 150.0 if liquid_assets > 0 else 100.0
            
        status = "COMPLIANT" if ratio >= 100 else "NON-COMPLIANT"
        
        return {
            "ratio": round(ratio, 2),
            "liquidity_ratio": round(ratio, 2), # Compatibility with Director/Board Dashboard
            "status": status,
            "liquid_assets": liquid_assets,
            "short_term_liabilities": short_term_liabilities,
            "period": period,
            "as_of": date.today().isoformat()
        }

    @staticmethod
    def get_board_metrics(db: Session) -> Dict[str, Any]:
        """
        Aggregates data for the Board Executive Overview.
        Includes Sector Distribution, Branch Performance, and Critical Anomalies.
        """
        # 1. Loan Distribution by "Sector" (using Product Name as proxy)
        sector_dist = db.query(
            models.LoanProduct.name,
            func.sum(models.Loan.amount_outstanding).label('value')
        ).join(models.Loan, models.Loan.product_id == models.LoanProduct.id) \
         .filter(models.Loan.status.in_(['ACTIVE', 'DELINQUENT'])) \
         .group_by(models.LoanProduct.name).all()
        
        sector_data = [{"name": row.name, "value": float(row.value or 0)} for row in sector_dist]

        # 2. Branch Performance (Deposits vs Loans)
        branches = db.query(models.Branch).all()
        branch_data = []
        for b in branches:
            loans = db.query(func.sum(models.Loan.amount_outstanding)) \
                      .join(models.Member, models.Loan.member_id == models.Member.id) \
                      .filter(models.Member.branch_id == b.id).scalar() or 0
            deposits = db.query(func.sum(models.Account.balance)) \
                         .join(models.Member, models.Account.member_id == models.Member.id) \
                         .filter(models.Member.branch_id == b.id).scalar() or 0
            branch_data.append({"name": b.name, "loans": float(loans), "deposits": float(deposits)})

        # 3. Anomaly Radar (Latest Audit Logs for Security Events)
        anomalies_raw = db.query(models.AuditLog).filter(
            models.AuditLog.action.in_(['LOAN_DISBURSEMENT', 'USER_LOGIN_FAILED', 'PERMISSION_DENIED', 'LARGE_TRANSACTION', 'SYSTEM_OVERRIDE'])
        ).order_by(models.AuditLog.created_at.desc()).limit(5).all()
        
        anomalies = []
        for a in anomalies_raw:
            severity = "CRITICAL" if a.action in ['PERMISSION_DENIED', 'SYSTEM_OVERRIDE'] else "WARNING"
            anomalies.append({
                "id": a.id,
                "type": severity,
                "msg": a.description or a.action,
                "time": a.created_at.strftime("%I:%M %p"),
                "location": "System" # Could derive from IP/User branch
            })

        return {
            "sector_data": sector_data,
            "branch_data": branch_data,
            "anomalies": anomalies
        }

    @staticmethod
    def get_loan_dossier(db: Session, loan_id: int) -> Dict[str, Any]:
        """
        Aggregates a full dossier for the Credit Committee review.
        Includes Scorecard data (Tenure, Savings, History).
        """
        loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
        if not loan:
            return {}
            
        member = loan.member
        # Tenure in months
        from datetime import datetime
        tenure_days = (datetime.now() - member.created_at).days
        tenure_months = tenure_days // 30

        # Total Savings across all accounts
        total_savings = db.query(func.sum(models.Account.balance)).filter(
            models.Account.member_id == member.id,
            models.Account.account_type.in_(['SAVINGS', 'SHARES'])
        ).scalar() or 0

        # Loan History
        past_loans = db.query(models.Loan).filter(
            models.Loan.member_id == member.id,
            models.Loan.id != loan_id
        ).all()
        
        history = {
            "total_count": len(past_loans),
            "fully_repaid": len([l for l in past_loans if l.status == 'CLOSED']),
            "total_borrowed": float(sum(l.principal_amount for l in past_loans)),
            "delinquency_history": any(l.delinquency_days > 0 for l in past_loans)
        }

        return {
            "loan_id": loan.id,
            "member_tenure_months": tenure_months,
            "total_savings": float(total_savings),
            "loan_history": history,
            "is_insider": loan.is_insider_loan,
            "collateral": [
                {"type": "Savings", "value": float(total_savings), "description": "Lien on shares/savings"},
                # ... other collateral logic ...
            ]
        }
