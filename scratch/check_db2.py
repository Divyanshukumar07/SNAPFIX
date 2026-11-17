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
    for doc in docs:
        c = doc.to_dict()
        if c.get('worker_id'):
            print(f"Doc {doc.id} has worker_id type {type(c.get('worker_id'))} and value {repr(c.get('worker_id'))}")
print("Done")
