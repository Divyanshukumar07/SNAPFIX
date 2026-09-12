import os
from firebase_admin import auth, firestore
from firebase import initialize_firebase
import traceback

def sync_authority():
    """
    Synchronizes the ROOT_AUTHORITY_EMAIL from .env with the Firestore database.
    This runs once at startup to guarantee one designated root authority.
    """
    # Ensure Firebase is initialized
    db = initialize_firebase()
    if not db:
        print("Authority Sync: Firebase not fully initialized. Skipping sync.")
        return

    root_email = os.getenv("ROOT_AUTHORITY_EMAIL")
    if not root_email:
        print("Authority Sync: No ROOT_AUTHORITY_EMAIL configured. Skipping sync.")
        return
        
    root_email = root_email.strip().lower()
    print(f"Authority Sync: Target root email is '{root_email}'")
    
    # 1. Look up target Firebase User
    try:
        target_user = auth.get_user_by_email(root_email)
    except auth.UserNotFoundError:
        print(f"Authority Sync: ROOT_AUTHORITY_EMAIL user '{root_email}' not found in Firebase. Existing authority unchanged.")
        return
    except Exception as e:
        print(f"Authority Sync: Error looking up ROOT_AUTHORITY_EMAIL: {e}")
        return
        
    target_uid = target_user.uid
    
    # 2. Look up current configuration
    config_ref = db.collection('system_config').document('authority')
    config_doc = config_ref.get()
    
    old_root_uid = None
    if config_doc.exists:
        old_root_uid = config_doc.to_dict().get('root_uid')
        
    # 3. Check if already synchronized
    if old_root_uid == target_uid:
        target_ref = db.collection('users').document(target_uid)
        t_doc = target_ref.get()
        if t_doc.exists and t_doc.to_dict().get('role') == 'main_authority':
            print(f"Authority Sync: ROOT_AUTHORITY_EMAIL already synchronized to {target_uid}. No action needed.")
            return
        
    print(f"Authority Sync: Promoting {target_uid} to main_authority...")
    
    # 4. Promote target UID
    target_ref = db.collection('users').document(target_uid)
    target_doc = target_ref.get()
    
    if not target_doc.exists:
        # Create standard provisioning if they've never visited the site
        target_ref.set({
            "uid": target_uid,
            "email": root_email,
            "role": "main_authority",
            "department_id": None
        })
    else:
        target_ref.update({"role": "main_authority"})
        
    # Verify the write succeeded
    verify_doc = target_ref.get()
    if not verify_doc.exists or verify_doc.to_dict().get('role') != "main_authority":
        print("Authority Sync: Failed to verify promotion write. Aborting demotion.")
        return
        
    print(f"Authority Sync: Successfully promoted {target_uid}.")
    
    # 5. Demote previous root (if it exists and is different from the new root)
    if old_root_uid and old_root_uid != target_uid:
        print(f"Authority Sync: Demoting previous root {old_root_uid} to citizen...")
        old_root_ref = db.collection('users').document(old_root_uid)
        old_root_doc = old_root_ref.get()
        if old_root_doc.exists:
            # We ONLY demote the previous designated root. 
            old_root_ref.update({"role": "citizen"})
            print(f"Authority Sync: Demoted {old_root_uid}.")
            
    # 6. Update system config
    config_ref.set({
        "root_uid": target_uid,
        "root_email": root_email,
        "updated_at": firestore.SERVER_TIMESTAMP
    })
    
    # 7. Log action
    db.collection('admin_actions').add({
        "action": "authority_transfer",
        "target_uid": target_uid,
        "target_email": root_email,
        "previous_uid": old_root_uid,
        "timestamp": firestore.SERVER_TIMESTAMP,
        "performed_by": "SYSTEM_SYNC"
    })
    
    print("Authority Sync: Transfer complete.")

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    sync_authority()
