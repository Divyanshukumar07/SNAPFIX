document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || !firebase.apps.length) return;
    const auth = firebase.auth();
    
    let currentFilter = '';
    
    auth.onAuthStateChanged(async user => {
        if (user) {
            try {
                const tokenResult = await user.getIdTokenResult();
                const role = tokenResult.claims.role || 'unknown';
                const header = document.querySelector('.dashboard-header h2');
                if (header) {
                    if (role === 'main_authority') header.innerText = 'Main Authority Dashboard';
                    else if (role === 'city_admin') header.innerText = 'City Admin Dashboard';
                    else if (role === 'department_head') header.innerText = 'Department Head Dashboard';
                }
            } catch (err) {
                console.error('Error fetching claims', err);
            }
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

    window.rejectComplaintAdmin = async function(complaintId) {
        const reason = prompt("Enter reason for rejection (e.g., spam, invalid):");
        if (reason === null) return;
        
        const user = auth.currentUser;
        if (!user) return;
        
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/admin/complaints/${complaintId}/reject`, {
                method: 'POST',
                headers: { 
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ reason: reason || 'No reason provided' })
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || "Failed to reject complaint");
            
            alert("Complaint rejected.");
            loadAdminComplaints(user, currentFilter);
        } catch(err) {
            alert(err.message);
        }
    };

    window.assignWorker = async function(complaintId, workerId = null, force = false) {
        if (!workerId) {
            workerId = prompt("Enter Worker Email or ID to assign:");
            if (!workerId) return;
        }

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
                body: JSON.stringify({ worker_id: workerId, force: force })
            });
            const data = await res.json();
            
            if (data.warning) {
                if (confirm(data.message)) {
                    return assignWorker(complaintId, workerId, true);
                } else {
                    return;
                }
            }
            
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
                    actionHtml = `
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn btn-primary btn-sm" onclick="verifyComplaint('${c.id}')">Verify Issue</button>
                            <button class="btn btn-secondary btn-sm" style="color: var(--danger-color); border-color: var(--danger-color);" onclick="rejectComplaintAdmin('${c.id}')">Reject</button>
                        </div>
                    `;
                } else if (c.status === 'verified' || c.status === 'reopened' || c.status === 'escalated') {
                    let statusText = '';
                    if (c.status === 'escalated') statusText = '<span style="color: #dc2626; font-weight: bold; margin-right: 1rem;">Escalated 🚨</span>';
                    else if (c.status === 'reopened') statusText = '<span style="color: #d97706; font-weight: bold; margin-right: 1rem;">Reopened ↻</span>';
                    else statusText = '<span style="color: green; font-weight: bold; margin-right: 1rem;">Verified ✓</span>';
                    
                    actionHtml = `
                        ${statusText}
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
                                ${c.priority_breakdown ? `
                                <details style="margin-top: 5px;">
                                    <summary style="cursor: pointer; color: #0369a1; text-decoration: underline;">Priority Breakdown</summary>
                                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px; border-radius: 4px; margin-top: 4px; font-family: monospace;">
                                        Severity: +${c.priority_breakdown.severity}<br>
                                        Evidence: +${c.priority_breakdown.evidence}<br>
                                        Support : +${c.priority_breakdown.support}<br>
                                        Age     : +${c.priority_breakdown.age}<br>
                                        Reopens : +${c.priority_breakdown.reopens}<br>
                                        <hr style="margin: 4px 0;">
                                        Total   : ${c.priority_breakdown.total}
                                    </div>
                                </details>
                                ` : ''}
                            </div>
                            <div>
                                ${actionHtml}
                            </div>
                        </div>
                        
                        ${c.history && c.history.length > 0 ? `
                        <details style="margin-top: 1rem; border-top: 1px dashed #cbd5e1; padding-top: 1rem;">
                            <summary style="cursor: pointer; font-weight: bold; color: #475569;">Activity Timeline (${c.history.length})</summary>
                            <div style="margin-top: 0.5rem; padding-left: 1rem; border-left: 2px solid #e2e8f0;">
                                ${c.history.map(h => `
                                    <div style="margin-bottom: 0.8rem; position: relative;">
                                        <div style="position: absolute; left: -1.4rem; top: 0.2rem; width: 0.6rem; height: 0.6rem; background: var(--primary-color); border-radius: 50%;"></div>
                                        <div style="font-size: 0.8rem; color: #64748b;">${new Date(h.timestamp).toLocaleString()}</div>
                                        <div style="font-weight: bold; font-size: 0.9rem;">${h.action.replace('_', ' ')}</div>
                                        <div style="font-size: 0.85rem;">By: ${h.actor_role.replace('_', ' ')} ${h.actor_email ? '(' + h.actor_email + ')' : ''}</div>
                                        ${h.details ? `<div style="font-size: 0.85rem; color: #475569; margin-top: 2px;"><i>${h.details}</i></div>` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </details>
                        ` : ''}
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
