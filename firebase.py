import os
import firebase_admin
from firebase_admin import credentials, firestore, auth

def initialize_firebase():
    """Initialize Firebase Admin SDK using environment variables."""
    # Check if already initialized
    if not firebase_admin._apps:
        # Load from environment variables
        project_id = os.getenv("FIREBASE_PROJECT_ID")
        private_key = os.getenv("FIREBASE_PRIVATE_KEY")
        client_email = os.getenv("FIREBASE_CLIENT_EMAIL")
        
        # If the environment variables are not set or are placeholders, run in dummy mode
        if not project_id or not private_key or not client_email or project_id == "your-project-id":
            print("Warning: Firebase environment variables not set or using placeholders. Running in dummy mode.")
            return None
            
        # Replace literal \n with actual newlines for the private key
        private_key = private_key.replace("\\n", "\n")
        
        cred = credentials.Certificate({
            "type": "service_account",
            "project_id": project_id,
            "private_key": private_key,
            "client_email": client_email,
            "token_uri": "https://oauth2.googleapis.com/token",
        })
        
        firebase_admin.initialize_app(cred)
        
    try:
        return firestore.client()
    except ValueError:
        return None

db = initialize_firebase()
