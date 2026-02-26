from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app import models

engine = create_engine('postgresql://camccul:camccul_secure_password@localhost:5434/camccul_banking')
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

gl = db.query(models.GLAccount).filter(models.GLAccount.account_code == '1020').first()
tellers = db.query(models.User).filter(models.User.role == 'TELLER').all()

for teller in tellers:
    if teller.teller_gl_account_id != gl.id:
        teller.teller_gl_account_id = gl.id
        print(f"Linked {teller.username} to GL {gl.account_code}")

db.commit()
db.close()
