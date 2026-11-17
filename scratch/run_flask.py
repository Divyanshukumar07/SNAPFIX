import sys
sys.path.append('c:/Users/Divyanshu Kumar/Documents/coding/BIT N BUILD HACKATHON')
import os
from dotenv import load_dotenv
load_dotenv()
from app import create_app
app = create_app()
app.run(port=5001, debug=False)
