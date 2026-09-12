import os
from unittest.mock import patch, MagicMock
from firebase import initialize_firebase
import firebase_admin
from firebase_admin import firestore
import authority_sync

def run_tests():
    db = initialize_firebase()
    
    # Setup test users in Firestore
    test_uid_a = "test-uid-a"
    test_uid_b = "test-uid-b"
    test_uid_c = "test-uid-c"
    
    db.collection('users').document(test_uid_a).set({'uid': test_uid_a, 'email': 'user_a@test.com', 'role': 'citizen'})
    db.collection('users').document(test_uid_b).set({'uid': test_uid_b, 'email': 'user_b@test.com', 'role': 'citizen'})
    db.collection('users').document(test_uid_c).set({'uid': test_uid_c, 'email': 'user_c@test.com', 'role': 'main_authority'}) # Unrelated root
    
    db.collection('system_config').document('authority').delete()

    print("=== TEST 1: ROOT_EMAIL = existing citizen -> promoted to main_authority ===")
    os.environ['ROOT_AUTHORITY_EMAIL'] = 'user_a@test.com'
    with patch('firebase_admin.auth.get_user_by_email') as mock_get_user:
        mock_user = MagicMock()
        mock_user.uid = test_uid_a
        mock_get_user.return_value = mock_user
        
        authority_sync.sync_authority()
        
    doc = db.collection('users').document(test_uid_a).get().to_dict()
    print(f"User A Role: {doc.get('role')} (Expected: main_authority)")
    
    print("\n=== TEST 2: ROOT_EMAIL changes from User A to existing User B ===")
    os.environ['ROOT_AUTHORITY_EMAIL'] = 'user_b@test.com'
    with patch('firebase_admin.auth.get_user_by_email') as mock_get_user:
        mock_user = MagicMock()
        mock_user.uid = test_uid_b
        mock_get_user.return_value = mock_user
        
        authority_sync.sync_authority()
        
    doc_a = db.collection('users').document(test_uid_a).get().to_dict()
    doc_b = db.collection('users').document(test_uid_b).get().to_dict()
    print(f"User A Role: {doc_a.get('role')} (Expected: citizen)")
    print(f"User B Role: {doc_b.get('role')} (Expected: main_authority)")
    
    print("\n=== TEST 3: ROOT_EMAIL points to nonexistent email -> current authority remains ===")
    os.environ['ROOT_AUTHORITY_EMAIL'] = 'nonexistent@test.com'
    with patch('firebase_admin.auth.get_user_by_email') as mock_get_user:
        mock_get_user.side_effect = firebase_admin.auth.UserNotFoundError("User not found")
        
        authority_sync.sync_authority()
        
    doc_b = db.collection('users').document(test_uid_b).get().to_dict()
    print(f"User B Role: {doc_b.get('role')} (Expected: main_authority)")
    
    print("\n=== TEST 4: ROOT_EMAIL already points to current authority ===")
    os.environ['ROOT_AUTHORITY_EMAIL'] = 'user_b@test.com'
    with patch('firebase_admin.auth.get_user_by_email') as mock_get_user:
        mock_user = MagicMock()
        mock_user.uid = test_uid_b
        mock_get_user.return_value = mock_user
        
        authority_sync.sync_authority()
        
    doc_b = db.collection('users').document(test_uid_b).get().to_dict()
    print(f"User B Role: {doc_b.get('role')} (Expected: main_authority)")
    
    print("\n=== TEST 5: Target promotion fails -> previous authority remains main_authority ===")
    os.environ['ROOT_AUTHORITY_EMAIL'] = 'user_a@test.com'
    with patch('firebase_admin.auth.get_user_by_email') as mock_get_user:
        mock_user = MagicMock()
        mock_user.uid = test_uid_a
        mock_get_user.return_value = mock_user
        
        with patch.object(db.collection('users').document(test_uid_a), 'update') as mock_update:
            mock_update.side_effect = Exception("Simulated DB Failure")
            try:
                authority_sync.sync_authority()
            except:
                pass
                
    doc_b = db.collection('users').document(test_uid_b).get().to_dict()
    print(f"User B Role: {doc_b.get('role')} (Expected: main_authority)")
    
    print("\n=== TEST 6: Another main_authority exists -> changing root does not demote unrelated Main Authorities ===")
    os.environ['ROOT_AUTHORITY_EMAIL'] = 'user_a@test.com'
    with patch('firebase_admin.auth.get_user_by_email') as mock_get_user:
        mock_user = MagicMock()
        mock_user.uid = test_uid_a
        mock_get_user.return_value = mock_user
        
        authority_sync.sync_authority()
        
    doc_a = db.collection('users').document(test_uid_a).get().to_dict()
    doc_b = db.collection('users').document(test_uid_b).get().to_dict()
    doc_c = db.collection('users').document(test_uid_c).get().to_dict()
    print(f"User A Role: {doc_a.get('role')} (Expected: main_authority)")
    print(f"User B Role: {doc_b.get('role')} (Expected: citizen)")
    print(f"User C Role: {doc_c.get('role')} (Expected: main_authority)")

    print("\n=== Cleaning up test data ===")
    db.collection('users').document(test_uid_a).delete()
    db.collection('users').document(test_uid_b).delete()
    db.collection('users').document(test_uid_c).delete()
    db.collection('system_config').document('authority').delete()
    
if __name__ == '__main__':
    from dotenv import load_dotenv
    load_dotenv()
    run_tests()
