from flask import Blueprint, request, jsonify, g
from functools import wraps
from datetime import datetime
from config import Config
from firebase_admin import auth
from firebase import db
import cloudinary
import cloudinary.uploader
import math

api = Blueprint('api', __name__)

def calculate_priority(category, support_count, created_at_iso):
    """
    Priority = severity_weight + support_count + age_in_days
    """
    severity_map = {
        "Garbage/Waste": 2,
        "Streetlight/Electrical": 3,
        "Roads & Potholes": 4,
        "Roads": 4,
        "Water/Sewage": 5,
        "Other Civic Issue": 1,
        "Other": 1
    }
    severity = severity_map.get(category, 1)
    
    try:
        created_date = datetime.fromisoformat(created_at_iso)
        age_days = (datetime.utcnow() - created_date).days
        age_days = max(0, age_days)
    except:
        age_days = 0
        
    return severity + support_count + age_days

def get_department_for_category(category):
    dept_map = {
        "Garbage/Waste": "Waste Management",
        "Streetlight/Electrical": "Electrical Department",
        "Roads & Potholes": "Public Works",
        "Roads": "Public Works",
        "Water/Sewage": "Water Department",
        "Other Civic Issue": "General Services",
        "Other": "General Services"
    }
    return dept_map.get(category, "General Services")

