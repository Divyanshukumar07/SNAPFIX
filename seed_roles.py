import os
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore

# Load environment variables
load_dotenv()

# Initialize Firebase Admin SDK if not already initialized
try:
    firebase_admin.get_app()
except ValueError:
    cred = credentials.Certificate({
        "type": "service_account",
        "project_id": os.getenv("FIREBASE_PROJECT_ID"),
        "private_key": os.getenv("FIREBASE_PRIVATE_KEY").replace('\\n', '\n'),
        "client_email": os.getenv("FIREBASE_CLIENT_EMAIL"),
        "token_uri": "https://oauth2.googleapis.com/token",
    })
    firebase_admin.initialize_app(cred)

db = firestore.client()

def set_role(email, role, department_id=None):
    print(f"Searching for user with email: {email}...")
    
    # Query users collection by email
    users_ref = db.collection('users').where('email', '==', email).stream()
    
    found = False
    for doc in users_ref:
        found = True
        uid = doc.id
        update_data = {"role": role}
        if department_id:
            update_data["department_id"] = department_id
            
        db.collection('users').document(uid).update(update_data)
        print(f"✅ Successfully updated user {email} (UID: {uid}) to role: '{role}'")
        if department_id:
            print(f"   Department scoped to: '{department_id}'")
            
    if not found:
        print(f"❌ Error: User with email '{email}' not found in the users collection.")
        print("Make sure the user has registered and logged in at least once so their profile is created.")

if __name__ == "__main__":
    print("--- Smart City RBAC Provisioning Tool ---")
    print("Available roles: main_authority, city_admin, department_head, service_worker, citizen")
    
    target_email = input("Enter user email to promote: ").strip()
    target_role = input("Enter new role: ").strip()
    
    dept_id = None
    if target_role in ['department_head', 'service_worker']:
        dept_id = input("Enter department_id (e.g., 'Public Works', 'Waste Management'): ").strip()
        
    if target_email and target_role:
        set_role(target_email, target_role, dept_id)
    else:
        print("Invalid input.")
