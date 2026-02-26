from app.database import engine
from app.models import Base

print("Creating new tables (including intercom_messages)...")
Base.metadata.create_all(bind=engine)
print("Done!")
