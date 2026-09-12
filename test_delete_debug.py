import unittest
from app import create_app
from routes import db
from datetime import datetime

class TestDeleteReal(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.client = self.app.test_client()
        
    def test_delete(self):
        import unittest.mock
        with unittest.mock.patch('routes.get_current_user_id') as mock_user_id:
            mock_user_id.return_value = 'citizen_1'
            
            # create real
            doc_ref = db.collection('complaints').document()
            doc_ref.set({
                'report_id': 'SNF-2026-TEST',
                'citizen_id': 'citizen_1',
                'status': 'pending_verification',
                'created_at': datetime.utcnow().isoformat(),
            })
            
            # test delete
            res = self.client.delete(f'/api/complaints/{doc_ref.id}')
            print("Delete response code:", res.status_code)
            print("Delete response:", res.json)
            
            doc = db.collection('complaints').document(doc_ref.id).get()
            print("is_deleted after delete:", doc.to_dict().get('is_deleted'))
            
            # test edit
            res2 = self.client.put(f'/api/complaints/{doc_ref.id}', json={'description': 'edited'})
            print("Edit response code:", res2.status_code)
            print("Edit response:", res2.json)
            
            # set status to verified and test again
            doc_ref.update({'status': 'verified', 'is_deleted': False})
            
            res3 = self.client.delete(f'/api/complaints/{doc_ref.id}')
            print("Delete when verified:", res3.status_code, res3.json)
            
            res4 = self.client.put(f'/api/complaints/{doc_ref.id}', json={'description': 'edited 2'})
            print("Edit when verified:", res4.status_code, res4.json)

if __name__ == '__main__':
    unittest.main()
