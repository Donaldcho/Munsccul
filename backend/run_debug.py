import pytest
import sys
import os

# Ensure the app module can be found
sys.path.insert(0, '/app')

from app import models

if __name__ == "__main__":
    # Run a specific test with verbose output and full traceback
    pytest.main(['/app/tests/test_auth_security.py::test_rbac_forbidden_for_teller', '-vv', '--tb=long'])
