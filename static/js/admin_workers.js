document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || !firebase.apps.length) return;
    const auth = firebase.auth();
    
    let allWorkers = [];
    let performanceDataCache = {};
    
    auth.onAuthStateChanged(user => {
        if (user) {
            loadWorkers(user);
        } else {
            window.location.href = '/login';
        }
    });

    const searchInput = document.getElementById('worker-search');
    const deptSelect = document.getElementById('dept-filter');
    const statusSelect = document.getElementById('status-filter');
    
    if (searchInput) searchInput.addEventListener('input', renderWorkers);
    if (deptSelect) deptSelect.addEventListener('change', renderWorkers);
    if (statusSelect) statusSelect.addEventListener('change', renderWorkers);

    async function loadWorkers(user) {
        const tbody = document.getElementById('workers-tbody');
        const errEl = document.getElementById('workers-error');
        if (!tbody) return;
        
        try {
            const token = await user.getIdToken();
            
            // First fetch users list, filter by service_worker
            const res = await fetch('/api/admin/users', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to fetch users");
            }
            
            const allUsers = await res.json();
            allWorkers = allUsers.filter(u => u.role === 'service_worker');
            
            errEl.style.display = 'none';
            renderWorkers();
        } catch(err) {
            console.error("Worker fetch error:", err);
            errEl.innerText = err.message;
            errEl.style.display = 'block';
            tbody.innerHTML = `<tr><td colspan="6" style="padding: 2rem; text-align: center; color: var(--danger-color);">Error loading workers.</td></tr>`;
        }
    }
    
    window.viewWorkerPerformance = async function(uid) {
        if (performanceDataCache[uid]) {
            showPerformanceModal(uid, performanceDataCache[uid]);
            return;
        }
        
        const user = auth.currentUser;
        if (!user) return;
        
        const btn = document.getElementById(`perf-btn-${uid}`);
        if (btn) btn.innerText = "Loading...";
        
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/admin/workers/${uid}/performance`, {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || "Failed to load performance");
            
            performanceDataCache[uid] = data;
            showPerformanceModal(uid, data);
        } catch(err) {
            if (window.SnapFixToast) window.SnapFixToast.show(err.message, "error");
        } finally {
            if (btn) btn.innerText = "View Perf";
        }
    };
    
    function showPerformanceModal(uid, data) {
        const worker = allWorkers.find(w => w.uid === uid);
        const name = worker && worker.email ? worker.email : 'Unknown Worker';
        
        let html = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                <div style="background: #f1f5f9; padding: 1rem; border-radius: 8px; text-align: center;">
                    <div style="font-size: 2rem; font-weight: bold; color: #3b82f6;">${data.assigned || 0}</div>
                    <div style="font-size: 0.85rem; color: #64748b; text-transform: uppercase;">Total Assigned</div>
                </div>
                <div style="background: #f1f5f9; padding: 1rem; border-radius: 8px; text-align: center;">
                    <div style="font-size: 2rem; font-weight: bold; color: #10b981;">${data.resolved || 0}</div>
                    <div style="font-size: 0.85rem; color: #64748b; text-transform: uppercase;">Total Resolved</div>
                </div>
                <div style="background: #f1f5f9; padding: 1rem; border-radius: 8px; text-align: center;">
                    <div style="font-size: 2rem; font-weight: bold; color: #ef4444;">${data.false_reports || 0}</div>
                    <div style="font-size: 0.85rem; color: #64748b; text-transform: uppercase;">False Reports</div>
                </div>
                <div style="background: #f1f5f9; padding: 1rem; border-radius: 8px; text-align: center;">
                    <div style="font-size: 2rem; font-weight: bold; color: #f59e0b;">${data.rejected || 0}</div>
                    <div style="font-size: 0.85rem; color: #64748b; text-transform: uppercase;">Rejections</div>
                </div>
            </div>
            <div style="background: #f8fafc; padding: 1rem; border-radius: 8px; text-align: center;">
                <div style="font-size: 1.5rem; font-weight: bold; color: #1e293b;">
                    ${data.assigned > 0 ? Math.round((data.resolved / data.assigned) * 100) : 0}%
                </div>
                <div style="font-size: 0.85rem; color: #64748b; text-transform: uppercase;">Resolution Rate</div>
            </div>
        `;
        
        if (window.SnapFixModal) {
            window.SnapFixModal.confirm(
                `Performance: ${name}`,
                html,
                "Close",
                false
            );
        }
    }

    function renderWorkers() {
        const tbody = document.getElementById('workers-tbody');
        if (!tbody) return;

        let filtered = [...allWorkers];

        const query = (searchInput.value || '').toLowerCase();
        if (query) {
            filtered = filtered.filter(w => (w.email && w.email.toLowerCase().includes(query)));
        }

        const dept = deptSelect.value;
        if (dept) {
            filtered = filtered.filter(w => (w.department_id || 'General Services') === dept);
        }
        
        const status = statusSelect.value;
        if (status) {
            filtered = filtered.filter(w => {
                const wStatus = w.worker_status || 'active';
                return wStatus === status;
            });
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="padding: 2rem; text-align: center; color: var(--text-muted);">No workers found.</td></tr>`;
            return;
        }

        let html = '';
        filtered.forEach(w => {
            const deptDisplay = w.department_id || 'General Services';
            const statusVal = w.worker_status || 'active';
            
            let statusBadge = '';
            if (statusVal === 'working') {
                statusBadge = `<span style="background: #dbeafe; color: #1e40af; padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.85rem;">Working</span>`;
            } else if (statusVal === 'offline') {
                statusBadge = `<span style="background: #e2e8f0; color: #475569; padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.85rem;">Offline</span>`;
            } else {
                statusBadge = `<span style="background: #d1fae5; color: #065f46; padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.85rem;">Active</span>`;
            }

            html += `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 1rem;">
                        <div style="font-weight: bold; color: var(--primary-color);">${w.email || 'Unknown'}</div>
                        <div style="font-size: 0.85rem; color: #64748b; font-family: monospace;">${w.uid.substring(0,8)}...</div>
                    </td>
                    <td style="padding: 1rem;">
                        <span style="background: #f1f5f9; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.85rem;">${deptDisplay}</span>
                    </td>
                    <td style="padding: 1rem;">
                        ${statusBadge}
                    </td>
                    <td style="padding: 1rem; text-align: center;">
                        <span style="font-weight: bold; font-size: 1.1rem; color: ${w.active_tasks_count > 0 ? '#f59e0b' : '#64748b'}">${w.active_tasks_count || 0}</span>
                    </td>
                    <td style="padding: 1rem;">
                        <button id="perf-btn-${w.uid}" class="btn btn-secondary btn-sm" onclick="viewWorkerPerformance('${w.uid}')">View Perf</button>
                    </td>
                    <td style="padding: 1rem;">
                        <!-- Actions if needed (like reassign, message, etc.) -->
                        <span class="text-muted" style="font-size: 0.85rem;">N/A</span>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    }
});
