import unittest
from flask import Flask
from routes import api, db
import routes
import json

class TestBanUser(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.register_blueprint(api, url_prefix='/api')
        self.client = self.app.test_client()

    def set_mock_user(self, role, uid="admin1", email="admin@example.com"):
        def mock_get_current_user():
            return {
                "uid": uid,
                "email": email,
                "role": role,
                "email_verified": True
            }
        routes.get_current_user = mock_get_current_user

    def test_ban_user(self):
        self.set_mock_user("city_admin")
        
        import unittest.mock
        mock_doc = unittest.mock.Mock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {
            "uid": "target1",
            "role": "citizen"
        }
        
        with unittest.mock.patch('routes.db') as mock_db:
            mock_db.collection.return_value.document.return_value.get.return_value = mock_doc
            res = self.client.post('/api/admin/users/target1/ban')
            
            self.assertEqual(res.status_code, 200)
            mock_db.collection.return_value.document.return_value.update.assert_called_with({'account_status': 'banned'})

if __name__ == '__main__':
    unittest.main()
