import unittest
from flask import Flask
from routes import api
import routes
from datetime import datetime

class TestWorkerAssignment(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.register_blueprint(api, url_prefix='/api')
        self.client = self.app.test_client()

    def set_mock_user(self, role, uid="worker_1", email="worker1@example.com", dept_id=None):
        def mock_get_current_user():
            return {
                "uid": uid,
                "email": email,
                "role": role,
                "email_verified": True,
                "department_id": dept_id
            }
        def mock_get_current_user_id():
            return uid
            
        routes.get_current_user = mock_get_current_user
        routes.get_current_user_id = mock_get_current_user_id

    def test_accept_success(self):
        self.set_mock_user("service_worker", uid="worker_A")
        import unittest.mock
        mock_doc = unittest.mock.Mock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {
            "worker_id": "worker_A",
            "assigned_workers": ["worker_A"],
            "assignment_state": "pending"
        }
        with unittest.mock.patch('routes.db') as mock_db:
            mock_db.collection.return_value.document.return_value.get.return_value = mock_doc
            res = self.client.patch('/api/worker/complaints/123/assignment', json={"action": "accept"})
            self.assertEqual(res.status_code, 200)
            mock_db.collection.return_value.document.return_value.update.assert_called_with({
                'assignment_state': 'accepted',
                'history': unittest.mock.ANY
            })

    def test_reject_success(self):
        self.set_mock_user("service_worker", uid="worker_A")
        import unittest.mock
        mock_doc = unittest.mock.Mock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {
            "worker_id": "worker_A",
            "assigned_workers": ["worker_A"],
            "assignment_state": "pending",
            "pre_assignment_status": "verified"
        }
        with unittest.mock.patch('routes.db') as mock_db:
            mock_db.collection.return_value.document.return_value.get.return_value = mock_doc
            res = self.client.patch('/api/worker/complaints/123/assignment', json={"action": "reject", "reason": "too busy"})
            self.assertEqual(res.status_code, 200)
            mock_db.collection.return_value.document.return_value.update.assert_called_with({
                'assigned_workers': [],
                'worker_id': None,
                'assignment_state': 'rejected',
                'status': 'verified',
                'history': unittest.mock.ANY
            })

    def test_unassigned_accept(self):
        self.set_mock_user("service_worker", uid="worker_B")
        import unittest.mock
        mock_doc = unittest.mock.Mock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {
            "worker_id": "worker_A",
            "assigned_workers": ["worker_A"],
            "assignment_state": "pending"
        }
        with unittest.mock.patch('routes.db') as mock_db:
            mock_db.collection.return_value.document.return_value.get.return_value = mock_doc
            res = self.client.patch('/api/worker/complaints/123/assignment', json={"action": "accept"})
            self.assertEqual(res.status_code, 400)
            self.assertIn("Not assigned to this worker", res.json['error'])

    def test_multi_worker_reject_leaves_others(self):
        self.set_mock_user("service_worker", uid="worker_A")
        import unittest.mock
        mock_doc = unittest.mock.Mock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {
            "worker_id": "worker_A",
            "assigned_workers": ["worker_A", "worker_B"],
            "assignment_state": "pending",
            "pre_assignment_status": "verified"
        }
        with unittest.mock.patch('routes.db') as mock_db:
            mock_db.collection.return_value.document.return_value.get.return_value = mock_doc
            res = self.client.patch('/api/worker/complaints/123/assignment', json={"action": "reject", "reason": "busy"})
            self.assertEqual(res.status_code, 200)
            mock_db.collection.return_value.document.return_value.update.assert_called_with({
                'assigned_workers': ["worker_B"],
                'worker_id': "worker_B",
                'history': unittest.mock.ANY
            })

    def test_assign_blocks_citizen_rejected_proof_worker(self):
        self.set_mock_user("department_head", uid="admin1", dept_id="d1")
        import unittest.mock
        mock_doc = unittest.mock.Mock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {
            "status": "reopened",
            "rejected_workers": ["worker_A"]
        }
        mock_worker = unittest.mock.Mock()
        mock_worker.exists = True
        mock_worker.to_dict.return_value = {"worker_status": "AVAILABLE"}
        
        with unittest.mock.patch('routes.db') as mock_db:
            mock_db.collection.return_value.document.return_value.get.side_effect = [mock_doc, mock_worker]
            res = self.client.post('/api/admin/complaints/123/assign', json={"worker_id": "worker_A", "expected_completion_deadline": "2026-12-12"})
            self.assertEqual(res.status_code, 400)
            self.assertIn("previously submitted rejected work", res.json['error'])
            
    def test_assign_allows_worker_who_rejected_assignment(self):
        self.set_mock_user("department_head", uid="admin1", dept_id="d1")
        import unittest.mock
        mock_doc = unittest.mock.Mock()
        mock_doc.exists = True
        # worker_A rejected the ASSIGNMENT (so they are NOT in rejected_workers)
        mock_doc.to_dict.return_value = {
            "status": "verified",
            "rejected_workers": [],
            "department": "d1"
        }
        mock_worker = unittest.mock.Mock()
        mock_worker.exists = True
        mock_worker.to_dict.return_value = {"worker_status": "AVAILABLE", "department_id": "d1"}
        
        with unittest.mock.patch('routes.db') as mock_db:
            mock_db.collection.return_value.document.return_value.get.side_effect = [mock_doc, mock_worker]
            # Must force assignment since mock stream would fail length check
            res = self.client.post('/api/admin/complaints/123/assign', json={"worker_id": "worker_A", "expected_completion_deadline": "2026-12-12", "force": True})
            self.assertEqual(res.status_code, 200)

if __name__ == '__main__':
    unittest.main()
