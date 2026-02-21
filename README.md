# CamCCUL Next-Gen Core Banking System

A modern, COBAC-compliant core banking solution designed for Credit Unions in Cameroon and the CEMAC region.

## Features

### Core Banking Modules
- **Member Management (KYC)**: Full KYC compliance with biometric support, National ID verification, and Next of Kin tracking
- **Account Management**: Savings, Current, and Fixed Deposit accounts with OHADA-compliant double-entry bookkeeping
- **Core Transactions**: Deposits, withdrawals, and transfers with real-time balance updates
- **Loan Management**: Configurable loan products, amortization schedules, guarantor management, and delinquency tracking

### Advanced Fineract Features
- **Event System**: Event sourcing with webhooks for external integrations (MTN/Orange MoMo, SMS, etc.)
- **Job Scheduler**: Automated recurring tasks (interest posting, overdue checks, standing instructions)
- **GL Accounting**: Full double-entry bookkeeping with General Ledger accounts and journal entries
- **Charges & Fees**: Configurable charges for loans, accounts, and transactions
- **Standing Instructions**: Recurring transfers between accounts
- **Holiday Management**: Non-working days configuration for accurate scheduling
- **Multi-currency Support**: Multiple currency handling with exchange rates
- **Teller Management**: Cash management for tellers/cashiers
- **Data Tables**: Custom fields for extending entities (Fineract-style)

### Mobile Money Integration
- **MTN MoMo**: Full integration with MTN Mobile Money Cameroon
- **Orange Money**: Orange Money integration ready
- **Collection**: Request payments from customers via mobile money
- **Disbursement**: Send money to customers via mobile money
- **Callback Handling**: Real-time transaction status updates
- **Fee Management**: Automatic fee calculation and tracking

### Compliance & Security (Fineract-Level)
- **COBAC Compliance**: Full compliance with Regulation EMF R-2017/06
- **Immutable Audit Trail**: Write-Once-Read-Many (WORM) audit logs for all actions
- **Four-Eyes Principle**: Transactions over 500,000 FCFA require manager approval
- **Data Sovereignty**: Designed for local Cameroon hosting (Camtel Zamengoué)
- **OHADA Accounting**: Double-entry bookkeeping compliant with OHADA standards
- **OWASP Top 10 Protection**: Comprehensive security headers and input validation

### Advanced Security Features (Apache Fineract-Compliant)
- **JWT with Refresh Token Rotation**: Short-lived access tokens (15 min) with rotating refresh tokens (7 days)
- **Brute Force Protection**: Automatic account lockout after 5 failed login attempts
- **Fine-Grained Permissions**: Role-based access control with 50+ granular permissions
- **AES-256 Encryption**: Field-level encryption for sensitive PII data at rest
- **Password Security**: Bcrypt hashing with password history (prevents reuse)
- **Rate Limiting**: API rate limiting to prevent abuse
- **Security Headers**: OWASP-compliant headers (CSP, HSTS, X-Frame-Options, etc.)
- **2FA Ready**: Architecture supports TOTP-based two-factor authentication

### Technical Features
- **Offline-First Architecture**: Works without internet for up to 7 days
- **RESTful API**: Modern JSON-based API for easy integration
- **Role-Based Access Control**: Teller, Branch Manager, Credit Officer, Auditor, and System Admin roles
- **Responsive Web Interface**: Works on desktop and tablet devices

## Technology Stack

### Backend
- **Framework**: FastAPI (Python 3.11+)
- **Database**: PostgreSQL 15
- **Authentication**: JWT tokens with bcrypt password hashing
- **ORM**: SQLAlchemy 2.0

### Frontend
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Build Tool**: Vite

### Infrastructure
- **Containerization**: Docker & Docker Compose
- **Web Server**: Nginx
- **Caching**: Redis

## Quick Start

