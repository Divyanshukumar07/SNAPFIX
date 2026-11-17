import sys
sys.path.append('c:/Users/Divyanshu Kumar/Documents/coding/BIT N BUILD HACKATHON')
import os
from dotenv import load_dotenv
load_dotenv()
from app import app
from routes import db
from datetime import datetime

with app.app_context():
    docs = db.collection('complaints').limit(100).stream()
    complaints = []
    now = datetime.utcnow()
    
    for doc in docs:
        c = doc.to_dict()
        if c.get('is_deleted', False):
            continue
        c['id'] = doc.id
        
        try:
            created_date = datetime.fromisoformat(c.get('created_at'))
            age = (now - created_date).days
            c['is_overdue'] = age >= 3 and c.get('status') not in ['closed', 'resolved', 'completed']
        except:
            c['is_overdue'] = False
            
        complaints.append(c)
        
    worker_ids = set()
    for c in complaints:
        if c.get('worker_id'):
            worker_ids.add(c.get('worker_id'))
            
    worker_profiles = {}
    if worker_ids:
        worker_ids_list = list(worker_ids)
        for i in range(0, len(worker_ids_list), 30):
            batch = worker_ids_list[i:i+30]
            users_query = db.collection('users').where('uid', 'in', batch).stream()
            for udoc in users_query:
                udata = udoc.to_dict()
                worker_profiles[udoc.id] = {
                    "name": udata.get('name', 'Unknown'),
                    "email": udata.get('email', 'Unknown')
                }
                
    for c in complaints:
        wid = c.get('worker_id')
        if wid and wid in worker_profiles:
            c['worker_name'] = worker_profiles[wid]['name']
            c['worker_email'] = worker_profiles[wid]['email']
        
    complaints.sort(key=lambda x: x.get('created_at', ''), reverse=True)
    print("Complaints parsed successfully. Count:", len(complaints))
    import json
    # test if we can json dump
    json.dumps(complaints)
    print("JSON serialized successfully")
