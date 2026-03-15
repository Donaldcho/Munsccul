import pytest
import sys
import os

# Ensure the app module can be found
sys.path.insert(0, '/app')

from app import models

class MyReporter:
    def pytest_runtest_logreport(self, report):
        if report.failed:
            print(f"--- FAILED TEST: {report.nodeid} ---")
            print(report.longrepr)
            print("--- END FAILURE ---")

if __name__ == "__main__":
    # Run the tests with custom reporter to see full details
    pytest.main(['-v', '/app/tests/test_auth_security.py'], plugins=[MyReporter()])
