document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || !firebase.apps.length) return;
    const auth = firebase.auth();
    
    let currentFilter = '';
    
    auth.onAuthStateChanged(user => {
        if (user) {
            loadAdminStats(user);
            loadAdminComplaints(user, currentFilter);
        } else {
            window.location.href = '/login';
        }
    });
    
    window.filterComplaints = function(status) {
        currentFilter = status;
        const user = auth.currentUser;
        if (user) loadAdminComplaints(user, currentFilter);
    };

    window.verifyComplaint = async function(complaintId) {
        const user = auth.currentUser;
        if (!user) return;
        
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/admin/complaints/${complaintId}/verify`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token }
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || "Failed to verify complaint");
            
            alert("Complaint verified successfully!");
            loadAdminComplaints(user, currentFilter);
        } catch(err) {
            alert(err.message);
        }
    };

    window.assignWorker = async function(complaintId) {
        const workerId = prompt("Enter Worker Email or ID to assign:");
        if (!workerId) return;

        const user = auth.currentUser;
        if (!user) return;
        
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/admin/complaints/${complaintId}/assign`, {
                method: 'POST',
                headers: { 
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ worker_id: workerId })
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || "Failed to assign complaint");
            
            alert("Complaint assigned to worker successfully!");
            loadAdminComplaints(user, currentFilter);
        } catch(err) {
            alert(err.message);
        }
    };

    async function loadAdminComplaints(user, statusFilter = '') {
        const listEl = document.getElementById('admin-complaints-list');
        const errEl = document.getElementById('admin-error');
        if (!listEl) return;

        listEl.innerHTML = '<p class="text-muted">Loading complaints...</p>';
        errEl.style.display = 'none';

        try {
            const token = await user.getIdToken();
            let url = '/api/admin/complaints';
            if (statusFilter) url += '?status=' + statusFilter;
            
            const response = await fetch(url, {
                headers: { 'Authorization': 'Bearer ' + token }
            });

            if (!response.ok) throw new Error("Failed to fetch admin complaints");

            const complaints = await response.json();

            if (complaints.length === 0) {
                listEl.innerHTML = `<p class="text-muted" style="padding: 2rem 0;">No complaints found for this filter.</p>`;
                return;
            }

            let html = '<div style="display: flex; flex-direction: column; gap: 1rem;">';
            complaints.forEach(c => {
                const date = new Date(c.created_at).toLocaleString();
                
                let actionHtml = '';
                if (c.status === 'pending_verification') {
                    actionHtml = `<button class="btn btn-primary btn-sm" onclick="verifyComplaint('${c.id}')">Verify Issue</button>`;
                } else if (c.status === 'verified') {
                    actionHtml = `
                        <span style="color: green; font-weight: bold; margin-right: 1rem;">Verified ✓</span>
                        <button class="btn btn-secondary btn-sm" onclick="assignWorker('${c.id}')">Assign Worker</button>
                    `;
                } else if (c.status === 'assigned') {
                    actionHtml = `<span style="background: #e0e7ff; color: #4338ca; padding: 0.2rem 0.5rem; border-radius: 4px;">Assigned to: ${c.worker_id}</span>`;
                }
                
                const overdueBadge = c.is_overdue ? `<span style="background: #fee2e2; color: #dc2626; padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.8rem; font-weight: bold; margin-left: 0.5rem;">OVERDUE / ESCALATED</span>` : '';
                
                html += `
                    <div class="card" style="padding: 1.5rem; border-left: 4px solid var(--primary-color);">
                        <div style="display: flex; justify-content: space-between;">
                            <h4>${c.category} <span style="font-size:0.8rem; font-weight:normal; background:#eee; padding:2px 6px; border-radius:4px;">${c.department || 'Unassigned'}</span>${overdueBadge}</h4>
                            <span style="font-size:0.85rem; font-weight:bold;">Status: ${c.status.toUpperCase()}</span>
                        </div>
                        <p style="margin: 0.5rem 0;">${c.description}</p>
                        <p class="text-muted" style="font-size: 0.9rem; margin-bottom: 1rem;">📍 ${c.location_text}</p>
                        
                        ${c.image_url ? `<p><a href="${c.image_url}" target="_blank" style="color: var(--primary-color); text-decoration: underline; font-size: 0.9rem;">View Attached Evidence 📸</a></p>` : ''}
                        
                        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 1rem; border-top: 1px solid #eee; padding-top: 1rem;">
                            <div style="font-size: 0.85rem; color: #666;">
                                Priority Score: <strong>${c.priority_score}</strong> | Supporters: <strong>${c.support_count}</strong><br>
                                Reported: ${date}
                            </div>
                            <div>
                                ${actionHtml}
                            </div>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            listEl.innerHTML = html;

        } catch (error) {
            console.error("Admin Dashboard error:", error);
            errEl.innerText = error.message;
            errEl.style.display = 'block';
            listEl.innerHTML = '';
        }
    }

    async function loadAdminStats(user) {
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/admin/stats', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (res.ok) {
                const data = await res.json();
                document.getElementById('stat-total').innerText = data.total !== undefined ? data.total : '-';
                document.getElementById('stat-pending').innerText = data.pending !== undefined ? data.pending : '-';
                document.getElementById('stat-resolved').innerText = data.resolved !== undefined ? data.resolved : '-';
            }
        } catch (e) {
            console.warn("Failed to load admin stats", e);
        }
    }
});
