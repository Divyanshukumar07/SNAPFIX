import os
from flask import Flask, jsonify, render_template
from flask_cors import CORS
from config import Config
from routes import api

def create_app():
    # Set template and static folder to the root project level
    app = Flask(__name__, template_folder='templates', static_folder='static')
    app.config.from_object(Config)
    
    # Enable CORS for APIs
    CORS(app)
    
    # Register API blueprint under /api
    app.register_blueprint(api, url_prefix='/api')
    
    # Firebase configuration injected into templates
    @app.context_processor
    def inject_firebase_config():
        return dict(
            firebase_api_key=os.getenv("FIREBASE_API_KEY", ""),
            firebase_auth_domain=os.getenv("FIREBASE_AUTH_DOMAIN", ""),
            firebase_project_id=os.getenv("FIREBASE_PROJECT_ID", ""),
            firebase_storage_bucket=os.getenv("FIREBASE_STORAGE_BUCKET", ""),
            firebase_messaging_sender_id=os.getenv("FIREBASE_MESSAGING_SENDER_ID", ""),
            firebase_app_id=os.getenv("FIREBASE_APP_ID", "")
        )

    # --- HTML Page Routes ---
    
    @app.route('/')
    def index():
        return render_template('index.html')
        
    @app.route('/login')
    def login():
        return render_template('auth/login.html')

    @app.route('/register')
    def register():
        return render_template('auth/register.html')
        
    @app.route('/verify')
    def verify():
        return render_template('auth/verify.html')
        
    @app.route('/dashboard')
    def dashboard():
        return render_template('dashboard.html')

    @app.route('/complaints/new')
    def new_complaint():
        return render_template('complaints/new.html')

    @app.route('/admin/dashboard')
    def admin_dashboard():
        return render_template('admin/dashboard.html')

    @app.route('/worker/dashboard')
    def worker_dashboard():
        return render_template('worker/dashboard.html')

    @app.route('/admin/heatmap')
    def admin_heatmap():
        return render_template('admin/heatmap.html')

    return app

app = create_app()

if __name__ == '__main__':
    # When running locally
    app.run(host='0.0.0.0', port=5000, debug=True)
