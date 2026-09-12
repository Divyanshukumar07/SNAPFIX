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
            
            if (window.SnapFixToast) window.SnapFixToast.show("Complaint verified successfully!", "success");
            loadAdminComplaints(user, currentFilter);
        } catch(err) {
            if (window.SnapFixToast) window.SnapFixToast.show(err.message, "error");
        }
    };

    window.rejectComplaintAdmin = async function(complaintId) {
        if (!window.SnapFixModal) return;
        const reason = await window.SnapFixModal.prompt(
            "Reject Complaint",
            "Enter reason for rejection (e.g., spam, invalid):",
            "Enter reason..."
        );
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
            
            if (window.SnapFixToast) window.SnapFixToast.show("Complaint rejected.", "success");
            loadAdminComplaints(user, currentFilter);
        } catch(err) {
            if (window.SnapFixToast) window.SnapFixToast.show(err.message, "error");
        }
    };

    window.assignWorker = async function(complaintId, workerId = null, force = false, deadline = null) {
        if (!workerId) {
            if (!window.SnapFixModal) return;
            workerId = await window.SnapFixModal.prompt(
                "Assign Worker",
                "Enter Worker Email or ID to assign:",
                "Worker Email or ID..."
            );
            if (!workerId) return;
            
            let deadlineInput = await window.SnapFixModal.prompt(
                "Set Deadline (Optional)",
                "Enter deadline (YYYY-MM-DD) or leave blank:",
                "YYYY-MM-DD"
            );
            if (deadlineInput && deadlineInput.trim() !== '') {
                try {
                    const d = new Date(deadlineInput);
                    if (isNaN(d)) throw new Error();
                    deadline = d.toISOString();
                } catch(e) {
                    if (window.SnapFixToast) window.SnapFixToast.show("Invalid date format. Proceeding without deadline.", "error");
                    deadline = null;
                }
            }
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
                body: JSON.stringify({ worker_id: workerId, force: force, expected_completion_deadline: deadline })
            });
            const data = await res.json();
            
            if (data.warning) {
                if (!window.SnapFixModal) return;
                const forceAssign = await window.SnapFixModal.confirm(
                    "Worker Warning",
                    data.message,
                    "Assign Anyway"
                );
                if (forceAssign) {
                    return assignWorker(complaintId, workerId, true, deadline);
                } else {
                    return;
                }
            }
            
            if (!res.ok) throw new Error(data.error || "Failed to assign complaint");
            
            if (window.SnapFixToast) window.SnapFixToast.show("Complaint assigned to worker successfully!", "success");
            loadAdminComplaints(user, currentFilter);
        } catch(err) {
            if (window.SnapFixToast) window.SnapFixToast.show(err.message, "error");
        }
    };

    window.handleExtension = async function(complaintId, extensionId, action) {
        if (!window.SnapFixModal) return;
        
        let notes = '';
        if (action === 'reject') {
            notes = await window.SnapFixModal.prompt(
                "Reject Extension",
                "Enter reason for rejection:",
                "Reason..."
            );
            if (!notes) return; // required for rejection
        } else {
            notes = await window.SnapFixModal.prompt(
                "Approve Extension",
                "Optional notes:",
                "Notes..."
            );
        }

        const user = auth.currentUser;
        if (!user) return;
        
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/admin/complaints/${complaintId}/extension/${extensionId}`, {
                method: 'PATCH',
                headers: { 
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ action: action, admin_notes: notes || '' })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to process extension");
            
            if (window.SnapFixToast) window.SnapFixToast.show(`Extension ${action}d successfully`, "success");
            loadAdminComplaints(user, currentFilter);
        } catch(err) {
            if (window.SnapFixToast) window.SnapFixToast.show(err.message, "error");
        }
    };
    
    window.handleEscalation = async function(complaintId, escalationId, action, detailsHtml) {
        if (!window.SnapFixModal) return;
        
        let notes = await window.SnapFixModal.prompt(
            action === 'resolve' ? "Resolve Escalation" : "Reject Escalation",
            detailsHtml + (action === 'reject' ? "<br><br><strong>Enter mandatory remarks for rejection:</strong>" : "<br><br><strong>Optional remarks:</strong>"),
            "Remarks..."
        );
        
        if (action === 'reject' && !notes) return;
        
        const user = auth.currentUser;
        if (!user) return;
        
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/admin/complaints/${complaintId}/escalation/${escalationId}`, {
                method: 'PATCH',
                headers: { 
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ decision: action, remarks: notes || 'Resolved without remarks' })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to process escalation");
            
            if (window.SnapFixToast) window.SnapFixToast.show(`Escalation ${action}d successfully`, "success");
            loadAdminComplaints(user, currentFilter);
        } catch(err) {
            if (window.SnapFixToast) window.SnapFixToast.show(err.message, "error");
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
            if (statusFilter === 'warnings') {
                url = '/api/admin/warnings';
            } else if (statusFilter) {
                url += '?status=' + statusFilter;
            }
            
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
                    
                    if (c.assignment_state === 'rejected') {
                        statusText += '<div style="color: #dc2626; font-weight: bold; margin-top: 5px; margin-bottom: 5px; font-size: 0.85rem;">Worker Rejected Assignment</div>';
                    }
                    
                    actionHtml = `
                        ${statusText}
                        <button class="btn btn-secondary btn-sm" onclick="assignWorker('${c.id}')">${c.assignment_state === 'rejected' ? 'Reassign Worker' : 'Assign Worker'}</button>
                    `;
                } else if (c.status === 'assigned') {
                    let assignText = 'ASSIGNED';
                    if (c.assignment_state === 'pending') {
                         assignText = 'PENDING ACCEPTANCE';
                    } else if (c.assignment_state === 'accepted') {
                         assignText = 'ACCEPTED / IN PROGRESS';
                    }
                    
                    let workerDisplay = 'Unknown Worker';
                    if (c.worker_name && c.worker_email) {
                        workerDisplay = `${c.worker_name} &bull; ${c.worker_email}`;
                    } else if (c.worker_email) {
                        workerDisplay = c.worker_email;
                    }
                    
                    actionHtml = `<span style="background: #e0e7ff; color: #4338ca; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: bold; font-size: 0.85rem;">${assignText}: ${workerDisplay}</span>`;
                }
                
                const overdueBadge = c.is_overdue ? `<span style="background: #fee2e2; color: #dc2626; padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.8rem; font-weight: bold; margin-left: 0.5rem;">OVERDUE / ESCALATED</span>` : '';
                
                html += `
                    <div class="card" style="padding: 1.5rem; border-left: 4px solid var(--primary-color);">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <span style="font-size: 0.8rem; font-weight: bold; color: var(--text-muted);">${c.report_id || 'ID: ' + c.id.substring(0,8)}</span>
                                <h4 style="margin-top: 0.2rem; margin-bottom: 0;">${c.category} <span style="font-size:0.8rem; font-weight:normal; background:#eee; padding:2px 6px; border-radius:4px;">${c.department || 'Unassigned'}</span>${overdueBadge}</h4>
                            </div>
                            <span style="font-size:0.85rem; font-weight:bold; background: #e2e8f0; padding: 0.2rem 0.6rem; border-radius: 12px;">${c.status.toUpperCase()}</span>
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
                                        Seriousness: +${c.priority_breakdown.seriousness}<br>
                                        Days Passed: +${c.priority_breakdown.days_passed}<br>
                                        Supporters : +${c.priority_breakdown.supporters}<br>
                                        <hr style="margin: 4px 0;">
                                        Total      : ${c.priority_breakdown.total}
                                    </div>
                                </details>
                                ` : ''}
                            </div>
                            <div>
                                ${actionHtml}
                            </div>
                        </div>
                        
                        ${c.extensions && c.extensions.length > 0 ? `
                        <div style="margin-top: 1rem; background: #fffbeb; border: 1px solid #fde68a; padding: 1rem; border-radius: 8px;">
                            <h5 style="margin-bottom: 0.5rem; color: #b45309;">Extension Requests</h5>
                            ${c.extensions.map(ext => `
                                <div style="margin-bottom: 0.5rem; font-size: 0.85rem; padding-bottom: 0.5rem; border-bottom: 1px solid #fcd34d;">
                                    <strong>Requested Days:</strong> ${ext.requested_days}<br>
                                    <strong>Reason:</strong> ${ext.reason}<br>
                                    <strong>Status:</strong> <span style="font-weight: bold; color: ${ext.status === 'pending' ? '#d97706' : ext.status === 'approved' ? 'green' : 'red'};">${ext.status.toUpperCase()}</span>
                                    ${ext.status === 'pending' ? `
                                        <div style="margin-top: 0.5rem;">
                                            <button class="btn btn-primary btn-sm" onclick="handleExtension('${c.id}', '${ext.id}', 'approve')">Approve</button>
                                            <button class="btn btn-danger btn-sm" onclick="handleExtension('${c.id}', '${ext.id}', 'reject')">Reject</button>
                                        </div>
                                    ` : ''}
                                </div>
                            `).join('')}
                        </div>
                        ` : ''}
                        
                        ${c.escalations && c.escalations.length > 0 ? `
                        <div style="margin-top: 1rem; background: #fee2e2; border: 1px solid #fca5a5; padding: 1rem; border-radius: 8px;">
                            <h5 style="margin-bottom: 0.5rem; color: #991b1b;">Escalation Requests</h5>
                            ${c.escalations.map(esc => {
                                let canResolve = false;
                                if (esc.status === 'pending' && window.currentUserRole) {
                                    if (window.currentUserRole === 'main_authority') {
                                        canResolve = true;
                                    } else if (window.currentUserRole === 'city_admin' && ['city_admin', 'department_head'].includes(esc.target_authority)) {
                                        canResolve = true;
                                    } else if (window.currentUserRole === 'department_head' && esc.target_authority === 'department_head') {
                                        canResolve = true;
                                    }
                                }
                                return `
                                <div style="margin-bottom: 0.5rem; font-size: 0.85rem; padding-bottom: 0.5rem; border-bottom: 1px solid #fecaca;">
                                    <strong>Requested By:</strong> ${esc.requester_name || 'Unknown'} (${esc.requester_role || 'Unknown'})<br>
                                    <strong>Reason:</strong> ${esc.reason}<br>
                                    <strong>Target Authority:</strong> ${esc.target_authority}<br>
                                    <strong>Date:</strong> ${new Date(esc.escalated_at).toLocaleString()}<br>
                                    <strong>Status:</strong> <span style="font-weight: bold; color: ${esc.status === 'pending' ? '#dc2626' : 'green'};">${(esc.status || 'pending').toUpperCase()}</span>
                                    ${esc.status === 'resolved' ? `<br><strong>Decision:</strong> ${esc.decision}<br><strong>Remarks:</strong> ${esc.remarks}` : ''}
                                    ${canResolve ? `
                                        <div style="margin-top: 0.5rem;">
                                            <button class="btn btn-primary btn-sm" onclick="handleEscalation('${c.id}', '${esc.id}', 'resolve', \`Report ID: ${c.report_id || 'ID: ' + c.id.substring(0,8)}<br>Category: ${c.category}<br>Requester: ${esc.requester_name || 'Unknown'} (${esc.requester_role || 'Unknown'})<br>Target Authority: ${esc.target_authority}<br>Reason: ${esc.reason}<br>Date: ${new Date(esc.escalated_at).toLocaleString()}\`)">Review Escalation (Resolve)</button>
                                            <button class="btn btn-danger btn-sm" onclick="handleEscalation('${c.id}', '${esc.id}', 'reject', \`Report ID: ${c.report_id || 'ID: ' + c.id.substring(0,8)}<br>Category: ${c.category}<br>Requester: ${esc.requester_name || 'Unknown'} (${esc.requester_role || 'Unknown'})<br>Target Authority: ${esc.target_authority}<br>Reason: ${esc.reason}<br>Date: ${new Date(esc.escalated_at).toLocaleString()}\`)">Reject / Decline</button>
                                        </div>
                                    ` : ''}
                                </div>
                                `;
                            }).join('')}
                        </div>
                        ` : ''}
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
