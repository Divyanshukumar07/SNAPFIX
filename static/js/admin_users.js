document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || !firebase.apps.length) return;
    const auth = firebase.auth();
    
    let allUsers = [];
    const tableBody = document.getElementById('users-table-body');
    const searchInput = document.getElementById('user-search');
    const filterSelect = document.getElementById('user-filter');
    const roleModal = document.getElementById('role-modal');
    const roleForm = document.getElementById('role-form');
    const roleSelect = document.getElementById('modal-role');
    const deptGroup = document.getElementById('dept-group');
    const deptSelect = document.getElementById('modal-dept');
    const errEl = document.getElementById('users-error');
    
    auth.onAuthStateChanged(user => {
        if (user) {
            loadUsers(user);
        } else {
            window.location.href = '/login';
        }
    });

    async function loadUsers(user) {
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/users', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message || data.error || "Failed to load users");
            }
            
            allUsers = await res.json();
            renderUsers();
        } catch (err) {
            tableBody.innerHTML = `<tr><td colspan="5" style="color: var(--danger-color); padding: 1rem;">${err.message}</td></tr>`;
        }
    }

    function renderUsers() {
        const query = searchInput.value.toLowerCase();
        const filterVal = filterSelect.value;
        
        let filtered = allUsers.filter(u => 
            (u.email || '').toLowerCase().includes(query) || 
            (u.uid || '').toLowerCase().includes(query)
        );
        
        if (filterVal === 'false_reports') {
            filtered = filtered.filter(u => u.false_report_count > 0);
        } else if (filterVal === 'active') {
            filtered = filtered.filter(u => (u.account_status || 'active') === 'active');
        } else if (filterVal === 'banned') {
            filtered = filtered.filter(u => u.account_status === 'banned');
        }
        
        if (filtered.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" style="padding: 1rem; text-align: center;" class="text-muted">No users found.</td></tr>`;
            return;
        }
        
        tableBody.innerHTML = filtered.map(u => {
            const statusColor = u.account_status === 'banned' ? '#dc2626' : '#16a34a';
            const statusBg = u.account_status === 'banned' ? '#fee2e2' : '#dcfce7';
            const banButton = u.account_status === 'banned' 
                ? `<button class="btn btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.9em; margin-top: 0.5rem;" onclick="unbanUser('${u.uid}')">Unban User</button>`
                : `<button class="btn btn-danger" style="padding: 0.4rem 0.8rem; font-size: 0.9em; margin-top: 0.5rem;" onclick="banUser('${u.uid}')">Ban User</button>`;
            
            return `
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 1rem; font-weight: 500;">${u.email || 'N/A'}</td>
                <td style="padding: 1rem; font-family: monospace; font-size: 0.9em; color: #64748b;">${u.uid}</td>
                <td style="padding: 1rem;">
                    <span style="display: inline-block; padding: 0.2rem 0.6rem; background: #e0e7ff; color: #4338ca; border-radius: 99px; font-size: 0.85em; font-weight: bold;">
                        ${(u.role || 'citizen').toUpperCase()}
                    </span>
                </td>
                <td style="padding: 1rem;">
                    <span style="display: inline-block; padding: 0.2rem 0.6rem; background: ${statusBg}; color: ${statusColor}; border-radius: 99px; font-size: 0.85em; font-weight: bold;">
                        ${(u.account_status || 'active').toUpperCase()}
                    </span>
                </td>
                <td style="padding: 1rem; color: #475569;">
                    <strong>${u.false_report_count || 0}</strong>
                </td>
                <td style="padding: 1rem; display: flex; flex-direction: column; gap: 0.2rem;">
                    <button class="btn btn-primary" style="padding: 0.4rem 0.8rem; font-size: 0.9em;" onclick="openRoleModal('${u.uid}')">Edit Role</button>
                    ${u.role === 'service_worker' ? `<button class="btn btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.9em; margin-top: 0.5rem;" onclick="viewWorkerPerformance('${u.uid}', '${u.email}')">View Performance</button>` : ''}
                    ${banButton}
                </td>
            </tr>
            `;
        }).join('');
    }

    searchInput.addEventListener('input', renderUsers);
    filterSelect.addEventListener('change', renderUsers);

    window.banUser = async function(uid) {
        if (!window.SnapFixModal) return;
        const confirmed = await window.SnapFixModal.confirm(
            "Ban User",
            "Are you sure you want to ban this user? They will not be able to create new complaints.",
            "Ban User",
            true
        );
        if (!confirmed) return;
        
        const currentUser = auth.currentUser;
        if (!currentUser) return;
        try {
            const token = await currentUser.getIdToken();
            const res = await fetch(`/api/admin/users/${uid}/ban`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to ban user");
            if (window.SnapFixToast) window.SnapFixToast.show("User banned successfully.", "success");
            loadUsers(currentUser);
        } catch(err) {
            if (window.SnapFixToast) window.SnapFixToast.show(err.message, "error");
        }
    };

    window.unbanUser = async function(uid) {
        if (!window.SnapFixModal) return;
        const confirmed = await window.SnapFixModal.confirm(
            "Restore User",
            "Are you sure you want to restore this user's account?",
            "Restore",
            false
        );
        if (!confirmed) return;
        
        const currentUser = auth.currentUser;
        if (!currentUser) return;
        try {
            const token = await currentUser.getIdToken();
            const res = await fetch(`/api/admin/users/${uid}/unban`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to unban user");
            if (window.SnapFixToast) window.SnapFixToast.show("User account status restored to Active.", "success");
            loadUsers(currentUser);
        } catch(err) {
            if (window.SnapFixToast) window.SnapFixToast.show(err.message, "error");
        }
    };

    window.openRoleModal = function(uid) {
        const user = allUsers.find(u => u.uid === uid);
        if (!user) return;
        
        document.getElementById('modal-uid').value = user.uid;
        document.getElementById('modal-user-email').innerText = user.email || user.uid;
        roleSelect.value = user.role || 'citizen';
        deptSelect.value = user.department_id || '';
        
        toggleDeptGroup();
        
        roleModal.style.display = 'flex';
    };

    window.closeRoleModal = function() {
        roleModal.style.display = 'none';
        errEl.style.display = 'none';
    };

    function toggleDeptGroup() {
        if (['department_head', 'service_worker'].includes(roleSelect.value)) {
            deptGroup.style.display = 'block';
            deptSelect.required = true;
        } else {
            deptGroup.style.display = 'none';
            deptSelect.required = false;
        }
    }

    roleSelect.addEventListener('change', toggleDeptGroup);

    roleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const uid = document.getElementById('modal-uid').value;
        const role = roleSelect.value;
        const dept = deptSelect.value;
        
        const currentUser = auth.currentUser;
        if (!currentUser) return;
        
        try {
            const token = await currentUser.getIdToken();
            const res = await fetch(`/api/users/${uid}/role`, {
                method: 'POST',
                headers: { 
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    role: role,
                    department_id: dept || null
                })
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || data.message || "Failed to update role");
            
            if (window.SnapFixToast) window.SnapFixToast.show("User role updated successfully!", "success");
            closeRoleModal();
            loadUsers(currentUser);
        } catch (err) {
            if (window.SnapFixToast) window.SnapFixToast.show(err.message, "error");
        }
    });
    
    window.viewWorkerPerformance = async function(uid, email) {
        const modal = document.getElementById('performance-modal');
        const emailEl = document.getElementById('perf-user-email');
        const loadingEl = document.getElementById('perf-loading');
        const contentEl = document.getElementById('perf-content');
        
        emailEl.innerText = email || uid;
        loadingEl.style.display = 'block';
        contentEl.style.display = 'none';
        modal.style.display = 'flex';
        
        const currentUser = auth.currentUser;
        if (!currentUser) return;
        
        try {
            const token = await currentUser.getIdToken();
            const res = await fetch(`/api/admin/workers/${uid}/performance`, {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to load performance metrics");
            
            document.getElementById('perf-total').innerText = data.total_assigned;
            document.getElementById('perf-completed').innerText = data.successfully_completed;
            document.getElementById('perf-confirmed').innerText = data.citizen_confirmed;
            document.getElementById('perf-rejected').innerText = data.reopened_from_rejection;
            
            loadingEl.style.display = 'none';
            contentEl.style.display = 'block';
        } catch (err) {
            loadingEl.innerHTML = `<span style="color: var(--danger-color);">${err.message}</span>`;
        }
    };
    
    window.closePerformanceModal = function() {
        document.getElementById('performance-modal').style.display = 'none';
    };
});
