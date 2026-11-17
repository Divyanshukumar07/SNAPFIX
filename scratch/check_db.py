import sys
sys.path.append('c:/Users/Divyanshu Kumar/Documents/coding/BIT N BUILD HACKATHON')
import os
from dotenv import load_dotenv
load_dotenv()
from app import app
from routes import db

with app.app_context():
    docs = db.collection('complaints').stream()
    for doc in docs:
        d = doc.to_dict()
        if d.get('created_at') is None:
            print(f"Doc {doc.id} has created_at=None")
        if not isinstance(d.get('created_at', ''), str):
            print(f"Doc {doc.id} has created_at of type {type(d.get('created_at'))}")
print("Done")
