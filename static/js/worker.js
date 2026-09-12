document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || !firebase.apps.length) return;
    const auth = firebase.auth();
    // Removed firebase.storage() for Cloudinary backend migration
    
    auth.onAuthStateChanged(user => {
        if (user) {
            loadWorkerComplaints(user);
        } else {
            window.location.href = '/login';
        }
    });

    window.uploadProof = async function(complaintId) {
        const fileInput = document.getElementById(`proof-file-${complaintId}`);
        const file = fileInput.files[0];
        if (!file) {
            if (window.SnapFixToast) window.SnapFixToast.show("Please select a photo of the completed work.", "warning");
            return;
        }

        const user = auth.currentUser;
        if (!user) return;
        
        try {
            const btn = document.getElementById(`btn-proof-${complaintId}`);
            btn.disabled = true;
            btn.innerText = "Uploading...";

            const token = await user.getIdToken();
            
            // Upload to Cloudinary backend
            const formData = new FormData();
            formData.append('image', file);
            formData.append('folder', `smart-city/proofs/${complaintId}`);
            
            const uploadRes = await fetch('/api/upload_image', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + token
                },
                body: formData
            });
            
            const uploadData = await uploadRes.json();
            if (!uploadRes.ok) {
                throw new Error(uploadData.error || "Failed to upload proof securely.");
            }
            
            const imageUrl = uploadData.url;

            // Submit to API
            const res = await fetch(`/api/worker/complaints/${complaintId}/proof`, {
                method: 'POST',
                headers: { 
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ proof_url: imageUrl })
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || "Failed to submit proof");
            
            if (window.SnapFixToast) window.SnapFixToast.show("Proof uploaded successfully! Complaint is now awaiting citizen confirmation.", "success");
            loadWorkerComplaints(user);
        } catch(err) {
            if (window.SnapFixToast) window.SnapFixToast.show(err.message, "error");
            const btn = document.getElementById(`btn-proof-${complaintId}`);
            if (btn) {
                btn.disabled = false;
                btn.innerText = "Submit Proof";
            }
        }
    };

    window.markFalseReport = async function(complaintId) {
        if (!window.SnapFixModal) return;
        
        const confirmed = await window.SnapFixModal.confirm(
            "Mark as False Report",
            "Are you sure you want to mark this as a False Report? This will be recorded against the citizen.",
            "Yes, Mark False",
            true
        );
        if (!confirmed) return;
        
        const reason = await window.SnapFixModal.prompt(
            "False Report Reason",
            "Enter reason for marking as False Report (e.g. 'Issue not found'):",
            "Enter reason..."
        );
        
        if (!reason || reason.trim() === '') return;

        const user = auth.currentUser;
        if (!user) return;
        
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/worker/complaints/${complaintId}/false_report`, {
                method: 'POST',
                headers: { 
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ reason: reason })
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || "Failed to mark false report");
            
            if (window.SnapFixToast) window.SnapFixToast.show("Complaint marked as False Report successfully.", "success");
            loadWorkerComplaints(user);
        } catch(err) {
            if (window.SnapFixToast) window.SnapFixToast.show(err.message, "error");
        }
    };

    async function loadWorkerComplaints(user) {
        const listEl = document.getElementById('worker-complaints-list');
        const errEl = document.getElementById('worker-error');
        if (!listEl) return;

        listEl.innerHTML = '<p class="text-muted">Loading assigned complaints...</p>';
        errEl.style.display = 'none';

        try {
            const token = await user.getIdToken();
            // Pass email to API so it can check worker_id == user.email
            const url = `/api/worker/complaints?email=${encodeURIComponent(user.email)}`;
            
            const response = await fetch(url, {
                headers: { 'Authorization': 'Bearer ' + token }
            });

            if (!response.ok) throw new Error("Failed to fetch worker complaints");

            const complaints = await response.json();

            if (complaints.length === 0) {
                listEl.innerHTML = `<p class="text-muted" style="padding: 2rem 0;">You have no assigned complaints at this time.</p>`;
                return;
            }

            let html = '<div style="display: flex; flex-direction: column; gap: 1rem;">';
            complaints.forEach(c => {
                let actionHtml = '';
                if (c.status === 'completed') {
                    actionHtml = `<div style="margin-top:1rem;"><span style="color: green; font-weight: bold;">Work Completed ✓</span></div>`;
                } else if (c.assignment_state === 'pending') {
                    actionHtml = `
                        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px dashed #ccc; background: #fffbeb; padding: 1rem; border-radius: 8px;">
                            <label style="display:block; margin-bottom: 0.5rem; font-weight:bold; color: #b45309;">New Assignment Pending</label>
                            <p style="font-size: 0.9rem; margin-bottom: 1rem; color: #78350f;">You have been assigned this complaint. Do you accept?</p>
                            <div style="display: flex; gap: 1rem;">
                                <button class="btn btn-primary btn-sm" onclick="acceptAssignment('${c.id}')">Accept Assignment</button>
                                <button class="btn btn-danger btn-sm" onclick="rejectAssignment('${c.id}')">Reject</button>
                            </div>
                        </div>
                    `;
                } else if (c.status === 'assigned' && c.assignment_state === 'accepted') {
                    actionHtml = `
                        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px dashed #ccc;">
                            <p style="font-size: 0.9rem; margin-bottom: 0.5rem; color: #475569;">You have accepted this task. Ready to start?</p>
                            <button class="btn btn-primary btn-sm" onclick="startWork('${c.id}')">Start Work</button>
                        </div>
                    `;
                } else if (c.status === 'assigned' && c.assignment_state === 'in_progress') {
                    actionHtml = `
                        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px dashed #ccc;">
                            <label style="display:block; margin-bottom: 0.5rem; font-weight:bold;">Upload Proof of Completion</label>
                            <input type="file" id="proof-file-${c.id}" accept="image/png, image/jpeg" style="margin-bottom: 0.5rem;">
                            <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                                <button id="btn-proof-${c.id}" class="btn btn-primary btn-sm" onclick="uploadProof('${c.id}')">Submit Proof</button>
                                <button class="btn btn-secondary btn-sm" onclick="requestExtension('${c.id}')">Request Extension</button>
                                <button class="btn btn-danger btn-sm" onclick="markFalseReport('${c.id}')">Mark False Report</button>
                            </div>
                        </div>
                    `;
                } else {
                    actionHtml = `<div style="margin-top:1rem;"><span style="color: #666; font-weight: bold;">Status: ${c.status.toUpperCase()} (${c.assignment_state || 'assigned'})</span></div>`;
                }
                
                if (c.proof_image_url) {
                    actionHtml += `<div style="margin-top: 0.5rem;"><a href="${c.proof_image_url}" target="_blank" style="font-size:0.9rem; color: var(--primary-color);">View Uploaded Proof</a></div>`;
                }
                
                html += `
                    <div class="card" style="padding: 1.5rem; border-left: 4px solid #f59e0b;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <span style="font-size: 0.8rem; font-weight: bold; color: var(--text-muted);">${c.report_id || 'ID: ' + c.id.substring(0,8)}</span>
                                <h4 style="margin-top: 0.2rem; margin-bottom: 0;">${c.category}</h4>
                            </div>
                            <span style="font-size:0.85rem; font-weight:bold; padding: 4px 8px; border-radius: 4px; background: #eee;">${c.status.toUpperCase()}</span>
                        </div>
                        <p style="margin: 0.5rem 0;">${c.description}</p>
                        <p class="text-muted" style="font-size: 0.9rem; margin-bottom: 0.5rem;">📍 ${c.location_text}</p>
                        ${c.image_url ? `<p><a href="${c.image_url}" target="_blank" style="color: var(--primary-color); text-decoration: underline; font-size: 0.9rem;">View Issue Photo 📸</a></p>` : ''}
                        
                        ${actionHtml}
                    </div>
                `;
            });
            html += '</div>';
            listEl.innerHTML = html;

        } catch (error) {
            console.error("Worker Dashboard error:", error);
            errEl.innerText = error.message;
            errEl.style.display = 'block';
            listEl.innerHTML = '';
        }
    }
});

async function acceptAssignment(complaintId) {
    if (!firebase.auth().currentUser) return;
    try {
        const token = await firebase.auth().currentUser.getIdToken();
        const res = await fetch(`/api/worker/complaints/${complaintId}/assignment`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action: 'accept' })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to accept assignment');
        
        if (window.SnapFixToast) window.SnapFixToast.show("Assignment accepted!", "success");
        setTimeout(() => location.reload(), 1000);
    } catch (error) {
        if (window.SnapFixToast) window.SnapFixToast.show(error.message, "error");
    }
}
async function startWork(complaintId) {
    if (!firebase.auth().currentUser) return;
    try {
        const token = await firebase.auth().currentUser.getIdToken();
        const res = await fetch(`/api/worker/complaints/${complaintId}/assignment`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action: 'start' })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to start work');
        
        if (window.SnapFixToast) window.SnapFixToast.show("Work started!", "success");
        setTimeout(() => location.reload(), 1000);
    } catch (error) {
        if (window.SnapFixToast) window.SnapFixToast.show(error.message, "error");
    }
}

async function requestExtension(complaintId) {
    if (!firebase.auth().currentUser) return;
    try {
        if (!window.SnapFixModal) return;
        
        const daysStr = await window.SnapFixModal.prompt(
            "Request Extension",
            "How many extra days do you need?",
            "e.g. 2"
        );
        if (daysStr === null) return;
        const requested_days = parseInt(daysStr, 10);
        if (isNaN(requested_days) || requested_days <= 0) {
            if (window.SnapFixToast) window.SnapFixToast.show("Please enter a valid number of days", "error");
            return;
        }
        
        const reason = await window.SnapFixModal.prompt(
            "Request Extension",
            "Why do you need an extension?",
            "Reason..."
        );
        if (reason === null) return;
        if (!reason.trim()) {
            if (window.SnapFixToast) window.SnapFixToast.show("Reason is required", "error");
            return;
        }
        
        const token = await firebase.auth().currentUser.getIdToken();
        const res = await fetch(`/api/worker/complaints/${complaintId}/extension`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason: reason.trim(), requested_days: requested_days })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to request extension');
        
        if (window.SnapFixToast) window.SnapFixToast.show("Extension requested successfully!", "success");
    } catch (error) {
        if (window.SnapFixToast) window.SnapFixToast.show(error.message, "error");
    }
}
async function rejectAssignment(complaintId) {
    if (!firebase.auth().currentUser) return;
    try {
        const reason = await window.SnapFixModal.prompt(
            "Reject Assignment",
            "Please provide a reason for rejecting this assignment:"
        );
        
        if (reason === null) return; // cancelled
        if (!reason.trim()) {
            if (window.SnapFixToast) window.SnapFixToast.show("Reason is required.", "error");
            return;
        }

        const token = await firebase.auth().currentUser.getIdToken();
        const res = await fetch(`/api/worker/complaints/${complaintId}/assignment`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action: 'reject', reason: reason.trim() })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to reject assignment');
        
        if (window.SnapFixToast) window.SnapFixToast.show("Assignment rejected.", "success");
        setTimeout(() => location.reload(), 1000);
    } catch (error) {
        if (window.SnapFixToast) window.SnapFixToast.show(error.message, "error");
    }
}
