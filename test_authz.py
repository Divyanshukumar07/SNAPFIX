import unittest
from flask import Flask, g
from routes import api
import routes

class TestAuthorization(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.register_blueprint(api, url_prefix='/api')
        self.client = self.app.test_client()

    def set_mock_user(self, role, uid="test-uid", email="test@example.com", dept_id=None):
        def mock_get_current_user():
            return {
                "uid": uid,
                "email": email,
                "role": role,
                "department_id": dept_id
            }
        routes.get_current_user = mock_get_current_user

    def test_citizen_access(self):
        self.set_mock_user("citizen")
        
        # Allowed
        res = self.client.get('/api/complaints/me')
        self.assertEqual(res.status_code, 200)
        
        # Denied
        res = self.client.get('/api/admin/complaints')
        self.assertEqual(res.status_code, 403)
        
        res = self.client.get('/api/worker/complaints')
        self.assertEqual(res.status_code, 403)
        
    def test_worker_access(self):
        self.set_mock_user("service_worker", uid="worker-1")
        
        # Allowed (worker list - scoped)
        # Note: mocking db will fail if it's hitting firestore, so we expect 200 (if db=None) or 500
        # For authorization, we just want to ensure it doesn't return 401/403.
        # But wait, routes use db. If db is not mocked here, it might crash with 500, which proves AuthZ passed!
        routes.db = None
        
        res = self.client.get('/api/worker/complaints')
        self.assertTrue(res.status_code in [200, 500])
        
        # Denied
        res = self.client.get('/api/admin/complaints')
        self.assertEqual(res.status_code, 403)
        
    def test_city_admin_access(self):
        self.set_mock_user("city_admin")
        
        # Allowed
        routes.db = None
        res = self.client.get('/api/admin/complaints')
        self.assertTrue(res.status_code in [200, 500])
        
        # Can't access worker endpoints
        res = self.client.get('/api/worker/complaints')
        self.assertEqual(res.status_code, 403)
        
    def test_idor_complaint_fetch(self):
        self.set_mock_user("citizen", uid="requester-uid")
        
        # Mock a complaint fetched from Firestore
        import unittest.mock
        mock_doc = unittest.mock.Mock()
        mock_doc.exists = True
        mock_doc.id = "mock-id"
        mock_doc.to_dict.return_value = {
            "citizen_id": "owner-uid",
            "citizen_email": "owner@example.com",
            "category": "Garbage"
        }
        
        with unittest.mock.patch('routes.db') as mock_db:
            mock_db.collection.return_value.document.return_value.get.return_value = mock_doc
            
            res = self.client.get('/api/complaints/mock-id')
            self.assertEqual(res.status_code, 200)
            
            data = res.json
            self.assertNotIn('citizen_id', data)
            self.assertNotIn('citizen_email', data)
            self.assertEqual(data.get('category'), "Garbage")

if __name__ == '__main__':
    unittest.main()
