import unittest
from flask import Flask
from routes import api, db
import routes

class TestBannedUser(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.register_blueprint(api, url_prefix='/api')
        self.client = self.app.test_client()

    def set_mock_user(self, role, uid="admin1", email="admin@example.com", status="banned"):
        def mock_get_current_user():
            return {
                "uid": uid,
                "email": email,
                "role": role,
                "email_verified": True,
                "account_status": status
            }
        routes.get_current_user = mock_get_current_user

    def test_banned_user_me(self):
        self.set_mock_user("citizen", status="banned")
        res = self.client.get('/api/users/me')
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.json['error'], 'banned')

    def test_active_user_me(self):
        self.set_mock_user("citizen", status="active")
        res = self.client.get('/api/users/me')
        self.assertEqual(res.status_code, 200)

    def test_banned_user_protected(self):
        self.set_mock_user("city_admin", status="banned")
        res = self.client.get('/api/admin/dashboard-stats')
        self.assertEqual(res.status_code, 403)

if __name__ == '__main__':
    unittest.main()
