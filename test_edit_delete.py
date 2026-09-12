import unittest
from flask import Flask
from routes import api
import routes
import json

class TestEditDelete(unittest.TestCase):
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

    def test_owner_pending_verification_delete(self):
        self.set_mock_user("citizen", uid="owner_1")
        import unittest.mock
        mock_doc = unittest.mock.Mock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {
            "citizen_id": "owner_1",
            "status": "pending_verification"
        }
        with unittest.mock.patch('routes.db') as mock_db:
            mock_db.collection.return_value.document.return_value.get.return_value = mock_doc
            res = self.client.delete('/api/complaints/123')
            self.assertEqual(res.status_code, 200)

    def test_owner_pending_verification_edit(self):
        self.set_mock_user("citizen", uid="owner_1")
        import unittest.mock
        mock_doc = unittest.mock.Mock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {
            "citizen_id": "owner_1",
            "status": "pending_verification"
        }
        with unittest.mock.patch('routes.db') as mock_db:
            mock_db.collection.return_value.document.return_value.get.return_value = mock_doc
            res = self.client.put('/api/complaints/123', json={"description": "new desc"})
            self.assertEqual(res.status_code, 200)

    def test_owner_verified_delete_rejected(self):
        self.set_mock_user("citizen", uid="owner_1")
        import unittest.mock
        mock_doc = unittest.mock.Mock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {
            "citizen_id": "owner_1",
            "status": "verified"
        }
        with unittest.mock.patch('routes.db') as mock_db:
            mock_db.collection.return_value.document.return_value.get.return_value = mock_doc
            res = self.client.delete('/api/complaints/123')
            self.assertEqual(res.status_code, 400)
            self.assertIn("cannot be modified", res.json['error'])

    def test_owner_verified_edit_rejected(self):
        self.set_mock_user("citizen", uid="owner_1")
        import unittest.mock
        mock_doc = unittest.mock.Mock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {
            "citizen_id": "owner_1",
            "status": "verified"
        }
        with unittest.mock.patch('routes.db') as mock_db:
            mock_db.collection.return_value.document.return_value.get.return_value = mock_doc
            res = self.client.put('/api/complaints/123', json={"description": "new desc"})
            self.assertEqual(res.status_code, 400)

    def test_non_owner_pending_verification_delete_rejected(self):
        self.set_mock_user("citizen", uid="not_owner")
        import unittest.mock
        mock_doc = unittest.mock.Mock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {
            "citizen_id": "owner_1",
            "status": "pending_verification"
        }
        with unittest.mock.patch('routes.db') as mock_db:
            mock_db.collection.return_value.document.return_value.get.return_value = mock_doc
            res = self.client.delete('/api/complaints/123')
            self.assertEqual(res.status_code, 403)
            self.assertIn("permission", res.json['error'])

    def test_non_owner_pending_verification_edit_rejected(self):
        self.set_mock_user("citizen", uid="not_owner")
        import unittest.mock
        mock_doc = unittest.mock.Mock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {
            "citizen_id": "owner_1",
            "status": "pending_verification"
        }
        with unittest.mock.patch('routes.db') as mock_db:
            mock_db.collection.return_value.document.return_value.get.return_value = mock_doc
            res = self.client.put('/api/complaints/123', json={"description": "new desc"})
            self.assertEqual(res.status_code, 403)

    def test_deleted_complaint_hidden_from_me_endpoint(self):
        self.set_mock_user("citizen", uid="owner_1")
        import unittest.mock
        mock_doc1 = unittest.mock.Mock()
        mock_doc1.id = "1"
        mock_doc1.to_dict.return_value = {"is_deleted": False, "status": "pending_verification", "citizen_id": "owner_1"}
        
        mock_doc2 = unittest.mock.Mock()
        mock_doc2.id = "2"
        mock_doc2.to_dict.return_value = {"is_deleted": True, "status": "pending_verification", "citizen_id": "owner_1"}
        
        with unittest.mock.patch('routes.db') as mock_db:
            mock_db.collection.return_value.where.return_value.limit.return_value.stream.return_value = [mock_doc1, mock_doc2]
            res = self.client.get('/api/complaints/me')
            self.assertEqual(res.status_code, 200)
            data = res.json
            self.assertEqual(len(data), 1)
            self.assertEqual(data[0]['id'], "1")

if __name__ == '__main__':
    unittest.main()
