import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from app.database import Base, get_db
from app.main import app
from app.auth import create_access_token
from app.security.jwt_auth import hash_password
from app import models
import os

# Use an in-memory SQLite database for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

@pytest.fixture(scope="session")
def engine():
    _engine = create_engine(
        SQLALCHEMY_DATABASE_URL, 
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    Base.metadata.create_all(bind=_engine)
    return _engine

@pytest.fixture(scope="session")
def TestingSessionLocal(engine):
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture
def db_session(engine, TestingSessionLocal):
    """
    Provides a database session for each test with proper transactional isolation.
    
    Uses connection-level transaction + SAVEPOINT pattern so that db.commit()
    calls inside API endpoint code do NOT break test isolation. After each test,
    the outer connection-level transaction is rolled back, undoing all changes.
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    # When the session commits (e.g., inside an API endpoint), 
    # start a new nested SAVEPOINT instead of actually committing.
    nested = connection.begin_nested()

    @event.listens_for(session, "after_transaction_end")
    def restart_savepoint(session, trans):
        nonlocal nested
        if trans.nested and not trans._parent.nested:
            # The SAVEPOINT was committed or rolled back; start a new one
            nested = connection.begin_nested()

    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()

@pytest.fixture
def client(db_session):
    """FastAPI test client with database dependency override."""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    c = TestClient(app)
    yield c
    app.dependency_overrides.clear()

@pytest.fixture
def test_password():
    return "TestPass123!"

@pytest.fixture
def test_gl_account(db_session):
    """Creates a basic GL account for testing."""
    import random
    code = str(random.randint(10000, 99999))
    account = models.GLAccount(
        account_code=code,
        account_name=f"Test Account {code}",
        account_class=1,
        account_category="10",
        account_type="ASSET",
        usage="DETAIL",
        is_active=True
    )
    db_session.add(account)
    db_session.flush()
    return account

@pytest.fixture
def test_branch(db_session):
    """Creates a default test branch."""
    import secrets
    code = f"B{secrets.token_hex(2).upper()}"
    branch = models.Branch(
        code=code,
        name=f"Test Branch {code}",
        is_active=True,
        gl_vault_code="1010",
        city="Buea",
        region="South West"
    )
    db_session.add(branch)
    db_session.flush()
    return branch

@pytest.fixture
def admin_user(db_session, test_branch, test_password):
    """Creates a default admin user."""
    import secrets
    username = f"admin_{secrets.token_hex(2)}"
    user = models.User(
        username=username,
        full_name="Admin Test",
        hashed_password=hash_password(test_password),
        role=models.UserRole.SYSTEM_ADMIN,
        branch_id=test_branch.id,
        is_active=True,
        approval_status=models.UserApprovalStatus.APPROVED
    )
    db_session.add(user)
    db_session.flush()
    return user

@pytest.fixture
def teller_user(db_session, test_branch, test_gl_account, test_password):
    """Creates a test teller user."""
    import secrets
    username = f"teller_{secrets.token_hex(2)}"
    user = models.User(
        username=username,
        full_name="Teller Test",
        hashed_password=hash_password(test_password),
        role=models.UserRole.TELLER,
        branch_id=test_branch.id,
        teller_gl_account_id=test_gl_account.id,
        is_active=True,
        approval_status=models.UserApprovalStatus.APPROVED
    )
    db_session.add(user)
    db_session.flush()
    return user

@pytest.fixture
def auth_headers(admin_user):
    """Generates authentication headers for the admin user."""
    access_token = create_access_token(data={"sub": admin_user.username})
    return {"Authorization": f"Bearer {access_token}"}

@pytest.fixture
def ops_manager(db_session, test_branch, test_password):
    """Creates a default ops manager user."""
    import secrets
    username = f"ops_{secrets.token_hex(2)}"
    user = models.User(
        username=username,
        full_name="Ops Manager Test",
        hashed_password=hash_password(test_password),
        role=models.UserRole.OPS_MANAGER,
        branch_id=test_branch.id,
        is_active=True,
        approval_status=models.UserApprovalStatus.APPROVED
    )
    db_session.add(user)
    db_session.flush()
    return user

@pytest.fixture
def ops_headers(ops_manager):
    """Generates authentication headers for the ops manager."""
    access_token = create_access_token(data={"sub": ops_manager.username})
    return {"Authorization": f"Bearer {access_token}"}

@pytest.fixture
def teller_headers(teller_user):
    """Generates authentication headers for the teller user."""
    access_token = create_access_token(data={"sub": teller_user.username})
    return {"Authorization": f"Bearer {access_token}"}
