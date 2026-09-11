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
            alert("Please select a photo of the completed work.");
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
            
            alert("Proof uploaded successfully! Complaint is now awaiting citizen confirmation.");
            loadWorkerComplaints(user);
        } catch(err) {
            alert(err.message);
            const btn = document.getElementById(`btn-proof-${complaintId}`);
            if (btn) {
                btn.disabled = false;
                btn.innerText = "Submit Proof";
            }
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
                if (c.status === 'assigned') {
                    actionHtml = `
                        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px dashed #ccc;">
                            <label style="display:block; margin-bottom: 0.5rem; font-weight:bold;">Upload Proof of Completion</label>
                            <input type="file" id="proof-file-${c.id}" accept="image/png, image/jpeg" style="margin-bottom: 0.5rem;">
                            <button id="btn-proof-${c.id}" class="btn btn-primary btn-sm" onclick="uploadProof('${c.id}')">Submit Proof</button>
                        </div>
                    `;
                } else if (c.status === 'completed') {
                    actionHtml = `<div style="margin-top:1rem;"><span style="color: green; font-weight: bold;">Work Completed ✓</span> <br><a href="${c.proof_image_url}" target="_blank" style="font-size:0.9rem;">View Uploaded Proof</a></div>`;
                } else {
                    actionHtml = `<div style="margin-top:1rem;"><span style="color: #666; font-weight: bold;">Status: ${c.status}</span></div>`;
                }
                
                html += `
                    <div class="card" style="padding: 1.5rem; border-left: 4px solid #f59e0b;">
                        <div style="display: flex; justify-content: space-between;">
                            <h4>${c.category}</h4>
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
