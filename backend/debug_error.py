import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from app import models
    from sqlalchemy.orm import configure_mappers
    configure_mappers()
    print("Mappers configured successfully")
except Exception as e:
    print(f"Error configuring mappers: {e}")
    # Also print repr to get full type
    print(repr(e))
