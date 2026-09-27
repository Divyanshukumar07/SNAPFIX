document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || !firebase.apps.length) return;
    const auth = firebase.auth();
    
    let currentFilter = '';
    
    auth.onAuthStateChanged(async user => {
        if (user) {
            try {
                const tokenResult = await user.getIdTokenResult();
                const role = tokenResult.claims.role || 'unknown';
                window.currentUserRole = role;
                
                const profileRes = await fetch('/api/users/me', {
                    headers: { 'Authorization': 'Bearer ' + tokenResult.token }
                });
                if (profileRes.ok) {
                    const profileData = await profileRes.json();
                    window.currentUserDepartment = profileData.department_id || null;
                }
                
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
        const user = auth.currentUser;
        if (!user) return;
        const token = await user.getIdToken();
        
        if (!workerId) {
            if (!window.SnapFixModal) return;
            
            let workers = [];
            try {
                const res = await fetch(`/api/admin/department_workers`, {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (res.ok) {
                    workers = await res.json();
                }
            } catch (e) {
                console.error("Failed to fetch workers", e);
            }
            
            let workerOptions = '<option value="">-- Select Worker --</option>';
            workers.forEach(w => {
                const workerLabel = `${w.name || 'Worker'} (${w.email})`;
                workerOptions += `<option value="${w.uid}">${workerLabel}</option>`;
            });
            
            const formHTML = `
                <div style="margin-bottom: 1rem;">
                    <label style="display:block; margin-bottom: 0.5rem; font-weight:bold;">Select Worker:</label>
                    <select id="worker-select" style="width:100%; padding: 0.5rem; border-radius:4px; border:1px solid #ccc;">
                        ${workerOptions}
                    </select>
                </div>
                <div style="margin-bottom: 1rem;">
                    <label style="display:block; margin-bottom: 0.5rem; font-weight:bold;">Set Deadline (Optional):</label>
                    <input type="datetime-local" id="deadline-input" style="width:100%; padding: 0.5rem; border-radius:4px; border:1px solid #ccc;" />
                </div>
            `;
            
            const confirmed = await window.SnapFixModal.customForm("Assign Worker", formHTML, "Assign");
            if (!confirmed) return; // User cancelled or didn't submit
            
            workerId = document.getElementById('worker-select').value;
            if (!workerId) {
                if (window.SnapFixToast) window.SnapFixToast.show("You must select a worker", "error");
                return;
            }
            
            let deadlineInput = document.getElementById('deadline-input').value;
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

        try {
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

    window.requestTransfer = async function(complaintId) {
        if (!window.SnapFixModal) return;
        
        const formHTML = `
            <div style="margin-bottom: 1rem;">
                <label style="display:block; margin-bottom: 0.5rem; font-weight:bold;">Target Department:</label>
                <select id="transfer-target" style="width:100%; padding: 0.5rem; border-radius:4px; border:1px solid #ccc;">
                    <option value="">-- Select Department --</option>
                    <option value="Water Department">Water Department</option>
                    <option value="Electrical Department">Electrical Department</option>
                    <option value="Roads Department">Roads Department</option>
                    <option value="Sanitation Department">Sanitation Department</option>
                </select>
            </div>
            <div style="margin-bottom: 1rem;">
                <label style="display:block; margin-bottom: 0.5rem; font-weight:bold;">Reason for Transfer:</label>
                <input type="text" id="transfer-reason" placeholder="Explain why..." style="width:100%; padding: 0.5rem; border-radius:4px; border:1px solid #ccc;" />
            </div>
        `;
        
        const confirmed = await window.SnapFixModal.customForm("Request Transfer", formHTML, "Request");
        if (!confirmed) return;
        
        const target = document.getElementById('transfer-target').value;
        const reason = document.getElementById('transfer-reason').value;
        
        if (!target || !reason) {
            if (window.SnapFixToast) window.SnapFixToast.show("Target department and reason are required", "error");
            return;
        }
        
        const user = auth.currentUser;
        if (!user) return;
        
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/admin/complaints/${complaintId}/transfer/request`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_department: target, reason: reason })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to request transfer");
            
            if (window.SnapFixToast) window.SnapFixToast.show("Transfer requested successfully!", "success");
            loadAdminComplaints(user, currentFilter);
        } catch(err) {
            if (window.SnapFixToast) window.SnapFixToast.show(err.message, "error");
        }
    };

    window.acceptTransfer = async function(complaintId) {
        const user = auth.currentUser;
        if (!user) return;
        
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/admin/complaints/${complaintId}/transfer/accept`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to accept transfer");
            
            if (window.SnapFixToast) window.SnapFixToast.show("Transfer accepted successfully!", "success");
            loadAdminComplaints(user, currentFilter);
        } catch(err) {
            if (window.SnapFixToast) window.SnapFixToast.show(err.message, "error");
        }
    };

    window.rejectTransfer = async function(complaintId) {
        if (!window.SnapFixModal) return;
        const reason = await window.SnapFixModal.prompt("Reject Transfer", "Enter reason for rejection:", "Reason...");
        if (!reason) return;
        
        const user = auth.currentUser;
        if (!user) return;
        
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/admin/complaints/${complaintId}/transfer/reject`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: reason })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to reject transfer");
            
            if (window.SnapFixToast) window.SnapFixToast.show("Transfer rejected.", "success");
            loadAdminComplaints(user, currentFilter);
        } catch(err) {
            if (window.SnapFixToast) window.SnapFixToast.show(err.message, "error");
        }
    };

    window.interveneAdmin = async function(complaintId) {
        if (!window.SnapFixModal) return;
        
        const formHTML = `
            <div style="margin-bottom: 1rem;">
                <label style="display:block; margin-bottom: 0.5rem; font-weight:bold;">Force Transfer To:</label>
                <select id="intervene-target" style="width:100%; padding: 0.5rem; border-radius:4px; border:1px solid #ccc;">
                    <option value="">-- Select Department --</option>
                    <option value="Water Department">Water Department</option>
                    <option value="Electrical Department">Electrical Department</option>
                    <option value="Roads Department">Roads Department</option>
                    <option value="Sanitation Department">Sanitation Department</option>
                </select>
            </div>
            <div style="margin-bottom: 1rem;">
                <label style="display:block; margin-bottom: 0.5rem; font-weight:bold;">Reason for Intervention:</label>
                <input type="text" id="intervene-reason" placeholder="Explain why..." style="width:100%; padding: 0.5rem; border-radius:4px; border:1px solid #ccc;" />
            </div>
        `;
        
        const confirmed = await window.SnapFixModal.customForm("Admin Intervention", formHTML, "Execute Transfer");
        if (!confirmed) return;
        
        const target = document.getElementById('intervene-target').value;
        const reason = document.getElementById('intervene-reason').value;
        
        if (!target || !reason) {
            if (window.SnapFixToast) window.SnapFixToast.show("Target department and reason are required", "error");
            return;
        }
        
        const user = auth.currentUser;
        if (!user) return;
        
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/admin/complaints/${complaintId}/intervene`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_department: target, reason: reason })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Intervention failed");
            
            if (window.SnapFixToast) window.SnapFixToast.show("Intervention successful!", "success");
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
                listEl.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">✅</div>
                        <h4>No complaints found</h4>
                        <p>There are no complaints matching the current filter.</p>
                    </div>
                `;
                return;
            }

            let html = '<div style="display: flex; flex-direction: column; gap: 1rem;">';
            complaints.forEach(c => {
                const date = window.formatIST(c.created_at);
                
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
                
                let transferHtml = '';
                if (window.currentUserRole === 'city_admin' || window.currentUserRole === 'main_authority') {
                    transferHtml += `<button class="btn btn-secondary btn-sm" style="margin-bottom: 0.5rem; width: 100%;" onclick="interveneAdmin('${c.id}')">Force Transfer (Intervene)</button><br>`;
                }
                
                if (c.transfer_status === 'TRANSFER_REQUESTED') {
                    if (window.currentUserRole === 'department_head' && window.currentUserDepartment === c.transfer_target) {
                        transferHtml += `
                            <div style="background: #fff3cd; color: #856404; padding: 0.5rem; border-radius: 4px; margin-bottom: 0.5rem; font-size: 0.85rem; text-align: left;">
                                <strong>Incoming Transfer Request</strong><br>
                                From: ${c.department}<br>Reason: ${c.transfer_reason}
                                <div style="margin-top: 5px;">
                                    <button class="btn btn-primary btn-sm" onclick="acceptTransfer('${c.id}')">Accept</button>
                                    <button class="btn btn-danger btn-sm" onclick="rejectTransfer('${c.id}')">Reject</button>
                                </div>
                            </div>`;
                    } else {
                        transferHtml += `<div style="background: #e2e8f0; color: #64748b; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: bold; font-size: 0.85rem; margin-bottom: 0.5rem; display: inline-block;">Transfer Requested To: ${c.transfer_target}</div><br>`;
                    }
                } else if (c.transfer_status === 'TRANSFER_REJECTED' && window.currentUserRole === 'department_head' && window.currentUserDepartment === c.department) {
                    transferHtml += `<div style="background: #fee2e2; color: #dc2626; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: bold; font-size: 0.85rem; margin-bottom: 0.5rem; display: inline-block;">Transfer Rejected</div><br>`;
                }

                if (window.currentUserRole === 'department_head' && (!c.transfer_status || c.transfer_status === 'TRANSFER_REJECTED')) {
                    transferHtml += `<button class="btn btn-secondary btn-sm" style="margin-bottom: 0.5rem; width: 100%;" onclick="requestTransfer('${c.id}')">Request Transfer</button><br>`;
                }
                
                actionHtml = `<div style="text-align: right;">${transferHtml}${actionHtml}</div>`;

                
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
                        <p style="margin: 0.5rem 0; word-break: break-word;">${c.description}</p>
                        <p class="text-muted" style="font-size: 0.9rem; margin-bottom: 1rem;">📍 ${c.location_text}</p>
                        
                        ${c.image_url ? `<p><a href="${c.image_url}" target="_blank" style="color: var(--primary-color); text-decoration: underline; font-size: 0.9rem;">View Attached Evidence 📸</a></p>` : ''}
                        
                        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 1rem; border-top: 1px solid #eee; padding-top: 1rem;">
                            <div style="font-size: 0.85rem; color: #666;">
                                Priority Score: <strong>${c.priority_score}</strong> | Supporters: <strong>${c.support_count}</strong><br>
                                Reported: ${date}
                                ${c.expected_completion_deadline ? (function(){
                                    const dl = window.formatDeadline(c.expected_completion_deadline);
                                    return dl ? `<br><span style="display: inline-block; margin-top: 4px; padding: 2px 6px; border-radius: 4px; background: ${dl.bg}; color: ${dl.color}; font-weight: bold; font-size: 0.8rem;">Deadline: ${dl.formatted} (${dl.status})</span>` : '';
                                })() : ''}
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
                                    <strong>Date:</strong> ${window.formatIST(esc.escalated_at)}<br>
                                    <strong>Status:</strong> <span style="font-weight: bold; color: ${esc.status === 'pending' ? '#dc2626' : 'green'};">${(esc.status || 'pending').toUpperCase()}</span>
                                    ${esc.status === 'resolved' ? `<br><strong>Decision:</strong> ${esc.decision}<br><strong>Remarks:</strong> ${esc.remarks}` : ''}
                                    ${canResolve ? `
                                        <div style="margin-top: 0.5rem;">
                                            <button class="btn btn-primary btn-sm" onclick="handleEscalation('${c.id}', '${esc.id}', 'resolve', \`Report ID: ${c.report_id || 'ID: ' + c.id.substring(0,8)}<br>Category: ${c.category}<br>Requester: ${esc.requester_name || 'Unknown'} (${esc.requester_role || 'Unknown'})<br>Target Authority: ${esc.target_authority}<br>Reason: ${esc.reason}<br>Date: ${window.formatIST(esc.escalated_at)}\`)">Review Escalation (Resolve)</button>
                                            <button class="btn btn-danger btn-sm" onclick="handleEscalation('${c.id}', '${esc.id}', 'reject', \`Report ID: ${c.report_id || 'ID: ' + c.id.substring(0,8)}<br>Category: ${c.category}<br>Requester: ${esc.requester_name || 'Unknown'} (${esc.requester_role || 'Unknown'})<br>Target Authority: ${esc.target_authority}<br>Reason: ${esc.reason}<br>Date: ${window.formatIST(esc.escalated_at)}\`)">Reject / Decline</button>
                                        </div>
                                    ` : ''}
                                </div>
                                `;
                            }).join('')}
                        </div>
                        ` : ''}
                        
                        ${c.transfers && c.transfers.length > 0 ? `
                        <div style="margin-top: 1rem; background: #e0f2fe; border: 1px solid #bae6fd; padding: 1rem; border-radius: 8px;">
                            <h5 style="margin-bottom: 0.5rem; color: #0369a1;">Transfer History</h5>
                            ${c.transfers.map(trf => `
                                <div style="margin-bottom: 0.5rem; font-size: 0.85rem; padding-bottom: 0.5rem; border-bottom: 1px solid #bae6fd;">
                                    <strong>From:</strong> ${trf.from_department} ➔ <strong>To:</strong> ${trf.to_department}<br>
                                    <strong>Requested By:</strong> ${trf.requested_by_name} (${trf.requested_by_role})<br>
                                    <strong>Reason:</strong> ${trf.request_reason}<br>
                                    <strong>Status:</strong> <span style="font-weight: bold; color: ${trf.status === 'TRANSFER_REQUESTED' ? '#0369a1' : trf.status === 'TRANSFER_ACCEPTED' ? 'green' : 'red'};">${trf.status.replace('_', ' ')}</span>
                                    ${trf.status !== 'TRANSFER_REQUESTED' ? `<br><strong>Responded By:</strong> ${trf.responded_by_name} (${trf.responded_by_role})` : ''}
                                    ${trf.response_reason ? `<br><strong>Rejection Reason:</strong> ${trf.response_reason}` : ''}
                                </div>
                            `).join('')}
                        </div>
                        ` : ''}
                        
                        ${c.history && c.history.length > 0 ? `
                        <details style="margin-top: 1rem; border-top: 1px dashed var(--border-color); padding-top: 1rem;">
                            <summary style="cursor: pointer; font-weight: bold; color: var(--text-main);">Activity Timeline (${c.history.length})</summary>
                            <div style="margin-top: 1rem; margin-left: 0.5rem;">
                                ${c.history.map(h => {
                                    let cssClass = 'timeline-event';
                                    if (h.action.includes('INTERVENTION')) cssClass += ' intervention';
                                    if (h.action.includes('TRANSFER')) cssClass += ' transfer';
                                    
                                    const actorDisplay = h.actor_name ? `${h.actor_role.replace(/_/g, ' ')} &mdash; ${h.actor_name}` : h.actor_role.replace(/_/g, ' ');
                                    
                                    return `
                                    <div class="${cssClass}">
                                        <div class="timeline-time">${window.formatIST(h.timestamp)}</div>
                                        <div class="timeline-action">${h.action.replace(/_/g, ' ')}</div>
                                        <div class="timeline-actor">By: ${actorDisplay} ${h.actor_email && !h.actor_name ? '(' + h.actor_email + ')' : ''}</div>
                                        ${h.details ? `<div class="timeline-details">${h.details}</div>` : ''}
                                    </div>
                                    `;
                                }).join('')}
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