### Prerequisites
- Docker and Docker Compose installed
- Git

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd camccul-banking-system
```

2. Start the application:
```bash
docker-compose up -d
```

3. Access the application:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs

### Default Credentials

| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | System Administrator |
| manager | manager123 | Branch Manager |
| teller | teller123 | Teller |
| credit | credit123 | Credit Officer |

## API Endpoints

### Authentication (Enhanced Security)
- `POST /api/v1/auth/login` - User login with brute force protection
- `POST /api/v1/auth/refresh` - Refresh access token (token rotation)
- `POST /api/v1/auth/logout` - Logout from all sessions
- `POST /api/v1/auth/logout-session` - Logout from single session
- `GET /api/v1/auth/me` - Get current user
- `GET /api/v1/auth/me/permissions` - Get user permissions
- `GET /api/v1/auth/me/sessions` - Get active sessions
- `POST /api/v1/auth/change-password` - Change password with history check
- `POST /api/v1/auth/2fa/setup` - Set up two-factor authentication
- `POST /api/v1/auth/2fa/verify` - Verify 2FA code

### Members
- `GET /api/v1/members` - List members
- `POST /api/v1/members` - Create member
- `GET /api/v1/members/{id}` - Get member details
- `PUT /api/v1/members/{id}` - Update member

### Accounts
- `GET /api/v1/accounts` - List accounts
- `POST /api/v1/accounts` - Create account
- `GET /api/v1/accounts/{id}` - Get account details
- `GET /api/v1/accounts/{id}/balance` - Get account balance

### Transactions
- `GET /api/v1/transactions` - List transactions
- `POST /api/v1/transactions/deposit` - Process deposit
- `POST /api/v1/transactions/withdrawal` - Process withdrawal
- `POST /api/v1/transactions/transfer` - Process transfer
- `POST /api/v1/transactions/approve` - Approve pending transaction

### Loans
- `GET /api/v1/loans/products` - List loan products
- `GET /api/v1/loans/applications` - List loan applications
- `POST /api/v1/loans/applications` - Submit loan application
- `POST /api/v1/loans/applications/{id}/approve` - Approve loan
- `POST /api/v1/loans/applications/{id}/disburse` - Disburse loan
- `POST /api/v1/loans/repayments` - Process repayment

### Reports
- `GET /api/v1/reports/dashboard` - Dashboard statistics
- `GET /api/v1/reports/audit-logs` - Audit logs
- `GET /api/v1/reports/cobac/liquidity` - COBAC liquidity report
- `GET /api/v1/reports/daily-cash-position` - Daily cash position

### Webhooks & Integrations
- `GET /api/v1/webhooks` - List webhooks
- `POST /api/v1/webhooks` - Create webhook
- `PUT /api/v1/webhooks/{id}` - Update webhook
- `DELETE /api/v1/webhooks/{id}` - Delete webhook
- `GET /api/v1/webhooks/{id}/logs` - Webhook delivery logs

### Mobile Money
- `GET /api/v1/mobile-money/providers` - List providers
- `POST /api/v1/mobile-money/collect` - Collect payment
- `POST /api/v1/mobile-money/disburse` - Disburse funds
- `GET /api/v1/mobile-money/transactions` - List transactions
- `POST /api/v1/mobile-money/callback/{provider}` - Provider callback

## Database Schema

### Key Entities
- **Users**: System users with role-based access
- **Branches**: Credit union branch offices
- **Members**: Credit union members with KYC data
- **Accounts**: Member accounts (Savings, Current, Fixed Deposit)
- **Transactions**: Financial transactions with double-entry bookkeeping
- **Loans**: Loan applications and accounts
- **AuditLogs**: Immutable audit trail

### OHADA Compliance
The system uses OHADA-compliant account classes:
- Class 1: Capital accounts
- Class 2: Fixed assets
- Class 3: Inventory accounts
- Class 4: Third-party accounts (loans)
- Class 5: Financial accounts (cash, bank)

## COBAC Compliance

### Regulation EMF R-2017/06
- **Article 31-32**: Immutable audit trails implemented via WORM log architecture
- **Segregation of Duties**: Maker-Checker workflow enforced programmatically
- **Internal Controls**: Four-Eyes Principle for high-value transactions

### SESAME 4.0 Reporting
- Automated prudential reporting
- Dedicated read-replica for regulatory queries
- Python script compatibility for data extraction

### Data Sovereignty (Law No. 2024/017)
- Designed for local Cameroon hosting
- No cross-border data transfer
- Physical storage within Cameroonian territory

## Development

### Backend Development
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend Development
```bash
cd frontend
npm install
npm run dev
```

### Database Migrations
```bash
cd backend
alembic revision --autogenerate -m "Description"
alembic upgrade head
```

## Deployment

### Production Deployment
1. Update environment variables in `docker-compose.yml`
2. Change default passwords
3. Configure SSL certificates
4. Set up backup schedules
5. Deploy:
```bash
docker-compose -f docker-compose.yml up -d
```

### Backup Strategy
- PostgreSQL: Automated daily backups
- Application data: Volume backups
- Audit logs: Immutable storage with 7-year retention

## Security Considerations

1. **Change default passwords** before production deployment
2. **Enable HTTPS** for all communications
3. **Configure firewall** rules appropriately
4. **Regular security updates** for all components
5. **Monitor audit logs** for suspicious activity

## Support

For support and inquiries, contact:
- Email: support@camccul.cm
- Phone: +237 222 123 456

## License

This software is proprietary and confidential. Unauthorized copying, distribution, or use is strictly prohibited.

## Acknowledgments

- CamCCUL - Cameroon Cooperative Credit Union League
- COBAC - Banking Commission of Central Africa
- OHADA - Organization for the Harmonization of Business Law in Africa