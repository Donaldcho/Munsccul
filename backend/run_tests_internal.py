import pytest
import sys
import os

# Ensure the app module can be found
sys.path.insert(0, '/app')

if __name__ == "__main__":
    # Run a specific test with verbose output
    pytest.main(['/app/tests/test_auth_security.py', '-v', '--tb=short'])
