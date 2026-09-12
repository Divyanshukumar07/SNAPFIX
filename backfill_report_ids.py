import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime
import uuid

# Initialize Firebase (assuming default app is initialized or running in environment with credentials)
if not firebase_admin._apps:
    try:
        cred = credentials.Certificate('firebase-service-account.json') # Or set via env var
        firebase_admin.initialize_app(cred)
    except Exception as e:
        print("Could not initialize Firebase admin. Ensure you have the correct credentials.", e)
        exit(1)

db = firestore.client()

@firestore.transactional
def get_next_report_id_transaction(transaction, counter_ref):
    snapshot = counter_ref.get(transaction=transaction)
    if not snapshot.exists:
        transaction.set(counter_ref, {'complaints_count': 1})
        return 1
    else:
        new_count = snapshot.get('complaints_count') + 1
        transaction.update(counter_ref, {'complaints_count': new_count})
        return new_count

def generate_report_id(db):
    year = datetime.utcnow().year
    try:
        counter_ref = db.collection('system').document('counters')
        transaction = db.transaction()
        count = get_next_report_id_transaction(transaction, counter_ref)
        return f"SNF-{year}-{count:06d}"
    except Exception as e:
        print(f"Error generating Report ID: {e}")
        return f"SNF-{year}-{str(uuid.uuid4())[:6].upper()}"

def backfill():
    print("Starting backfill of Report IDs...")
    complaints_ref = db.collection('complaints')
    docs = complaints_ref.stream()
    
    updated_count = 0
    for doc in docs:
        data = doc.to_dict()
        if 'report_id' not in data or not data['report_id']:
            report_id = generate_report_id(db)
            print(f"Assigning {report_id} to document {doc.id}")
            doc.reference.update({'report_id': report_id})
            updated_count += 1
            
    print(f"Backfill complete! Updated {updated_count} complaints.")

if __name__ == '__main__':
    backfill()
