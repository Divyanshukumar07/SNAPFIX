import os
from flask import Blueprint, request, jsonify, g
from datetime import datetime, timedelta
import firebase_admin
from firebase_admin import auth, firestore
import cloudinary
import cloudinary.uploader
import cloudinary.api
from functools import wraps
import math
from config import Config
from firebase import db

api = Blueprint('api', __name__)

def contains_profanity(text):
    if not text:
        return False
    bad_words = {'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'dick', 'bastard', 'slut', 'whore'}
    words = text.lower().split()
    for word in words:
        clean_word = "".join(c for c in word if c.isalpha())
        if clean_word in bad_words:
            return True
    return False

def add_complaint_history(event_type, user_dict, prev_status, new_status, details=None, worker_uid=None):
    """
    Returns a structured dictionary representing a complaint lifecycle event.
    Must be appended to the complaint's history array using firestore.ArrayUnion.
    """
    event = {
        "action": event_type,
        "timestamp": datetime.utcnow().isoformat(),
        "actor_uid": user_dict.get('uid', 'unknown'),
        "actor_role": user_dict.get('role', 'unknown'),
        "previous_status": prev_status,
        "new_status": new_status
    }
    
    if user_dict.get('email'):
        event['actor_email'] = user_dict.get('email')
        
    if user_dict.get('department_id'):
        event['actor_department'] = user_dict.get('department_id')
        
    if details:
        event['details'] = details
        
    if worker_uid:
        event['worker_uid'] = worker_uid
        
    return event

def calculate_priority(category, support_count, created_at_iso, has_evidence=False, reopen_count=0):
    """
    Priority Score = Seriousness + Days Passed + Supporters
    - Seriousness (1-5) based on category
    - Days Passed (+1 per day since creation)
    - Supporters (+1 per supporter)
    No caps, no evidence points, no reopen points.
    """
    severity_map = {
        "Water/Sewage": 5,
        "Roads & Potholes": 4,
        "Roads": 4,
        "Streetlight/Electrical": 3,
        "Garbage/Waste": 2,
        "Other Civic Issue": 1,
        "Other": 1
    }
    seriousness = severity_map.get(category, 1)
    
    try:
        created_date = datetime.fromisoformat(created_at_iso)
        age_days = (datetime.utcnow() - created_date).days
        days_passed = max(0, age_days)
    except:
        days_passed = 0
        
    supporters_score = max(0, support_count)
    
    total_score = seriousness + days_passed + supporters_score
    return total_score

def get_priority_breakdown(c):
    """
    Returns a dictionary breakdown of how the priority score was calculated
    based strictly on the new 3-factor dynamic priority logic.
    """
    category = c.get('category', 'General')
    support_count = c.get('support_count', 1)
    created_at_iso = c.get('created_at', datetime.utcnow().isoformat())
    
    severity_map = {
        "Water/Sewage": 5,
        "Roads & Potholes": 4,
        "Roads": 4,
        "Streetlight/Electrical": 3,
        "Garbage/Waste": 2,
        "Other Civic Issue": 1,
        "Other": 1
    }
    seriousness = severity_map.get(category, 1)
    
    try:
        created_date = datetime.fromisoformat(created_at_iso)
        age_days = (datetime.utcnow() - created_date).days
        days_passed = max(0, age_days)
    except:
        days_passed = 0
        
    supporters_score = max(0, support_count)
    
    total_score = seriousness + days_passed + supporters_score
    
    return {
        "seriousness": seriousness,
        "days_passed": days_passed,
        "supporters": supporters_score,
        "total": total_score
    }

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
        decoded_token = auth.verify_id_token(id_token, clock_skew_seconds=60)
        uid = decoded_token['uid']
        email = decoded_token.get('email', '')
        email_verified = decoded_token.get('email_verified', False)
        
        user_ref = db.collection('users').document(uid)
        user_doc = user_ref.get()
        
        if user_doc.exists:
            g.user = user_doc.to_dict()
            g.user['email_verified'] = email_verified
            # Ensure UID is in the dict
            if 'uid' not in g.user:
                g.user['uid'] = uid
        else:
            role = "citizen"
            
            g.user = {
                "uid": uid,
                "email": email,
                "email_verified": email_verified,
                "role": role,
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

def generate_report_id():
    year = datetime.utcnow().year
    if db is None:
        raise Exception("Firestore is not configured. Cannot generate safe report ID.")
        
    try:
        counter_ref = db.collection('system').document('counters')
        transaction = db.transaction()
        count = get_next_report_id_transaction(transaction, counter_ref)
        return f"SNF-{year}-{count:06d}"
    except Exception as e:
        print(f"Critical error generating Report ID: {e}")
        raise


@api.route('/complaints', methods=['POST'])
@require_roles(['citizen', 'service_worker', 'department_head', 'city_admin', 'main_authority'])
def create_complaint():
    user = get_current_user()
    if not user.get('email_verified', False) and user.get('uid') != 'mock-user-1':
        return jsonify({"error": "Email verification is required before you can submit a complaint."}), 403
        
    if user.get('account_status') == 'banned':
        return jsonify({"error": "Your account is currently banned from submitting new complaints. Please contact the appropriate authority if you believe this action was made in error."}), 403

    data = request.json
    citizen_id = get_current_user_id()
    
    category = data.get('category', 'General')
    description = data.get('description', '')
    
    if contains_profanity(description):
        return jsonify({"error": "Inappropriate language detected. Please revise your description."}), 400
    
    try:
        report_id = generate_report_id()
    except Exception as e:
        return jsonify({"error": "Failed to generate a unique Report ID. Please try again later."}), 500
    
    complaint_data = {
        "report_id": report_id,
        "citizen_id": citizen_id,
        "category": category,
        "description": description,
        "location_state": data.get('location_state', ''),
        "location_region": data.get('location_region', ''),
        "location_locality": data.get('location_locality', ''),
        "location_text": data.get('location_text', ''),
        "location_lat": data.get('location_lat'),
        "location_lng": data.get('location_lng'),
        "image_url": data.get('image_url', ''),
        "status": 'pending_verification',
        "department": get_department_for_category(category),
        "supporters": [citizen_id],
        "support_count": 1,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
        "history": [add_complaint_history('CREATED', user, None, 'pending_verification', f'Citizen created complaint {report_id}')]
    }
    has_evidence = bool(complaint_data.get('image_url'))
    complaint_data["priority_score"] = calculate_priority(category, 1, complaint_data["created_at"], has_evidence=has_evidence, reopen_count=0)
    
    if db is not None:
        doc_ref = db.collection('complaints').document()
        doc_ref.set(complaint_data)
        complaint_data['id'] = doc_ref.id
    else:
        complaint_data['id'] = "mock-id-123"
        
    return jsonify(complaint_data), 201

@api.route('/complaints/<complaint_id>', methods=['PUT', 'DELETE'])
@require_roles(['citizen', 'service_worker', 'department_head', 'city_admin', 'main_authority'])
def modify_complaint(complaint_id):
    user_id = get_current_user_id()
    if not user_id or db is None:
        return jsonify({"error": "Unauthorized or Firestore not configured"}), 401
        
    doc_ref = db.collection('complaints').document(complaint_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        return jsonify({"error": "Complaint not found"}), 404
        
    c = doc.to_dict()
    
    # Only the creator can modify or delete
    if c.get('citizen_id') != user_id:
        return jsonify({"error": "You do not have permission to modify this complaint"}), 403
        
    # Block edits/deletes if a worker is assigned or status has progressed
    if c.get('status') not in ['pending_verification']:
        return jsonify({"error": "This complaint is already being processed and cannot be modified"}), 400
        
    if request.method == 'DELETE':
        doc_ref.update({
            'is_deleted': True,
            'deleted_at': datetime.utcnow().isoformat()
        })
        return jsonify({"message": "Complaint deleted successfully"}), 200
        
    if request.method == 'PUT':
        data = request.json
        description = data.get('description', c.get('description'))
        
        if contains_profanity(description):
            return jsonify({"error": "Inappropriate language detected. Please revise your description."}), 400
            
        updates = {
            "description": description,
            "location_text": data.get('location_text', c.get('location_text')),
            "updated_at": datetime.utcnow().isoformat()
        }
        
        # Category change requires recalculating priority and department
        new_category = data.get('category')
        if new_category and new_category != c.get('category'):
            updates['category'] = new_category
            updates['department'] = get_department_for_category(new_category)
            updates['priority_score'] = calculate_priority(
                new_category, 
                c.get('support_count', 1), 
                c.get('created_at'), 
                has_evidence=bool(c.get('image_url')), 
                reopen_count=c.get('reopen_count', 0)
            )
            
        # Update coordinates if provided
        if data.get('location_lat') is not None and data.get('location_lng') is not None:
            updates['location_lat'] = data.get('location_lat')
            updates['location_lng'] = data.get('location_lng')
            
        user = get_current_user()
        event = add_complaint_history('EDITED', user, c.get('status'), c.get('status'), 'Citizen edited complaint')
        updates['history'] = firestore.ArrayUnion([event])
            
        doc_ref.update(updates)
        return jsonify({"message": "Complaint updated successfully"}), 200

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
        if c.get('status') in ['resolved', 'closed'] or c.get('is_deleted', False):
            continue
            
        # Locality match check (Issue 16)
        req_locality = data.get('location_locality', '').lower().strip()
        c_locality = c.get('location_locality', '').lower().strip()
        if req_locality and c_locality and req_locality != c_locality:
            continue
            
        c['id'] = doc.id
        
        # Check location proximity if coordinates provided
        if lat is not None and lng is not None:
            dist = haversine_distance(lat, lng, c.get('location_lat'), c.get('location_lng'))
            # Consider it a potential duplicate if within ~2km
            if dist <= 2.0:
                c['distance_km'] = round(dist, 2)
                
                # Basic text similarity check (Jaccard similarity) if description provided
                desc1 = data.get('description', '').lower().split()
                desc2 = c.get('description', '').lower().split()
                if desc1 and desc2:
                    intersection = set(desc1).intersection(set(desc2))
                    union = set(desc1).union(set(desc2))
                    sim = len(intersection) / len(union) if union else 0
                    c['text_similarity'] = round(sim, 2)
                
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
        supporters.remove(user_id)
        msg = "Support removed"
    else:
        supporters.append(user_id)
        msg = "Support added successfully"
        
    support_count = len(supporters)
    has_evidence = bool(c.get('image_url'))
    reopen_count = c.get('reopen_count', 0)
    new_priority = calculate_priority(c.get('category'), support_count, c.get('created_at'), has_evidence=has_evidence, reopen_count=reopen_count)
    
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
    
    return jsonify({"message": msg, "complaint": c}), 200

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
        if c.get('is_deleted', False):
            continue
        c['id'] = doc.id
        c['priority_breakdown'] = get_priority_breakdown(c)
        
        try:
            created_date = datetime.fromisoformat(c.get('created_at'))
            age = (now - created_date).days
            c['is_overdue'] = age >= 3 and c.get('status') not in ['closed', 'resolved', 'completed']
        except:
            c['is_overdue'] = False
            
        complaints.append(c)
        
    return jsonify(complaints), 200

@api.route('/complaints/track/<report_id>', methods=['GET'])
def track_complaint(report_id):
    if db is None:
        return jsonify({"error": "Firestore not configured"}), 500
        
    docs = db.collection('complaints').where('report_id', '==', report_id.strip().upper()).limit(1).stream()
    complaint = None
    for doc in docs:
        complaint = doc.to_dict()
        complaint['id'] = doc.id
        break
        
    if not complaint:
        return jsonify({"error": "Complaint not found"}), 404
        
    # Public tracking info (no PII)
    public_data = {
        "id": complaint['id'],
        "report_id": complaint.get('report_id'),
        "category": complaint.get('category'),
        "description": complaint.get('description'),
        "location_locality": complaint.get('location_locality'),
        "location_state": complaint.get('location_state'),
        "status": complaint.get('status'),
        "assignment_state": complaint.get('assignment_state'),
        "priority_score": complaint.get('priority_score'),
        "created_at": complaint.get('created_at'),
        "image_url": complaint.get('image_url'),
        "support_count": complaint.get('support_count'),
        "history": complaint.get('history', [])
    }
    return jsonify(public_data), 200

@api.route('/complaints/public', methods=['GET'])
def list_public_complaints():
    if db is None:
        return jsonify([]), 200
        
    limit = int(request.args.get('limit', 50))
    
    # We want ALL public complaints (no support threshold)
    # Stream all and filter in memory to avoid composite index limits during hackathon.
    docs = db.collection('complaints').order_by('created_at', direction=firestore.Query.DESCENDING).limit(limit * 2).stream()
    complaints = []
    
    now = datetime.utcnow()
    for doc in docs:
        c = doc.to_dict()
        if c.get('is_deleted', False) or c.get('status') == 'false_report':
            continue
            
        c['id'] = doc.id
        c['priority_breakdown'] = get_priority_breakdown(c)
        
        # Privacy Check: ALWAYS strip PII for public wall
        c.pop('citizen_id', None)
        c.pop('citizen_email', None)
        
        # Scrub history emails
        if 'history' in c:
            for event in c['history']:
                event.pop('actor_email', None)
        
        try:
            created_date = datetime.fromisoformat(c.get('created_at'))
            age = (now - created_date).days
            c['is_overdue'] = age >= 3 and c.get('status') not in ['closed', 'resolved', 'completed']
        except:
            c['is_overdue'] = False
            
        complaints.append(c)
        if len(complaints) >= limit:
            break
        
    # No need to sort again since we used order_by
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
        if c.get('is_deleted', False):
            continue
        c['id'] = doc.id
        c['priority_breakdown'] = get_priority_breakdown(c)
        complaints.append(c)
        
    # Sort in memory by created_at DESCENDING
    complaints.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        
    return jsonify(complaints), 200

@api.route('/complaints/<complaint_id>', methods=['GET'])
@require_roles(['citizen', 'service_worker', 'department_head', 'city_admin', 'main_authority'])
def get_complaint(complaint_id):
    if db is None:
        return jsonify({"error": "Firestore not configured"}), 500
        
    doc = db.collection('complaints').document(complaint_id).get()
    if doc.exists:
        complaint = doc.to_dict()
        if complaint.get('is_deleted', False):
            return jsonify({"error": "Not found"}), 404
            
        complaint['id'] = doc.id
        complaint['priority_breakdown'] = get_priority_breakdown(complaint)
        
        # Privacy Check: Strip PII if citizen is not the owner
        user = get_current_user()
        if user.get('role') == 'citizen' and complaint.get('citizen_id') != user.get('uid'):
            # Strip private info but leave community data
            complaint.pop('citizen_id', None)
            complaint.pop('citizen_email', None)
            
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
        if c.get('is_deleted', False):
            continue
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

@api.route('/admin/complaints/deleted', methods=['GET'])
@require_roles(['city_admin', 'main_authority'])
def admin_list_deleted_complaints():
    user = get_current_user()
    if not user or db is None:
        return jsonify({"error": "Unauthorized or no DB"}), 401
        
    # We can't efficiently where() for is_deleted across a huge dataset without an index,
    # but for hackathon scale, streaming and filtering is acceptable.
    docs = db.collection('complaints').stream()
    complaints = []
    
    for doc in docs:
        c = doc.to_dict()
        if c.get('is_deleted', False):
            c['id'] = doc.id
            complaints.append(c)
            
    complaints.sort(key=lambda x: x.get('deleted_at', x.get('created_at', '')), reverse=True)
    return jsonify(complaints), 200

@api.route('/admin/complaints/<complaint_id>/restore', methods=['POST'])
@require_roles(['city_admin', 'main_authority'])
def restore_deleted_complaint(complaint_id):
    if db is None:
        return jsonify({"error": "Firestore not configured"}), 500
        
    doc_ref = db.collection('complaints').document(complaint_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        return jsonify({"error": "Complaint not found"}), 404
        
    doc_ref.update({
        'is_deleted': False,
        'deleted_at': firestore.DELETE_FIELD,
        'updated_at': datetime.utcnow().isoformat()
    })
    
    return jsonify({"message": "Complaint restored successfully"}), 200

@api.route('/admin/complaints/<complaint_id>/verify', methods=['POST'])
@require_roles(['city_admin', 'main_authority', 'department_head'])
def admin_verify_complaint(complaint_id):
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
        
    if db is None:
        return jsonify({"error": "Firestore not configured"}), 500
        
    doc_ref = db.collection('complaints').document(complaint_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        return jsonify({"error": "Not found"}), 404
        
    c = doc.to_dict()
    
    # Strict Scoping Check
    if user.get('role') == 'department_head':
        if not user.get('department_id') or c.get('department') != user.get('department_id'):
            return jsonify({"error": "Forbidden: Department mismatch"}), 403
            
    if c.get('status') != 'pending_verification':
        return jsonify({"error": "Complaint is not pending verification"}), 400
        
    event = add_complaint_history('VERIFIED', user, c.get('status'), 'verified')
        
    doc_ref.update({
        'status': 'verified',
        'updated_at': datetime.utcnow().isoformat(),
        'verified_by': user.get('uid'),
        'history': firestore.ArrayUnion([event])
    })
    
    c['status'] = 'verified'
    c['id'] = complaint_id
    
    return jsonify({"message": "Verified successfully", "complaint": c}), 200

@api.route('/admin/complaints/<complaint_id>/reject', methods=['POST'])
@require_roles(['city_admin', 'main_authority', 'department_head'])
def admin_reject_complaint_flow(complaint_id):
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
        
    data = request.json or {}
    reason = data.get('reason', 'No reason provided')
        
    if db is None:
        return jsonify({"error": "Firestore not configured"}), 500
        
    doc_ref = db.collection('complaints').document(complaint_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        return jsonify({"error": "Not found"}), 404
        
    c = doc.to_dict()
    
    # Strict Scoping Check
    if user.get('role') == 'department_head':
        if not user.get('department_id') or c.get('department') != user.get('department_id'):
            return jsonify({"error": "Forbidden: Department mismatch"}), 403
            
    if c.get('status') != 'pending_verification':
        return jsonify({"error": "Complaint is not pending verification"}), 400
        
    event = add_complaint_history('REJECTED', user, c.get('status'), 'rejected', f"Reason: {reason}")
        
    doc_ref.update({
        'status': 'rejected',
        'updated_at': datetime.utcnow().isoformat(),
        'rejected_by': user.get('uid'),
        'rejection_reason': reason,
        'history': firestore.ArrayUnion([event])
    })
    
    return jsonify({"message": "Complaint rejected successfully"}), 200

@api.route('/admin/stats', methods=['GET'])
@require_roles(['city_admin', 'main_authority'])
def admin_stats():
    user_id = get_current_user_id()
        
    if db is None:
        return jsonify({"total": 0, "pending": 0, "resolved": 0}), 200
        
    try:
        # Instead of count() queries which can't easily filter out missing fields, 
        # we'll stream and count in memory to accurately exclude soft-deleted items.
        docs = db.collection('complaints').stream()
        total = 0
        pending = 0
        resolved = 0
        
        for doc in docs:
            c = doc.to_dict()
            if c.get('is_deleted', False):
                continue
            total += 1
            if c.get('status') == 'pending_verification':
                pending += 1
            elif c.get('status') in ['resolved', 'closed']:
                resolved += 1
                
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
    
    worker_doc = db.collection('users').document(worker_id).get()
    if worker_doc.exists:
        w_data = worker_doc.to_dict()
        if w_data.get('worker_status') == 'OFFLINE':
            return jsonify({"error": "Worker is currently OFFLINE and cannot receive new assignments."}), 400
            
    force = data.get('force', False)
    deadline = data.get('expected_completion_deadline')
    
    if not deadline:
        return jsonify({"error": "expected_completion_deadline is required"}), 400
    
    if worker_id in c.get('rejected_workers', []):
        return jsonify({"error": f"Worker {worker_id} previously submitted rejected work for this complaint and cannot be reassigned."}), 400
    
    if not force:
        # Check worker load
        worker_docs = db.collection('complaints').where('worker_id', '==', worker_id).stream()
        active_tasks = sum(1 for w_doc in worker_docs if w_doc.to_dict().get('status') in ['assigned', 'completed'])
        
        if active_tasks >= 3:
            return jsonify({
                "warning": True,
                "message": f"Worker {worker_id} already has {active_tasks} active tasks. Proceed with assignment anyway?"
            }), 200
    
    # Strict Scoping Check
    if user.get('role') == 'department_head':
        if not user.get('department_id') or c.get('department') != user.get('department_id'):
            return jsonify({"error": "Forbidden: Department mismatch for complaint"}), 403
        if worker_doc.exists:
            w_data = worker_doc.to_dict()
            if w_data.get('department_id') != user.get('department_id'):
                return jsonify({"error": "Forbidden: Cannot assign worker from a different department"}), 403
            
    if c.get('status') not in ['verified', 'reopened']:
        return jsonify({"error": "Complaint must be verified or reopened before assignment"}), 400
        
    action = 'REASSIGNED' if c.get('worker_id') else 'ASSIGNED'
    
    doc_ref.update({
        'status': 'assigned',
        'worker_id': worker_id,
        'assigned_workers': firestore.ArrayUnion([worker_id]),
        'assignment_state': 'pending',
        'pre_assignment_status': c.get('status'),
        'expected_completion_deadline': deadline,
        'assigned_at': datetime.utcnow().isoformat(),
        'assigned_by': user.get('uid')
    })
    
    event = add_complaint_history('ASSIGNMENT PENDING', user, c.get('status'), 'assigned', f"Assignment pending for {worker_id}", worker_uid=worker_id)
    doc_ref.update({
        'history': firestore.ArrayUnion([event])
    })
    
    return jsonify({"message": "Complaint assigned successfully"}), 200

@api.route('/worker/status', methods=['PATCH'])
@require_roles(['service_worker'])
def update_worker_status():
    user = get_current_user()
    data = request.json
    new_status = data.get('status')
    if new_status not in ['AVAILABLE', 'OFFLINE']:
        return jsonify({"error": "Invalid status"}), 400
        
    if db:
        db.collection('users').document(user['uid']).update({
            'worker_status': new_status
        })
    return jsonify({"message": "Status updated successfully", "status": new_status}), 200

@api.route('/worker/complaints/<complaint_id>/assignment', methods=['PATCH'])
@require_roles(['service_worker'])
def handle_assignment(complaint_id):
    user = get_current_user()
    data = request.json
    action = data.get('action') # 'accept', 'reject', 'start'
    reason = data.get('reason', '')
    
    if action not in ['accept', 'reject', 'start']:
        return jsonify({"error": "Invalid action"}), 400
        
    if action == 'reject' and not reason.strip():
        return jsonify({"error": "Rejection reason is required"}), 400
        
    if db is None:
        return jsonify({"error": "Firestore not configured"}), 500
        
    doc_ref = db.collection('complaints').document(complaint_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        return jsonify({"error": "Complaint not found"}), 404
        
    c = doc.to_dict()
    if c.get('worker_id') != user['uid']:
        return jsonify({"error": "Not assigned to this worker"}), 400
        
    if action == 'accept':
        if c.get('assignment_state') != 'pending':
            return jsonify({"error": "Assignment is not pending"}), 400
        event = add_complaint_history('ASSIGNMENT_ACCEPTED', user, 'assigned', 'assigned', f"Assignment accepted by {user.get('email')}", worker_uid=user['uid'])
        doc_ref.update({
            'assignment_state': 'accepted',
            'history': firestore.ArrayUnion([event])
        })
        return jsonify({"message": "Assignment accepted"}), 200
    elif action == 'start':
        if c.get('assignment_state') != 'accepted':
            return jsonify({"error": "Assignment must be accepted before starting"}), 400
        event = add_complaint_history('WORK_STARTED', user, 'assigned', 'assigned', f"Work started by {user.get('email')}", worker_uid=user['uid'])
        doc_ref.update({
            'assignment_state': 'in_progress',
            'history': firestore.ArrayUnion([event])
        })
        return jsonify({"message": "Work started"}), 200
    else:
        # Reject
        if c.get('assignment_state') != 'pending':
            return jsonify({"error": "Only pending assignments can be rejected"}), 400
        prev_status = c.get('pre_assignment_status', 'verified')
        event = add_complaint_history('ASSIGNMENT_REJECTED', user, 'assigned', prev_status, f"Reason: {reason}", worker_uid=user['uid'])
        doc_ref.update({
            'worker_id': None,
            'assignment_state': 'rejected',
            'status': prev_status,
            'history': firestore.ArrayUnion([event])
        })
        return jsonify({"message": "Assignment rejected"}), 200
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
        
    if c.get('assignment_state') not in ['accepted', 'in_progress'] and c.get('status') != 'assigned':
        return jsonify({"error": "Complaint must be accepted/in_progress before providing proof"}), 400
        
    event = add_complaint_history('WORK_COMPLETED', user, c.get('status'), 'completed', 'Worker uploaded proof', worker_uid=user['uid'])
    
    doc_ref.update({
        'status': 'completed',
        'assignment_state': 'proof_submitted',
        'proof_image_url': proof_url,
        'completed_at': datetime.utcnow().isoformat(),
        'updated_at': datetime.utcnow().isoformat(),
        'history': firestore.ArrayUnion([event])
    })
    
    return jsonify({"message": "Proof uploaded successfully"}), 200

@api.route('/worker/complaints/<complaint_id>/extension', methods=['POST'])
@require_roles(['service_worker'])
def worker_request_extension(complaint_id):
    user = get_current_user()
    data = request.json or {}
    reason = data.get('reason')
    requested_days = data.get('requested_days')
    
    if not reason or not requested_days:
        return jsonify({"error": "Reason and requested_days are required"}), 400
        
    try:
        requested_days = int(requested_days)
        if requested_days <= 0:
            raise ValueError()
    except ValueError:
        return jsonify({"error": "requested_days must be a positive integer"}), 400
        
    if db is None:
        return jsonify({"error": "Firestore not configured"}), 500
        
    doc_ref = db.collection('complaints').document(complaint_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        return jsonify({"error": "Not found"}), 404
        
    c = doc.to_dict()
    
    if c.get('worker_id') not in [user['uid'], user.get('email')]:
        return jsonify({"error": "Forbidden"}), 403
        
    if c.get('assignment_state') not in ['accepted', 'in_progress']:
        return jsonify({"error": "Work must be accepted or in progress to request an extension"}), 400
        
    extensions = c.get('extensions', [])
    # Check if there is already a pending extension
    if any(ext.get('status') == 'pending' for ext in extensions):
        return jsonify({"error": "You already have a pending extension request"}), 400
        
    new_extension = {
        'id': f"EXT-{int(datetime.utcnow().timestamp())}",
        'requested_by': user['uid'],
        'reason': reason,
        'requested_days': requested_days,
        'old_deadline': c.get('expected_completion_deadline'),
        'requested_at': datetime.utcnow().isoformat(),
        'status': 'pending'
    }
    
    event = add_complaint_history('EXTENSION_REQUESTED', user, c.get('status'), c.get('status'), f"Worker requested {requested_days} days extension. Reason: {reason}", worker_uid=user['uid'])
    
    doc_ref.update({
        'extensions': firestore.ArrayUnion([new_extension]),
        'history': firestore.ArrayUnion([event])
    })
    
    return jsonify({"message": "Extension requested successfully"}), 200

@api.route('/admin/complaints/<complaint_id>/extension/<extension_id>', methods=['PATCH'])
@require_roles(['city_admin', 'main_authority', 'department_head'])
def admin_handle_extension(complaint_id, extension_id):
    user = get_current_user()
    data = request.json or {}
    action = data.get('action') # 'approve' or 'reject'
    admin_notes = data.get('admin_notes', '')
    
    if action not in ['approve', 'reject']:
        return jsonify({"error": "Invalid action"}), 400
        
    if action == 'reject' and not admin_notes.strip():
        return jsonify({"error": "Admin notes are required when rejecting an extension"}), 400
        
    if db is None:
        return jsonify({"error": "Firestore not configured"}), 500
        
    doc_ref = db.collection('complaints').document(complaint_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        return jsonify({"error": "Not found"}), 404
        
    c = doc.to_dict()
    
    # Strict Scoping Check
    if user.get('role') == 'department_head':
        if not user.get('department_id') or c.get('department') != user.get('department_id'):
            return jsonify({"error": "Forbidden: Department mismatch"}), 403
            
    extensions = c.get('extensions', [])
    
    ext_idx = next((i for i, ext in enumerate(extensions) if ext.get('id') == extension_id), None)
    if ext_idx is None:
        return jsonify({"error": "Extension request not found"}), 404
        
    if extensions[ext_idx].get('status') != 'pending':
        return jsonify({"error": "Extension request is not pending"}), 400
        
    extensions[ext_idx]['status'] = 'approved' if action == 'approve' else 'rejected'
    extensions[ext_idx]['handled_by'] = user['uid']
    extensions[ext_idx]['handled_at'] = datetime.utcnow().isoformat()
    extensions[ext_idx]['admin_notes'] = admin_notes
    
    updates = {'extensions': extensions}
    events = []
    
    if action == 'approve':
        # Extend the expected_completion_deadline
        current_deadline = c.get('expected_completion_deadline')
        if current_deadline:
            try:
                dt = datetime.fromisoformat(current_deadline)
                from datetime import timedelta
                new_dt = dt + timedelta(days=extensions[ext_idx]['requested_days'])
                updates['expected_completion_deadline'] = new_dt.isoformat()
            except Exception:
                pass
                
        events.append(add_complaint_history('EXTENSION_APPROVED', user, c.get('status'), c.get('status'), f"Approved {extensions[ext_idx]['requested_days']} days. Notes: {admin_notes}"))
    else:
        events.append(add_complaint_history('EXTENSION_REJECTED', user, c.get('status'), c.get('status'), f"Rejected extension. Notes: {admin_notes}"))
        
    updates['history'] = firestore.ArrayUnion(events)
    doc_ref.update(updates)
    
    return jsonify({"message": f"Extension {action}d successfully"}), 200

@api.route('/worker/complaints/<complaint_id>/false_report', methods=['POST'])
@require_roles(['service_worker'])
def worker_false_report(complaint_id):
    user = get_current_user()
    data = request.json or {}
    reason = data.get('reason')
    
    if not reason:
        return jsonify({"error": "Reason is required for marking a false report"}), 400
        
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
        return jsonify({"error": "Complaint must be assigned before marking as false report"}), 400
        
    citizen_id = c.get('citizen_id')
    
    event = add_complaint_history('FALSE_REPORT', user, c.get('status'), 'false_report', f"Reason: {reason}", worker_uid=user['uid'])
    
    # Update Complaint Status
    doc_ref.update({
        'status': 'false_report',
        'false_report_reason': reason,
        'false_report_by': user['uid'],
        'false_reported_at': datetime.utcnow().isoformat(),
        'updated_at': datetime.utcnow().isoformat(),
        'history': firestore.ArrayUnion([event])
    })
    
    # Increment Citizen false_report_count
    if citizen_id:
        citizen_ref = db.collection('users').document(citizen_id)
        # Using a transaction or increment is safest, but we can use firestore.Increment(1)
        citizen_ref.update({
            'false_report_count': firestore.Increment(1)
        })
        
    return jsonify({"message": "False report marked successfully"}), 200

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
        
    user = get_current_user()
    event = add_complaint_history('CITIZEN_CONFIRMED', user, c.get('status'), 'closed', 'Citizen confirmed work', worker_uid=c.get('worker_id'))
    
    doc_ref.update({
        'status': 'closed',
        'closed_at': datetime.utcnow().isoformat(),
        'updated_at': datetime.utcnow().isoformat(),
        'history': firestore.ArrayUnion([event])
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
        
    previous_proofs = c.get('previous_proofs', [])
    if c.get('proof_image_url'):
        previous_proofs.append({
            'url': c.get('proof_image_url'),
            'worker_id': c.get('worker_id'),
            'completed_at': c.get('completed_at'),
            'rejected_at': datetime.utcnow().isoformat()
        })
        
    reopen_count = c.get('reopen_count', 0) + 1
    user = get_current_user()
    
    updates = {
        'previous_proofs': previous_proofs,
        'proof_image_url': firestore.DELETE_FIELD,
        'updated_at': datetime.utcnow().isoformat(),
        'reopen_count': reopen_count
    }
    
    if c.get('worker_id'):
        updates['rejected_workers'] = firestore.ArrayUnion([c.get('worker_id')])
        
    events = [
        add_complaint_history('PROOF_REJECTED', user, 'completed', 'completed', 'Citizen rejected proof', c.get('worker_id'))
    ]
    
    if reopen_count >= 3:
        updates['status'] = 'escalated'
        updates['escalated_at'] = datetime.utcnow().isoformat()
        events.append(add_complaint_history('ESCALATED', user, 'completed', 'escalated', '3rd reopen limit reached'))
    else:
        updates['status'] = 'reopened'
        updates['reopened_at'] = datetime.utcnow().isoformat()
        events.append(add_complaint_history('REOPENED', user, 'completed', 'reopened'))
        
    updates['history'] = firestore.ArrayUnion(events)
        
    doc_ref.update(updates)
    
    return jsonify({"message": "Complaint reopened successfully"}), 200

@api.route('/complaints/<complaint_id>/escalate', methods=['POST'])
@require_roles(['citizen', 'service_worker', 'department_head', 'city_admin', 'main_authority'])
def escalate_complaint(complaint_id):
    user = get_current_user()
    data = request.json or {}
    reason = data.get('reason')
    
    if not reason:
        return jsonify({"error": "Reason is required for escalation"}), 400
        
    if db is None:
        return jsonify({"error": "Firestore not configured"}), 500
        
    doc_ref = db.collection('complaints').document(complaint_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        return jsonify({"error": "Not found"}), 404
        
    c = doc.to_dict()
    
    if user['role'] == 'citizen' and c.get('citizen_id') != user['uid']:
        return jsonify({"error": "Forbidden"}), 403
        
    if user['role'] == 'service_worker' and c.get('worker_id') != user['uid']:
        return jsonify({"error": "Forbidden: Cannot escalate a complaint you are not assigned to"}), 403
        
    if c.get('escalation_requested'):
        return jsonify({"error": "Complaint is already escalated"}), 400
        
    target_authority = 'department_head'
    if user['role'] in ['citizen', 'service_worker']:
        target_authority = 'department_head'
    elif user['role'] == 'department_head':
        target_authority = 'city_admin'
    elif user['role'] in ['city_admin', 'main_authority']:
        target_authority = 'main_authority'
        
    event = add_complaint_history('ESCALATED', user, c.get('status'), c.get('status'), f"Manual escalation. Reason: {reason}")
    
    escalation_record = {
        'id': f"ESC-{int(datetime.utcnow().timestamp())}",
        'reason': reason,
        'escalated_by': user['uid'],
        'requester_name': user.get('name', 'Unknown'),
        'requester_role': user['role'],
        'target_authority': target_authority,
        'escalated_at': datetime.utcnow().isoformat(),
        'status': 'pending'
    }
    
    doc_ref.update({
        'escalation_requested': True,
        'escalated_at': datetime.utcnow().isoformat(),
        'escalations': firestore.ArrayUnion([escalation_record]),
        'history': firestore.ArrayUnion([event])
    })
    
    return jsonify({"message": "Complaint escalated successfully"}), 200

@api.route('/admin/complaints/<complaint_id>/escalation/<escalation_id>', methods=['PATCH'])
@require_roles(['city_admin', 'main_authority', 'department_head'])
def admin_handle_escalation(complaint_id, escalation_id):
    user = get_current_user()
    data = request.json or {}
    decision = data.get('decision')
    remarks = data.get('remarks', '')
    
    if not decision or not remarks.strip():
        return jsonify({"error": "Decision and remarks are strictly required to resolve an escalation."}), 400
        
    if db is None:
        return jsonify({"error": "Firestore not configured"}), 500
        
    doc_ref = db.collection('complaints').document(complaint_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        return jsonify({"error": "Not found"}), 404
        
    c = doc.to_dict()
    escalations = c.get('escalations', [])
    
    esc_idx = next((i for i, esc in enumerate(escalations) if esc.get('id') == escalation_id), None)
    if esc_idx is None:
        return jsonify({"error": "Escalation request not found"}), 404
        
    target_authority = escalations[esc_idx].get('target_authority')
    
    # Check if the user is authorized to handle this escalation
    if user['role'] == 'department_head':
        if target_authority != 'department_head' or c.get('department') != user.get('department_id'):
            return jsonify({"error": "Forbidden: You are not authorized to handle this escalation."}), 403
    elif user['role'] == 'city_admin':
        if target_authority not in ['department_head', 'city_admin']:
            return jsonify({"error": "Forbidden: This escalation requires main authority."}), 403
            
    if escalations[esc_idx].get('status') != 'pending':
        return jsonify({"error": "Escalation request is not pending"}), 400
        
    escalations[esc_idx]['status'] = 'resolved'
    escalations[esc_idx]['decision'] = decision
    escalations[esc_idx]['remarks'] = remarks
    escalations[esc_idx]['decision_maker'] = user['uid']
    escalations[esc_idx]['decision_maker_role'] = user['role']
    escalations[esc_idx]['decision_timestamp'] = datetime.utcnow().isoformat()
    
    # Check if there are any other pending escalations
    any_pending = any(e.get('status') == 'pending' for e in escalations)
    
    event = add_complaint_history('ESCALATION_RESOLVED', user, c.get('status'), c.get('status'), f"Escalation resolved: {decision}. Remarks: {remarks}")
    
    doc_ref.update({
        'escalations': escalations,
        'escalation_requested': any_pending,
        'history': firestore.ArrayUnion([event])
    })
    
    return jsonify({"message": "Escalation resolved successfully"}), 200

@api.route('/admin/warnings', methods=['GET'])
@require_roles(['city_admin', 'main_authority', 'department_head'])
def admin_warnings():
    user = get_current_user()
    
    if db is None:
        return jsonify([]), 200
        
    # We define warnings as complaints that are either escalated OR have a missed expected_completion_deadline
    # Because Firestore lacks complex OR queries without composite indexes, we will query all unresolved assigned tasks and filter in-memory.
    # In production, we'd use a dedicated indexed field like `requires_attention` = true.
    
    query = db.collection('complaints').where('status', 'in', ['assigned'])
    if user['role'] == 'department_head':
        query = query.where('department', '==', user.get('department_id', ''))
        
    docs = query.stream()
    warnings = []
    
    now = datetime.utcnow()
    for doc in docs:
        c = doc.to_dict()
        c['id'] = doc.id
        
        is_overdue = False
        deadline = c.get('expected_completion_deadline')
        if deadline:
            try:
                dt = datetime.fromisoformat(deadline)
                if now > dt:
                    is_overdue = True
            except Exception:
                pass
                
        if is_overdue and c.get('status') != 'completed':
            c['is_overdue'] = True
            
        has_relevant_escalation = False
        if c.get('escalation_requested'):
            escalations = c.get('escalations', [])
            for esc in escalations:
                if esc.get('status') == 'pending':
                    target = esc.get('target_authority')
                    if user['role'] == 'main_authority':
                        has_relevant_escalation = True
                    elif user['role'] == 'city_admin' and target in ['city_admin', 'department_head']:
                        has_relevant_escalation = True
                    elif user['role'] == 'department_head' and target == 'department_head':
                        has_relevant_escalation = True
                        
        if has_relevant_escalation or is_overdue:
            warnings.append(c)
            
    warnings.sort(key=lambda x: x.get('priority_score', 0), reverse=True)
    return jsonify(warnings), 200

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

@api.route('/users', methods=['GET'])
@require_roles(['main_authority', 'city_admin'])
def list_users():
    if db is None:
        return jsonify([]), 200
        
    users_ref = db.collection('users').stream()
    users = []
    for doc in users_ref:
        u = doc.to_dict()
        u['id'] = doc.id
        # Ensure default values are returned for the frontend UI
        if 'account_status' not in u:
            u['account_status'] = 'active'
        if 'false_report_count' not in u:
            u['false_report_count'] = 0
        users.append(u)
        
    return jsonify(users), 200

@api.route('/admin/workers/<target_uid>/performance', methods=['GET'])
@require_roles(['main_authority', 'city_admin', 'department_head'])
def get_worker_performance(target_uid):
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
        
    if db is None:
        return jsonify({"error": "Firestore not configured"}), 500
        
    # Department heads can only see performance of their own department's workers
    if user.get('role') == 'department_head':
        worker_doc = db.collection('users').document(target_uid).get()
        if not worker_doc.exists or worker_doc.to_dict().get('department_id') != user.get('department_id'):
            return jsonify({"error": "Forbidden: Cannot view workers from other departments"}), 403

    complaints_ref = db.collection('complaints').where('assigned_workers', 'array_contains', target_uid).stream()
    
    total_assigned = 0
    successfully_completed = 0
    citizen_confirmed = 0
    reopened = 0
    extensions_requested = 0
    total_time_seconds = 0
    completed_with_time = 0
    
    for doc in complaints_ref:
        c = doc.to_dict()
        
        # We must attribute events strictly to this worker, not globally to the complaint.
        # A worker was assigned if they are in assigned_workers. We already know they are from the query.
        total_assigned += 1
        
        history = c.get('history', [])
        
        # Count citizen confirmations for this worker's submitted proofs
        # We look for PROOF_SUBMITTED by this worker, and see if it was followed by a CITIZEN_CONFIRMED.
        # However, an easier way is to just look for the PROOF_REJECTED / RESOLVED / COMPLETED events 
        # that specifically list this worker's ID (which we added in `add_complaint_history` as `worker_uid` or via `c.get('worker_id')`).
        
        # Let's count extensions requested by this worker:
        extensions = c.get('extensions', [])
        extensions_requested += sum(1 for ext in extensions if ext.get('requested_by') == target_uid)
        
        # Check if the worker successfully completed it (meaning they were the ones who submitted the proof that got accepted)
        # We can see if the last worker_id on the complaint is them, and it is completed.
        # Or look through history for PROOF_SUBMITTED by them.
        worker_submitted_proof = any(e.get('action') == 'PROOF_SUBMITTED' and e.get('actor_uid') == target_uid for e in history)
        if worker_submitted_proof:
            if c.get('status') in ['completed', 'resolved', 'closed']:
                # They submitted a proof and it wasn't just rejected (or if it was, they resubmitted and it finished).
                # Actually, a better proxy for "they completed it" is if they are the current worker_id and status is completed.
                if c.get('worker_id') == target_uid:
                    successfully_completed += 1
                    if c.get('status') in ['resolved', 'closed']:
                        citizen_confirmed += 1
                    
                    if c.get('assigned_at') and c.get('completed_at'):
                        try:
                            assigned_dt = datetime.fromisoformat(c.get('assigned_at'))
                            completed_dt = datetime.fromisoformat(c.get('completed_at'))
                            diff = (completed_dt - assigned_dt).total_seconds()
                            if diff > 0:
                                total_time_seconds += diff
                                completed_with_time += 1
                        except Exception:
                            pass
        
        for event in history:
            if event.get('action') == 'PROOF_REJECTED' and event.get('worker_uid') == target_uid:
                reopened += 1
                
    avg_time_hours = (total_time_seconds / completed_with_time / 3600) if completed_with_time > 0 else 0
                
    return jsonify({
        "total_assigned": total_assigned,
        "successfully_completed": successfully_completed,
        "citizen_confirmed": citizen_confirmed,
        "reopened_from_rejection": reopened,
        "extensions_requested": extensions_requested,
        "avg_time_hours": round(avg_time_hours, 1)
    }), 200

@api.route('/admin/users/<target_uid>/ban', methods=['POST'])
@require_roles(['main_authority', 'city_admin'])
def ban_user(target_uid):
    admin_user = get_current_user()
    
    if target_uid == admin_user['uid']:
        return jsonify({"error": "You cannot ban yourself"}), 400
        
    if db is None:
        return jsonify({"error": "Firestore not configured"}), 500
        
    target_ref = db.collection('users').document(target_uid)
    target_doc = target_ref.get()
    
    if not target_doc.exists:
        return jsonify({"error": "Target user not found"}), 404
        
    target_data = target_doc.to_dict()
    target_role = target_data.get('role', 'citizen')
    
    # Hierarchy check
    if target_role == 'main_authority':
        return jsonify({"error": "Forbidden: Cannot ban a Main Authority"}), 403
    if admin_user.get('role') == 'city_admin' and target_role in ['main_authority', 'city_admin']:
        return jsonify({"error": "Forbidden: Cannot ban peers or superiors"}), 403
        
    target_ref.update({'account_status': 'banned'})
    
    # Audit History
    db.collection('admin_actions').add({
        'action': 'BAN',
        'target_uid': target_uid,
        'target_email': target_data.get('email'),
        'admin_uid': admin_user['uid'],
        'admin_role': admin_user.get('role'),
        'timestamp': datetime.utcnow().isoformat()
    })
    
    return jsonify({"message": "User banned successfully"}), 200

@api.route('/admin/users/<target_uid>/unban', methods=['POST'])
@require_roles(['main_authority', 'city_admin'])
def unban_user(target_uid):
    admin_user = get_current_user()
    
    if db is None:
        return jsonify({"error": "Firestore not configured"}), 500
        
    target_ref = db.collection('users').document(target_uid)
    target_doc = target_ref.get()
    
    if not target_doc.exists:
        return jsonify({"error": "Target user not found"}), 404
        
    target_data = target_doc.to_dict()
    
    target_ref.update({'account_status': 'active'})
    
    # Audit History
    db.collection('admin_actions').add({
        'action': 'UNBAN',
        'target_uid': target_uid,
        'target_email': target_data.get('email'),
        'admin_uid': admin_user['uid'],
        'admin_role': admin_user.get('role'),
        'timestamp': datetime.utcnow().isoformat()
    })
    
    return jsonify({"message": "User unbanned successfully"}), 200

@api.route('/users/<target_uid>/role', methods=['POST'])
@require_roles(['main_authority', 'city_admin'])
def update_user_role(target_uid):
    data = request.json
    new_role = data.get('role')
    new_dept = data.get('department_id')
    
    current_user = get_current_user()
    current_uid = current_user.get('uid')
    current_role = current_user.get('role')
    
    if not new_role:
        return jsonify({"error": "Role is required"}), 400
        
    valid_roles = ['main_authority', 'city_admin', 'department_head', 'service_worker', 'citizen']
    if new_role not in valid_roles:
        return jsonify({"error": "Invalid role"}), 400
        
    if current_uid == target_uid:
        return jsonify({"error": "You cannot modify your own role"}), 403
        
    if db is None:
        return jsonify({"error": "Firestore not configured"}), 500
        
    # City Admins cannot grant or manage main_authority
    if current_role == 'city_admin' and new_role == 'main_authority':
        return jsonify({"error": "City Admin cannot grant Main Authority"}), 403
        
    target_ref = db.collection('users').document(target_uid)
    target_doc = target_ref.get()
    
    if not target_doc.exists:
        return jsonify({"error": "User not found"}), 404
        
    target_data = target_doc.to_dict()
    
    # City Admin cannot modify an existing Main Authority
    if current_role == 'city_admin' and target_data.get('role') == 'main_authority':
        return jsonify({"error": "City Admin cannot modify a Main Authority"}), 403
        
    # Prevent removing the last Main Authority
    if target_data.get('role') == 'main_authority' and new_role != 'main_authority':
        ma_count = len(list(db.collection('users').where('role', '==', 'main_authority').stream()))
        if ma_count <= 1:
            return jsonify({"error": "Cannot demote the last remaining Main Authority"}), 400
            
    # Department validation
    if new_role in ['department_head', 'service_worker'] and not new_dept:
        return jsonify({"error": f"department_id is required for {new_role}"}), 400
    if new_role == 'citizen':
        new_dept = None
        
    target_ref.update({
        'role': new_role,
        'department_id': new_dept
    })
    
    # Audit log
    db.collection('admin_actions').add({
        "action": "role_changed",
        "admin_uid": current_uid,
        "target_uid": target_uid,
        "old_role": target_data.get('role'),
        "new_role": new_role,
        "department_id": new_dept,
        "timestamp": datetime.utcnow().isoformat()
    })
    
    return jsonify({"message": "User role updated successfully"}), 200
