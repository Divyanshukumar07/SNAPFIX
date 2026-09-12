import unittest
from flask import Flask
from routes import api
import routes
import json

class TestWorkflows(unittest.TestCase):
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

    def test_banned_user_cannot_create_complaint(self):
        self.set_mock_user("citizen", account_status="banned")
        res = self.client.post('/api/complaints', json={
            "title": "Broken light",
            "description": "It's broken",
            "category": "Electrical"
        })
        self.assertEqual(res.status_code, 403)
        self.assertIn("banned", res.json['error'])
        
    def test_active_user_can_create_complaint(self):
        self.set_mock_user("citizen", account_status="active")
        import unittest.mock
        with unittest.mock.patch('routes.db') as mock_db, \
             unittest.mock.patch('routes.generate_report_id', return_value='SNF-2026-000123'):
            mock_doc_ref = unittest.mock.Mock()
            mock_doc_ref.id = "new_complaint_id"
            mock_db.collection.return_value.document.return_value = mock_doc_ref
            
            res = self.client.post('/api/complaints', json={
                "title": "Broken light",
                "description": "It's broken",
                "category": "Electrical"
            })
            self.assertEqual(res.status_code, 201)
            
    def test_worker_false_report_unauthorized(self):
        # Admin trying to use worker false report
        self.set_mock_user("city_admin")
        res = self.client.post('/api/worker/complaints/123/false_report', json={"reason": "test"})
        self.assertEqual(res.status_code, 403)

    def test_worker_false_report_forbidden_unassigned(self):
        self.set_mock_user("service_worker", uid="worker-1")
        import unittest.mock
        mock_doc = unittest.mock.Mock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {
            "worker_id": "different-worker",
            "status": "assigned"
        }
        with unittest.mock.patch('routes.db') as mock_db:
            mock_db.collection.return_value.document.return_value.get.return_value = mock_doc
            res = self.client.post('/api/worker/complaints/123/false_report', json={"reason": "test"})
            self.assertEqual(res.status_code, 403)
            self.assertIn("not assigned to you", res.json['error'])
            
    def test_worker_false_report_success(self):
        self.set_mock_user("service_worker", uid="worker-1")
        import unittest.mock
        mock_doc = unittest.mock.Mock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {
            "worker_id": "worker-1",
            "status": "assigned",
            "citizen_id": "citizen-1"
        }
        with unittest.mock.patch('routes.db') as mock_db:
            mock_db.collection.return_value.document.return_value.get.return_value = mock_doc
            res = self.client.post('/api/worker/complaints/123/false_report', json={"reason": "Fake"})
            self.assertEqual(res.status_code, 200)
            
    def test_admin_ban_higher_authority(self):
        self.set_mock_user("city_admin", uid="admin-1")
        import unittest.mock
        mock_doc = unittest.mock.Mock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {
            "role": "main_authority"
        }
        with unittest.mock.patch('routes.db') as mock_db:
            mock_db.collection.return_value.document.return_value.get.return_value = mock_doc
            res = self.client.post('/api/admin/users/auth-1/ban')
            self.assertEqual(res.status_code, 403)
            self.assertIn("Cannot ban a Main Authority", res.json['error'])
            
    def test_admin_cannot_ban_self(self):
        self.set_mock_user("city_admin", uid="admin-1")
        res = self.client.post('/api/admin/users/admin-1/ban')
        self.assertEqual(res.status_code, 400)

    def test_escalation_requester_name(self):
        def mock_get_current_user():
            return {
                "uid": "test-uid",
                "email": "test@example.com",
                "role": "citizen",
                "name": "Jane Doe",
                "email_verified": True
            }
        routes.get_current_user = mock_get_current_user
        routes.get_current_user_id = lambda: "test-uid"
        
        import unittest.mock
        with unittest.mock.patch('routes.db') as mock_db, \
             unittest.mock.patch('routes.firestore.ArrayUnion', lambda x: x):
            mock_doc_ref = unittest.mock.Mock()
            mock_doc = unittest.mock.Mock()
            mock_doc.exists = True
            mock_doc.to_dict.return_value = {
                "citizen_id": "test-uid",
                "status": "completed",
                "escalation_requested": False
            }
            mock_doc_ref.get.return_value = mock_doc
            mock_db.collection.return_value.document.return_value = mock_doc_ref
            
            res = self.client.post('/api/complaints/test-id/escalate', json={"reason": "Taking too long"})
            self.assertEqual(res.status_code, 200)
            
            mock_doc_ref.update.assert_called_once()
            update_call_args = mock_doc_ref.update.call_args[0][0]
            
            escalations = update_call_args['escalations']
            self.assertEqual(len(escalations), 1)
            self.assertEqual(escalations[0]['requester_name'], 'Jane Doe')
            self.assertEqual(escalations[0]['requester_role'], 'citizen')

if __name__ == '__main__':
    unittest.main()