def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two lat/lng coordinates in km."""
    if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
        return float('inf')
    R = 6371 # Earth radius in km
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = math.sin(dLat/2) * math.sin(dLat/2) + \
        math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * \
        math.sin(dLon/2) * math.sin(dLon/2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

@api.route('/health', methods=['GET'])
def health_check():
    # Also verify firestore connection
    firestore_status = "connected" if db is not None else "not configured (dummy mode)"
    return jsonify({
        "status": "healthy", 
        "message": "Backend is running!",
        "firestore": firestore_status
    })

from firebase_admin import auth

def get_current_user():
    """Extracts ID token, verifies, and fetches/creates Firestore profile."""
    if hasattr(g, 'user'):
        return g.user

    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        # Fallback for prototype testing if no token is provided
        return {"uid": "mock-user-1", "role": "citizen", "email": "mock@example.com"}
        
    id_token = auth_header.split('Bearer ')[1]
    
    if db is None:
        return {"uid": "mock-user-1", "role": "citizen", "email": "mock@example.com"}
        
    try:
        decoded_token = auth.verify_id_token(id_token)
        uid = decoded_token['uid']
        email = decoded_token.get('email', '')
        
        user_ref = db.collection('users').document(uid)
        user_doc = user_ref.get()
        
        if user_doc.exists:
            g.user = user_doc.to_dict()
        else:
            g.user = {
                "uid": uid,
                "email": email,
                "role": "citizen",
                "department_id": None
            }
            user_ref.set(g.user)
            
        return g.user
    except Exception as e:
        return None

def get_current_user_id():
    user = get_current_user()
    return user['uid'] if user else None

def require_roles(allowed_roles):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user = get_current_user()
            if not user:
                return jsonify({
                    "error": "unauthorized",
                    "message": "Authentication required."
                }), 401
            if user.get('role') not in allowed_roles:
                return jsonify({
                    "error": "forbidden",
                    "message": "You do not have permission to access this resource."
                }), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator

@api.route('/users/me', methods=['GET'])
def get_me():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    return jsonify(user), 200

@api.route('/complaints', methods=['POST'])
@require_roles(['citizen', 'service_worker', 'department_head', 'city_admin', 'main_authority'])
def create_complaint():
    data = request.json
    citizen_id = get_current_user_id()
    
    category = data.get('category', 'General')
    
    complaint_data = {
        "citizen_id": citizen_id,
        "category": category,
        "description": data.get('description', ''),
        "location_text": data.get('location_text', ''),
        "location_lat": data.get('location_lat'),
        "location_lng": data.get('location_lng'),
        "image_url": data.get('image_url', ''),
        "status": 'pending_verification',
        "department": get_department_for_category(category),
        "supporters": [citizen_id],
        "support_count": 1,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat()
    }
    complaint_data["priority_score"] = calculate_priority(category, 1, complaint_data["created_at"])
    
    if db is not None:
        doc_ref = db.collection('complaints').document()
        doc_ref.set(complaint_data)
        complaint_data['id'] = doc_ref.id
    else:
        complaint_data['id'] = "mock-id-123"
        
    return jsonify(complaint_data), 201

@api.route('/complaints/check_duplicate', methods=['POST'])
def check_duplicate():
    """Finds potential duplicate complaints based on category and rough proximity."""
    data = request.json
    category = data.get('category')
    lat = data.get('location_lat')
    lng = data.get('location_lng')
    
    if not category:
        return jsonify([]), 200
        
    if db is None:
        return jsonify([]), 200
        
    # Efficient Firestore filter by category and unresolved status
    # To avoid composite index requirements for the hackathon, we fetch by category and filter in-memory
    docs = db.collection('complaints').where('category', '==', category).stream()
    
    potential_duplicates = []
    for doc in docs:
        c = doc.to_dict()
        if c.get('status') in ['resolved', 'closed']:
            continue
            
        c['id'] = doc.id
        
        # Check location proximity if coordinates provided
        if lat is not None and lng is not None:
            dist = haversine_distance(lat, lng, c.get('location_lat'), c.get('location_lng'))
            # Consider it a potential duplicate if within ~2km
            if dist <= 2.0:
                c['distance_km'] = round(dist, 2)
                potential_duplicates.append(c)
        else:
            # If no coordinates, just return recent ones from same category
            potential_duplicates.append(c)
            
    # Sort by created_at descending and return top 3
    potential_duplicates.sort(key=lambda x: x.get('created_at', ''), reverse=True)
    return jsonify(potential_duplicates[:3]), 200

@api.route('/complaints/<complaint_id>/support', methods=['POST'])
def support_complaint(complaint_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    if db is None:
        return jsonify({"error": "Firestore not configured"}), 500
        
    doc_ref = db.collection('complaints').document(complaint_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        return jsonify({"error": "Not found"}), 404
        
    c = doc.to_dict()
    supporters = c.get('supporters', [])
    
    if user_id in supporters:
        return jsonify({"message": "Already supported", "complaint": c}), 200
        
    supporters.append(user_id)
    support_count = len(supporters)
    new_priority = calculate_priority(c.get('category'), support_count, c.get('created_at'))
    
    doc_ref.update({
        'supporters': supporters,
        'support_count': support_count,
        'priority_score': new_priority,
        'updated_at': datetime.utcnow().isoformat()
    })
    
    c['supporters'] = supporters
    c['support_count'] = support_count
    c['priority_score'] = new_priority
    c['id'] = complaint_id
    
    return jsonify({"message": "Support added successfully", "complaint": c}), 200

@api.route('/complaints', methods=['GET'])
@require_roles(['main_authority'])
def list_complaints():
    if db is None:
        return jsonify([]), 200
        
    # Limiting query for Firestore free-tier efficiency as requested
    limit = int(request.args.get('limit', 50))
    
    docs = db.collection('complaints').order_by('created_at', direction='DESCENDING').limit(limit).stream()
    complaints = []
    
    now = datetime.utcnow()
    for doc in docs:
        c = doc.to_dict()
        c['id'] = doc.id
        
        try:
            created_date = datetime.fromisoformat(c.get('created_at'))
            age = (now - created_date).days
            c['is_overdue'] = age >= 3 and c.get('status') not in ['closed', 'resolved', 'completed']
        except:
            c['is_overdue'] = False
            
        complaints.append(c)
        
    return jsonify(complaints), 200

@api.route('/complaints/me', methods=['GET'])
@require_roles(['citizen', 'service_worker', 'department_head', 'city_admin', 'main_authority'])
def list_my_complaints():
    user_id = get_current_user_id()
        
    if db is None:
        return jsonify([]), 200
        
    limit = int(request.args.get('limit', 50))
    
    # Efficient Firestore query filtering by citizen_id (no order_by to avoid composite index requirement)
    docs = db.collection('complaints').where('citizen_id', '==', user_id).limit(limit).stream()
    
    complaints = []
    for doc in docs:
        c = doc.to_dict()
        c['id'] = doc.id
        complaints.append(c)
        
    # Sort in memory by created_at DESCENDING
    complaints.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        
    return jsonify(complaints), 200

@api.route('/complaints/<complaint_id>', methods=['GET'])
def get_complaint(complaint_id):
    if db is None:
        return jsonify({"error": "Firestore not configured"}), 500
        
    doc = db.collection('complaints').document(complaint_id).get()
    if doc.exists:
        complaint = doc.to_dict()
        complaint['id'] = doc.id
        return jsonify(complaint), 200
    return jsonify({"error": "Not found"}), 404

@api.route('/complaints/<complaint_id>/status', methods=['PATCH'])
def update_complaint_status(complaint_id):
    data = request.json
    user_id = get_current_user_id()
    
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    new_status = data.get('status')
    
    if not new_status:
        return jsonify({"error": "Status is required"}), 400
        
    if db is None:
        return jsonify({"error": "Firestore not configured"}), 500
        
    doc_ref = db.collection('complaints').document(complaint_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        return jsonify({"error": "Not found"}), 404
        
    # Update status
    update_data = {
        "status": new_status,
        "updated_at": datetime.utcnow().isoformat()
    }
    doc_ref.update(update_data)
    
    # Log update history efficiently
    update_log = {
        "complaint_id": complaint_id,
        "user_id": user_id,
        "action": new_status,
        "notes": data.get('notes', ''),
        "created_at": datetime.utcnow().isoformat()
    }
    db.collection('complaint_updates').add(update_log)
    
    updated_complaint = doc.to_dict()
    updated_complaint.update(update_data)
    updated_complaint['id'] = complaint_id
    
    return jsonify(updated_complaint), 200

@api.route('/admin/complaints', methods=['GET'])
@require_roles(['city_admin', 'main_authority', 'department_head'])
def admin_list_complaints():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
        
    if db is None:
        return jsonify([]), 200
        
    status_filter = request.args.get('status')
    
    query = db.collection('complaints')
    if user.get('role') == 'department_head':
        if not user.get('department_id'):
            return jsonify([]), 200
        query = query.where('department', '==', user.get('department_id'))
        
    docs = query.limit(100).stream()
    
    complaints = []
    now = datetime.utcnow()
    
    for doc in docs:
        c = doc.to_dict()
        if status_filter and c.get('status') != status_filter:
            continue
        c['id'] = doc.id
        
        try:
            created_date = datetime.fromisoformat(c.get('created_at'))
            age = (now - created_date).days
            c['is_overdue'] = age >= 3 and c.get('status') not in ['closed', 'resolved', 'completed']
        except:
            c['is_overdue'] = False
            
        complaints.append(c)
        
    complaints.sort(key=lambda x: x.get('created_at', ''), reverse=True)
    return jsonify(complaints), 200

@api.route('/admin/complaints/<complaint_id>/verify', methods=['POST'])
@require_roles(['city_admin', 'main_authority'])
def admin_verify_complaint(complaint_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    if db is None:
        return jsonify({"error": "Firestore not configured"}), 500
        
    doc_ref = db.collection('complaints').document(complaint_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        return jsonify({"error": "Not found"}), 404
        
    c = doc.to_dict()
    if c.get('status') != 'pending_verification':
        return jsonify({"error": "Complaint is not pending verification"}), 400
        
    doc_ref.update({
        'status': 'verified',
        'updated_at': datetime.utcnow().isoformat(),
        'verified_by': user_id
    })
    
    c['status'] = 'verified'
    c['id'] = complaint_id
    
    return jsonify({"message": "Verified successfully", "complaint": c}), 200

@api.route('/admin/stats', methods=['GET'])
@require_roles(['city_admin', 'main_authority'])
def admin_stats():
    user_id = get_current_user_id()
        
    if db is None:
        return jsonify({"total": 0, "pending": 0, "resolved": 0}), 200
        
    try:
        # Efficient count() queries (cost 1 read per query in Firestore)
        total_query = db.collection('complaints').count()
        total = total_query.get()[0][0].value
        
        pending_query = db.collection('complaints').where('status', '==', 'pending_verification').count()
        pending = pending_query.get()[0][0].value
        
        resolved_query = db.collection('complaints').where('status', 'in', ['resolved', 'closed']).count()
        resolved = resolved_query.get()[0][0].value
        
        return jsonify({
            "total": total,
            "pending": pending,
            "resolved": resolved
        }), 200
    except Exception as e:
        # Fallback if count() is not fully supported by older SDK versions
        return jsonify({"error": str(e), "total": 0, "pending": 0, "resolved": 0}), 200

@api.route('/admin/complaints/<complaint_id>/assign', methods=['POST'])
@require_roles(['city_admin', 'main_authority', 'department_head'])
def admin_assign_complaint(complaint_id):
    user = get_current_user()
        
    data = request.json
    worker_id = data.get('worker_id')
    if not worker_id:
        return jsonify({"error": "worker_id is required"}), 400
        
    if db is None:
        return jsonify({"error": "Firestore not configured"}), 500
        
    doc_ref = db.collection('complaints').document(complaint_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        return jsonify({"error": "Not found"}), 404
        
    c = doc.to_dict()
    if user.get('role') == 'department_head' and c.get('department') != user.get('department_id'):
        return jsonify({"error": "Forbidden: Complaint is not in your department"}), 403
        
    if c.get('status') != 'verified':
        return jsonify({"error": "Complaint must be verified before assignment"}), 400
        
    doc_ref.update({
        'status': 'assigned',
        'worker_id': worker_id,
        'assigned_at': datetime.utcnow().isoformat(),
        'updated_at': datetime.utcnow().isoformat()
    })
    c['status'] = 'assigned'
    
    return jsonify({"message": "Assigned successfully"}), 200

@api.route('/worker/complaints', methods=['GET'])
@require_roles(['service_worker'])
def worker_list_complaints():
    user = get_current_user()
    
    if db is None:
        return jsonify([]), 200
        
    # Strictly scoped to assigned worker
    docs = db.collection('complaints').where('worker_id', 'in', [user['uid'], user.get('email')]).stream()
    
    complaints = []
    for doc in docs:
        c = doc.to_dict()
        c['id'] = doc.id
        complaints.append(c)
        
    complaints.sort(key=lambda x: x.get('assigned_at', ''), reverse=True)
    return jsonify(complaints), 200

@api.route('/worker/complaints/<complaint_id>/proof', methods=['POST'])
@require_roles(['service_worker'])
def worker_upload_proof(complaint_id):
    user = get_current_user()
        
    data = request.json
    proof_url = data.get('proof_url')
    
    if not proof_url:
        return jsonify({"error": "Proof image URL is required"}), 400
        
    if db is None:
        return jsonify({"error": "Firestore not configured"}), 500
        
    doc_ref = db.collection('complaints').document(complaint_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        return jsonify({"error": "Not found"}), 404
        
    c = doc.to_dict()
    
    # Strict Worker Scoping Check
    if c.get('worker_id') not in [user['uid'], user.get('email')]:
        return jsonify({"error": "Forbidden: This task is not assigned to you"}), 403
        
    if c.get('status') != 'assigned':
        return jsonify({"error": "Complaint must be assigned before providing proof"}), 400
        
    doc_ref.update({
        'status': 'completed',
        'proof_image_url': proof_url,
        'completed_at': datetime.utcnow().isoformat(),
        'updated_at': datetime.utcnow().isoformat()
    })
    
    return jsonify({"message": "Proof uploaded successfully"}), 200

@api.route('/complaints/<complaint_id>/confirm', methods=['POST'])
def citizen_confirm_complaint(complaint_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    if db is None:
        return jsonify({"error": "Firestore not configured"}), 500
        
    doc_ref = db.collection('complaints').document(complaint_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        return jsonify({"error": "Not found"}), 404
        
    c = doc.to_dict()
    if c.get('citizen_id') != user_id:
        return jsonify({"error": "Forbidden"}), 403
        
    if c.get('status') != 'completed':
        return jsonify({"error": "Complaint is not completed"}), 400
        
    doc_ref.update({
        'status': 'closed',
        'closed_at': datetime.utcnow().isoformat(),
        'updated_at': datetime.utcnow().isoformat()
    })
    
    return jsonify({"message": "Confirmed and closed successfully"}), 200

@api.route('/complaints/<complaint_id>/reject', methods=['POST'])
def citizen_reject_complaint(complaint_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    if db is None:
        return jsonify({"error": "Firestore not configured"}), 500
        
    doc_ref = db.collection('complaints').document(complaint_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        return jsonify({"error": "Not found"}), 404
        
    c = doc.to_dict()
    if c.get('citizen_id') != user_id:
        return jsonify({"error": "Forbidden"}), 403
        
    if c.get('status') != 'completed':
        return jsonify({"error": "Complaint is not completed"}), 400
        
    doc_ref.update({
        'status': 'reopened',
        'reopened_at': datetime.utcnow().isoformat(),
        'updated_at': datetime.utcnow().isoformat()
    })
    
    return jsonify({"message": "Complaint reopened successfully"}), 200

@api.route('/upload_image', methods=['POST'])
def upload_image():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    if 'image' not in request.files:
        return jsonify({"error": "No image file provided"}), 400
        
    file = request.files['image']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
        
    # Validate extension
    allowed_exts = {'jpg', 'jpeg', 'png', 'webp'}
    ext = file.filename.rsplit('.', 1)[-1].lower()
    if '.' not in file.filename or ext not in allowed_exts:
        return jsonify({"error": "Invalid file type. Only JPG, PNG, and WebP are allowed."}), 400
        
    # Validate size by moving cursor to end and checking length, then reset
    file.seek(0, 2)
    file_size = file.tell()
    file.seek(0)
    
    if file_size > 5 * 1024 * 1024:
        return jsonify({"error": "File size exceeds 5MB limit."}), 400
        
    folder = request.form.get('folder', 'smart-city/misc')
    
    try:
        upload_result = cloudinary.uploader.upload(
            file,
            folder=folder,
            resource_type="image"
        )
        return jsonify({"url": upload_result.get("secure_url")}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to upload image: {str(e)}"}), 500
