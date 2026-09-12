import unittest
from flask import Flask
from routes import api
import routes
import json

class TestDashboardRoles(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.register_blueprint(api, url_prefix='/api')
        self.client = self.app.test_client()

    def set_mock_user(self, role, uid="test-uid", email="test@example.com", dept_id=None, account_status="active"):
        def mock_get_current_user():
            return {
                "uid": uid,
                "email": email,
                "role": role,
                "department_id": dept_id,
                "account_status": account_status,
                "email_verified": True
            }
        def mock_get_current_user_id():
            return uid
            
        routes.get_current_user = mock_get_current_user
        routes.get_current_user_id = mock_get_current_user_id

    def test_admin_can_report_complaint(self):
        self.set_mock_user("city_admin")
        import unittest.mock
        with unittest.mock.patch('routes.db') as mock_db:
            mock_doc_ref = unittest.mock.Mock()
            mock_doc_ref.id = "new_complaint_id"
            mock_db.collection.return_value.document.return_value = mock_doc_ref
            
            res = self.client.post('/api/complaints', json={
                "title": "Broken light",
                "description": "It's broken",
                "category": "Electrical"
            })
            self.assertEqual(res.status_code, 201)
            
    def test_admin_can_fetch_own_complaints(self):
        self.set_mock_user("department_head")
        import unittest.mock
        with unittest.mock.patch('routes.db') as mock_db:
            mock_docs = []
            mock_db.collection.return_value.where.return_value.limit.return_value.stream.return_value = mock_docs
            
            res = self.client.get('/api/complaints/me')
            self.assertEqual(res.status_code, 200)

if __name__ == '__main__':
    unittest.main()
