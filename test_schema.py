import unittest
from app import create_app
from routes import db
from datetime import datetime
import json

class TestAssignmentSchema(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.client = self.app.test_client()
        
    def test_schema(self):
        import unittest.mock
        
        # 1. create dummy workers
        db.collection('users').document('workerA').set({'email': 'a@a.com', 'role': 'service_worker', 'department_id': 'd1', 'worker_status': 'AVAILABLE'})
        db.collection('users').document('workerB').set({'email': 'b@b.com', 'role': 'service_worker', 'department_id': 'd1', 'worker_status': 'AVAILABLE'})
        
        # 2. create complaint
        c_ref = db.collection('complaints').document('test_comp')
        c_ref.set({
            'citizen_id': 'citizen1',
            'status': 'verified',
            'department': 'd1'
        })
        
        # 3. admin assign A
        def mock_get_current_user_admin():
            return {'uid': 'admin1', 'role': 'department_head', 'department_id': 'd1', 'email_verified': True}
        
        with unittest.mock.patch('routes.get_current_user', side_effect=mock_get_current_user_admin):
            resA = self.client.post('/api/admin/complaints/test_comp/assign', json={
                'worker_id': 'workerA',
                'expected_completion_deadline': '2026-10-10'
            })
            print("Assign A:", resA.status_code, resA.json)
            
            resB = self.client.post('/api/admin/complaints/test_comp/assign', json={
                'worker_id': 'b@b.com',  # Using email
                'expected_completion_deadline': '2026-10-10'
            })
            print("Assign B:", resB.status_code, resB.json)
            
        doc = c_ref.get().to_dict()
        print(json.dumps(doc, indent=2))
        
        db.collection('complaints').document('test_comp').delete()
        db.collection('users').document('workerA').delete()
        db.collection('users').document('workerB').delete()

if __name__ == '__main__':
    unittest.main()
