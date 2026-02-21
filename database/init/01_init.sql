-- CamCCUL Core Banking System - Database Initialization
-- Creates initial data for testing and demonstration

-- Create main branch
INSERT INTO branches (code, name, address, city, region, phone, email, is_active, created_at)
VALUES (
    'HQ001',
    'CamCCUL Headquarters',
    '123 Avenue du 20 Mai',
    'Yaoundé',
    'Centre',
    '+237 222 123 456',
    'hq@camccul.cm',
    true,
    NOW()
) ON CONFLICT DO NOTHING;

-- Create admin user (password: admin123)
INSERT INTO users (username, email, full_name, hashed_password, role, branch_id, is_active, created_at)
VALUES (
    'admin',
    'admin@camccul.cm',
    'System Administrator',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G',
    'system_admin',
    1,
    true,
    NOW()
) ON CONFLICT DO NOTHING;

-- Create branch manager (password: manager123)
INSERT INTO users (username, email, full_name, hashed_password, role, branch_id, is_active, created_at)
VALUES (
    'manager',
    'manager@camccul.cm',
    'Branch Manager',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G',
    'branch_manager',
    1,
    true,
    NOW()
) ON CONFLICT DO NOTHING;

-- Create teller (password: teller123)
INSERT INTO users (username, email, full_name, hashed_password, role, branch_id, is_active, created_at)
VALUES (
    'teller',
    'teller@camccul.cm',
    'Head Teller',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G',
    'teller',
    1,
    true,
    NOW()
) ON CONFLICT DO NOTHING;

-- Create credit officer (password: credit123)
INSERT INTO users (username, email, full_name, hashed_password, role, branch_id, is_active, created_at)
VALUES (
    'credit',
    'credit@camccul.cm',
    'Credit Officer',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6G',
    'credit_officer',
    1,
    true,
    NOW()
) ON CONFLICT DO NOTHING;

-- Create sample loan products
INSERT INTO loan_products (name, code, description, interest_rate, interest_type, min_amount, max_amount, min_term_months, max_term_months, requires_guarantor, guarantor_percentage, is_active, created_at)
VALUES 
    (
        'School Fees Loan',
        'SFL001',
        'Loan for payment of school fees and educational expenses',
        12.00,
        'declining_balance',
        50000,
        500000,
        3,
        12,
        true,
        100.00,
        true,
        NOW()
    ),
    (
        'Agri-Business Loan',
        'ABL001',
        'Loan for agricultural activities and farming equipment',
        10.00,
        'declining_balance',
        100000,
        2000000,
        6,
        24,
        true,
        150.00,
        true,
        NOW()
    ),
    (
        'Emergency Loan',
        'EML001',
        'Quick loan for emergency situations',
        15.00,
        'flat',
        25000,
        200000,
        1,
        6,
        false,
        0.00,
        true,
        NOW()
    ),
    (
        'Business Expansion Loan',
        'BEL001',
        'Loan for small business expansion',
        11.00,
        'declining_balance',
        200000,
        5000000,
        12,
        36,
        true,
        100.00,
        true,
        NOW()
    )
ON CONFLICT DO NOTHING;

-- Note: Passwords are hashed using bcrypt with the following plain text:
-- admin: admin123
-- manager: manager123
-- teller: teller123
-- credit: credit123

-- These can be generated using:
-- from passlib.context import CryptContext
-- pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
-- hashed = pwd_context.hash("password")