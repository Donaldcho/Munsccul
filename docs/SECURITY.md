# Security Documentation

## Overview

The CamCCUL Banking System implements enterprise-grade security following Apache Fineract standards and OWASP best practices. This document details the security architecture and implementation.

## Security Features

### 1. Authentication

#### JWT Token Architecture
- **Access Tokens**: Short-lived (15 minutes) JWT tokens
- **Refresh Tokens**: Long-lived (7 days) tokens with automatic rotation
- **Token Rotation**: Each refresh invalidates the old token and issues a new one
- **Secure Storage**: Refresh tokens are hashed (SHA-256) before storage

#### Brute Force Protection
- **Login Attempt Tracking**: All login attempts are logged
- **Account Lockout**: 5 failed attempts trigger 30-minute lockout
- **IP-based Protection**: Separate tracking by IP address
- **Automatic Unlock**: Accounts automatically unlock after cooldown period

#### Two-Factor Authentication (2FA) - Ready
- Architecture supports TOTP-based 2FA
- Delivery methods: TOTP app, SMS, Email
- Backup codes for account recovery
- Role-based bypass capability for admins

### 2. Authorization

#### Fine-Grained Permission System
The system implements 50+ granular permissions beyond simple RBAC:

**Permission Categories:**
- `user:*` - User management
- `member:*` - Member/KYC management
- `account:*` - Account operations
- `transaction:*` - Financial transactions
- `loan:*` - Loan management
- `report:*` - Reporting and analytics
- `audit:*` - Audit log access
- `system:*` - System configuration

**Role-Permission Mapping:**
| Role | Key Permissions |
|------|-----------------|
| System Admin | `*` (all permissions) |
| Branch Manager | `user:read`, `member:*`, `account:*`, `transaction:approve`, `loan:approve` |
| Teller | `member:create`, `member:read`, `transaction:deposit`, `transaction:withdraw` |
| Credit Officer | `loan:*`, `member:read` |
| Auditor | `audit:*`, `report:cobac`, read-only access |

### 3. Data Encryption

#### AES-256 Encryption at Rest
- **Algorithm**: AES-256-CBC with PKCS7 padding
- **Key Management**: Master key from environment variable
- **Encrypted Fields**:
  - National ID
  - Phone numbers
  - Email addresses
  - Physical addresses
  - Fingerprint templates
  - Next of Kin information

#### Password Security
- **Hashing**: Bcrypt with cost factor 12
- **Password History**: Prevents reuse of last 5 passwords
- **Strength Validation**: NIST-compliant password policy
- **Minimum Length**: 8 characters
- **Maximum Length**: 128 characters

### 4. OWASP Compliance

#### Security Headers
All responses include OWASP-recommended headers:

```
Content-Security-Policy: default-src 'self'; ...
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: accelerometer=(), camera=(), ...
```

#### Input Validation
- SQL injection prevention through parameterized queries
- XSS prevention through input sanitization
- Path traversal protection
- Suspicious pattern detection

#### Rate Limiting
- **Login Endpoint**: 5 requests per 5 minutes
- **API General**: 1000 requests per hour
- **Transaction Endpoints**: 60 requests per minute
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### 5. Session Management

#### Token Lifecycle
```
Login → Access Token (15 min) + Refresh Token (7 days)
   ↓
Access Token Expires → Refresh → New Access Token + New Refresh Token
   ↓
Logout → Revoke All Refresh Tokens
```

#### Session Tracking
- IP address logging
- User agent tracking
- Last used timestamp
- Device identification

### 6. Audit & Logging

#### Immutable Audit Trail
- All actions logged with user, IP, timestamp
- Before/after values for updates
- Cannot be modified or deleted
- 7-year retention for compliance

#### Security Events Logged
- Login attempts (success/failure)
- Password changes
- Permission changes
- Sensitive data access
- Transaction approvals
- Configuration changes

## Security Configuration

### Environment Variables

```bash
# Core Security
SECRET_KEY=your-super-secret-key-min-32-chars
REFRESH_SECRET_KEY=your-refresh-secret-key-min-32-chars
ENCRYPTION_KEY=your-32-byte-encryption-key

# JWT Settings
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_LOGIN_ATTEMPTS=5
RATE_LIMIT_LOGIN_WINDOW=300
RATE_LIMIT_LOCKOUT_MINUTES=30

# 2FA Settings
TWO_FACTOR_AUTH_ENABLED=false
TWO_FACTOR_METHOD=totp

# Session
SESSION_TIMEOUT_MINUTES=480
```

### Password Policy

```python
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128
PASSWORD_HISTORY_COUNT = 5
BCRYPT_ROUNDS = 12
```

## API Security

### Authentication Flow

```
1. POST /auth/login
   → Returns: access_token (15 min), refresh_token (7 days)

2. Use access_token in Authorization: Bearer <token> header

3. When access_token expires (401):
   POST /auth/refresh
   { "refresh_token": "..." }
   → Returns: new access_token + new refresh_token

4. Logout:
   POST /auth/logout
   → Revokes all refresh tokens
```

### Secure Cookie Settings

```python
{
    "httponly": True,      # Prevents JavaScript access
    "secure": True,        # HTTPS only
    "samesite": "strict",  # CSRF protection
    "max_age": 604800      # 7 days
}
```

## Compliance

### COBAC Regulation EMF R-2017/06
- Article 31-32: Immutable audit trails ✓
- Segregation of duties (Four-Eyes) ✓
- Internal controls ✓

### Cameroon Law No. 2024/017
- Data sovereignty (local hosting) ✓
- PII encryption ✓
- Access controls ✓

### OWASP Top 10 2021
- A01: Broken Access Control ✓
- A02: Cryptographic Failures ✓
- A03: Injection ✓
- A05: Security Misconfiguration ✓
- A07: Identification and Authentication Failures ✓
- A09: Security Logging and Monitoring Failures ✓

## Security Checklist

### Deployment
- [ ] Change default passwords
- [ ] Generate strong SECRET_KEY
- [ ] Enable HTTPS
- [ ] Configure firewall rules
- [ ] Set up log monitoring
- [ ] Enable rate limiting
- [ ] Configure backup encryption

### Development
- [ ] No hardcoded secrets
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention
- [ ] XSS prevention
- [ ] CSRF protection
- [ ] Security headers

### Operations
- [ ] Regular security updates
- [ ] Log review procedures
- [ ] Incident response plan
- [ ] Penetration testing schedule
- [ ] Security training for staff

## Incident Response

### Security Incident Types
1. **Unauthorized Access**: Account compromise
2. **Data Breach**: PII exposure
3. **System Intrusion**: Infrastructure breach
4. **Insider Threat**: Malicious employee

### Response Steps
1. **Detect**: Monitor logs and alerts
2. **Contain**: Isolate affected systems
3. **Investigate**: Determine scope and cause
4. **Remediate**: Fix vulnerabilities
5. **Recover**: Restore normal operations
6. **Report**: Notify stakeholders and regulators

## Contact

For security concerns, contact:
- Email: security@camccul.cm
- Phone: +237 222 123 456 (ext. 999)

---

**Note**: This security implementation follows Apache Fineract standards and OWASP guidelines. Regular security audits and updates are essential for maintaining a secure system.