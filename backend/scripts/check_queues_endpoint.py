from fastapi.testclient import TestClient

import sys, os
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
from app.main import app

c = TestClient(app)
resp = c.get('/api/queues/tasks')
print('status', resp.status_code)
print(resp.text[:1000])
