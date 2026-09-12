document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        console.warn("Auth UI: Firebase not loaded. Running in dummy mode.");
        return;
    }

    const auth = firebase.auth();
    const navLinks = document.getElementById('nav-links');
    const authGuard = document.getElementById('auth-guard');
    const requiresAuth = authGuard !== null;

    function setLoading(btnId, isLoading) {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        if (isLoading) {
            btn.dataset.originalText = btn.innerText;
            btn.innerText = 'Loading...';
            btn.disabled = true;
        } else {
            btn.innerText = btn.dataset.originalText || 'Submit';
            btn.disabled = false;
        }
    }

    function showError(elementId, message, html = false) {
        const el = document.getElementById(elementId);
        if (el) {
            if (html) {
                el.innerHTML = message;
            } else {
                el.innerText = message;
            }
            el.style.display = 'block';
        }
    }

    function hideMessages(prefix) {
        const err = document.getElementById(prefix + '-error');
        const suc = document.getElementById(prefix + '-success');
        if (err) err.style.display = 'none';
        if (suc) suc.style.display = 'none';
    }

    function showSuccess(elementId, message) {
        const el = document.getElementById(elementId);
        if (el) {
            el.innerText = message;
            el.style.display = 'block';
        }
    }

    // --- GLOBAL AUTH STATE CHANGES ---
    auth.onAuthStateChanged(async user => {
        const path = window.location.pathname;

        if (user) {
            // User is signed in, check verification
            if (!user.emailVerified) {
                // If they are not on the verify page, redirect them to it
                if (path !== '/verify') {
                    window.location.href = '/verify';
                } else {
                    // They are on the verify page, populate email
                    const emailDisplay = document.getElementById('verify-email-display');
                    if (emailDisplay) emailDisplay.innerText = user.email;
                }
                
                // Update nav to just show they are logged in but unverified
                navLinks.innerHTML = `
                    <span>${user.email} (Unverified)</span>
                    <button id="nav-logout" class="btn btn-secondary" style="padding: 0.3rem 0.8rem;">Logout</button>
                `;
            } else {
                // User is verified
                if (path === '/verify') {
                    // Edge case: they are on verify page but actually verified
                    // This happens when they click "I've Verified My Email" successfully
                    // The instruction said: Redirect to login and prefill email.
                    // But first we must sign them out, otherwise they are already logged in.
                    auth.signOut().then(() => {
                        window.location.href = '/login?verified_email=' + encodeURIComponent(user.email);
                    });
                    return;
                }

                // Optimistic UI update to prevent flashing Login/Signup
                navLinks.innerHTML = `<span>${user.email} (Loading...)</span>`;

                // Normal authenticated state - Fetch Role from Backend
                const token = await user.getIdToken();
                try {
                    const res = await fetch('/api/users/me', {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    
                    let role = 'citizen';
                    if (res.ok) {
                        const userData = await res.json();
                        role = userData.role;
                    }

                    let dashboardPath = '/dashboard';
                    if (role === 'service_worker') dashboardPath = '/worker/dashboard';
                    else if (['city_admin', 'main_authority', 'department_head'].includes(role)) dashboardPath = '/admin/dashboard';

                    if (path === '/login' || path === '/register') {
                        const urlParams = new URLSearchParams(window.location.search);
                        const nextUrl = urlParams.get('next');
                        if (nextUrl && nextUrl.startsWith('/')) {
                            window.location.replace(nextUrl);
                        } else {
                            window.location.replace(dashboardPath);
                        }
                        return;
                    }

                    // DOM Interception for Unauthorized Access
                    if (authGuard) {
                        const allowedRolesStr = authGuard.getAttribute('data-allowed-roles');
                        const pageName = authGuard.getAttribute('data-page-name') || 'this area';
                        if (allowedRolesStr) {
                            const allowedRoles = allowedRolesStr.split(',').map(r => r.trim());
                            if (!allowedRoles.includes(role)) {
                                document.body.innerHTML = `
                                    <div class="card" style="text-align: center; padding: 4rem 2rem; max-width: 500px; margin: 4rem auto;">
                                        <h2 style="color: var(--danger-color); margin-bottom: 1rem;">🔒 Access Restricted</h2>
                                        <p style="margin-bottom: 1rem;">You don't have permission to access <strong>${pageName}</strong>.</p>
                                        <p style="margin-bottom: 2rem; color: #64748b; font-size: 0.9em;">Required role(s): ${allowedRoles.join(', ')}</p>
                                        <a href="${dashboardPath}" class="btn btn-primary">Return to My Dashboard</a>
                                    </div>
                                `;
                                return; // Halt further page execution
                            }
                        }
                        // Reveal page content if authorized (Anti-Flicker)
                        const mainContent = document.querySelector('main') || document.querySelector('.container');
                        if (mainContent) {
                            mainContent.style.visibility = 'visible';
                            mainContent.style.opacity = '1';
                        }
                    }

                    // Role-Aware Navigation
                    const navAppTabs = document.getElementById('nav-app-tabs');
                    const navProfileMenu = document.getElementById('nav-profile-menu');
                    const navProfileCircle = document.getElementById('nav-profile-circle');
                    const navDropdown = document.getElementById('nav-dropdown');
                    const navAuthBtns = document.getElementById('nav-auth-buttons');
                    const navWorkerStatus = document.getElementById('nav-worker-status-container');
                    const navPublic = document.getElementById('nav-public');
                    
                    if (navAuthBtns) navAuthBtns.style.display = 'none';
                    if (navProfileMenu) navProfileMenu.style.display = 'flex';
                    if (navProfileCircle) {
                        navProfileCircle.innerText = (user.displayName || user.email || 'U').charAt(0).toUpperCase();
                    }

                    let tabsHtml = '';
                    if (role === 'citizen') {
                        tabsHtml += `<a href="/dashboard">Dashboard</a>`;
                        tabsHtml += `<a href="/complaints/new">Report Complaint</a>`;
                    } else if (role === 'service_worker') {
                        tabsHtml += `<a href="/worker/dashboard">Worker Dashboard</a>`;
                        tabsHtml += `<a href="/dashboard">My Complaints</a>`;
                        tabsHtml += `<a href="/complaints/new">Report Complaint</a>`;
                        if (navWorkerStatus) navWorkerStatus.style.display = 'block';
                    } else if (role === 'department_head') {
                        tabsHtml += `<a href="/admin/dashboard">Dept Dashboard</a>`;
                        tabsHtml += `<a href="/dashboard">My Complaints</a>`;
                        tabsHtml += `<a href="/complaints/new">Report Complaint</a>`;
                    } else if (['city_admin', 'main_authority'].includes(role)) {
                        tabsHtml += `<a href="/admin/dashboard">City Dashboard</a>`;
                        tabsHtml += `<a href="/admin/heatmap">Civic Map</a>`;
                        tabsHtml += `<a href="/admin/users">User Management</a>`;
                        tabsHtml += `<a href="/dashboard">My Complaints</a>`;
                        tabsHtml += `<a href="/complaints/new">Report Complaint</a>`;
                    }
                    if (navAppTabs) navAppTabs.innerHTML = tabsHtml;

                    let dropHtml = `
                        <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); display:flex; flex-direction:column; align-items:center;">
                            <div style="width: 48px; height: 48px; background: var(--primary-color); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.5rem; user-select: none; margin-bottom: 0.5rem;">
                                ${(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                            </div>
                            <strong style="margin-bottom:0.2rem;">${user.displayName || 'SnapFix User'}</strong>
                            <small class="text-muted" style="margin-bottom:0.2rem;">${user.email}</small>
                            <span class="badge" style="background:#e2e8f0; color:#475569; font-size:0.75rem; padding:2px 6px; border-radius:4px;">${role.toUpperCase()}</span>
                        </div>
                        <a href="#" id="nav-logout" style="padding: 0.75rem 1rem; text-decoration: none; color: var(--text-color); display: block; text-align: center; font-weight: bold; color: var(--danger-color);">Logout</a>
                    `;
                    if (navDropdown) {
                        navDropdown.innerHTML = dropHtml;
                        navProfileMenu.addEventListener('click', (e) => {
                            e.stopPropagation();
                            navDropdown.style.display = navDropdown.style.display === 'flex' ? 'none' : 'flex';
                        });
                        document.addEventListener('click', (e) => {
                            if (!navProfileMenu.contains(e.target)) {
                                navDropdown.style.display = 'none';
                            }
                        });
                        
                        const logoutBtn = document.getElementById('nav-logout');
                        if (logoutBtn) {
                            logoutBtn.addEventListener('click', (e) => {
                                e.preventDefault();
                                auth.signOut().then(() => {
                                    window.location.href = '/login';
                                });
                            });
                        }
                    }

                    if (path === '/dashboard' && role === 'citizen') {
                        loadDashboardComplaints(user);
                    }
                    
                } catch (e) {
                    console.error("Failed to fetch user role", e);
                } finally {
                    const mainContent = document.querySelector('main') || document.querySelector('.container');
                    if (mainContent) {
                        mainContent.style.visibility = 'visible';
                        mainContent.style.opacity = '1';
                    }
                }
            }

        } else {
            // User is signed out
            if (requiresAuth) {
                // Use replace() to avoid polluting the history stack.
                // This ensures hitting 'Back' from the login page returns them 
                // to the public page they were on before, not the protected page.
                const nextUrl = encodeURIComponent(window.location.pathname);
                window.location.replace('/login?next=' + nextUrl);
                return;
            }

            if (path === '/verify') {
                window.location.href = '/login';
                return;
            }
            
            navLinks.innerHTML = `
                <a href="/public">Public Wall</a>
                <a href="/login">Login</a>
                <a href="/register" class="btn btn-primary">Register</a>
            `;

            // Check URL for prefilled verified email
            if (path === '/login') {
                const urlParams = new URLSearchParams(window.location.search);
                const verifiedEmail = urlParams.get('verified_email');
                if (verifiedEmail) {
                    showSuccess('login-error', "Email verified successfully. Please enter your password to continue.");
                    // Change success color logic temporarily by using the success class
                    const loginErrEl = document.getElementById('login-error');
                    loginErrEl.className = 'alert alert-success';
                    
                    const emailInput = document.getElementById('email');
                    if (emailInput) {
                        emailInput.value = verifiedEmail;
                        emailInput.readOnly = true; // Optional: prevent changing it
                        document.getElementById('password').focus();
                    }
                }
            }
        }
    });

    // BFCache (Back/Forward Cache) Revalidation
    window.addEventListener('pageshow', (event) => {
        if (event.persisted && requiresAuth) {
            window.location.reload();
        }
    });

    // --- VERIFY PAGE LOGIC ---
    const btnCheckVerify = document.getElementById('btn-check-verify');
    if (btnCheckVerify) {
        btnCheckVerify.addEventListener('click', () => {
            const user = auth.currentUser;
            if (!user) return;

            hideMessages('verify');
            setLoading('btn-check-verify', true);

            // Force reload the user to get latest verification status
            user.reload().then(() => {
                // Note: user.reload() doesn't change the currentUser reference, 
                // but updates its properties. We check auth.currentUser again to be safe.
                const updatedUser = auth.currentUser;
                if (updatedUser.emailVerified) {
                    // Success! The onAuthStateChanged listener will catch this change 
                    // and redirect to login, but we can also trigger it manually if needed.
                    // Wait, reload() doesn't always trigger onAuthStateChanged. Let's trigger manually:
                    auth.signOut().then(() => {
                        window.location.href = '/login?verified_email=' + encodeURIComponent(updatedUser.email);
                    });
                } else {
                    showError('verify-error', "Your email is not verified yet. Please click the verification link in your email.");
                    setLoading('btn-check-verify', false);
                }
            }).catch(error => {
                showError('verify-error', error.message);
                setLoading('btn-check-verify', false);
            });
        });
    }

    const btnResendVerify = document.getElementById('btn-resend-verify');
    if (btnResendVerify) {
        btnResendVerify.addEventListener('click', () => {
            const user = auth.currentUser;
            if (!user) return;

            hideMessages('verify');
            setLoading('btn-resend-verify', true);

            user.sendEmailVerification().then(() => {
                showSuccess('verify-success', "Verification email sent successfully!");
                // Prevent rapid clicks
                setTimeout(() => {
                    setLoading('btn-resend-verify', false);
                }, 10000); // disable for 10 seconds
            }).catch(error => {
                showError('verify-error', error.message);
                setLoading('btn-resend-verify', false);
            });
        });
    }

    const btnBackLogin = document.getElementById('btn-back-login');
    if (btnBackLogin) {
        btnBackLogin.addEventListener('click', (e) => {
            e.preventDefault();
            auth.signOut().then(() => {
                window.location.href = '/login';
            });
        });
    }

    // --- LOGIN FORM LOGIC ---
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const loginErrEl = document.getElementById('login-error');
            loginErrEl.className = 'alert alert-error'; // Reset to error class in case it was success
            loginErrEl.style.display = 'none';

            setLoading('login-btn', true);
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            auth.signInWithEmailAndPassword(email, password)
                .catch(error => {
                    showError('login-error', error.message);
                    setLoading('login-btn', false);
                });
        });
    }

    // --- REGISTER FORM LOGIC ---
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            hideMessages('register');
            
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirm-password').value;
            
            if (password !== confirmPassword) {
                showError('register-error', "Passwords do not match.");
                return;
            }
            
            setLoading('register-btn', true);
            
            auth.createUserWithEmailAndPassword(email, password)
                .then((userCredential) => {
                    return userCredential.user.updateProfile({
                        displayName: name
                    }).then(() => {
                        return userCredential.user.sendEmailVerification()
                            .catch(err => {
                                console.warn("First verification email attempt failed. Retrying...", err);
                                // Firebase sometimes drops the first verification email immediately after signup
                                return new Promise(resolve => setTimeout(resolve, 2000)).then(() => {
                                    return userCredential.user.sendEmailVerification();
                                });
                            });
                    });
                })
                .then(() => {
                    // Do NOT sign out. Keep signed in, they will be redirected to /verify
                    // by the onAuthStateChanged listener automatically since emailVerified is false.
                })
                .catch(error => {
                    showError('register-error', error.message);
                    setLoading('register-btn', false);
                });
        });
    }

    // --- DASHBOARD API FETCH ---
    window.confirmComplaint = async function(complaintId) {
        if (!confirm("Are you sure this issue has been resolved?")) return;
        const user = auth.currentUser;
        if (!user) return;
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/complaints/${complaintId}/confirm`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!res.ok) throw new Error("Failed to confirm");
            alert("Thank you! The complaint is now closed.");
            loadDashboardComplaints(user);
        } catch(err) { alert(err.message); }
    };

    window.rejectComplaint = async function(complaintId) {
        if (!confirm("Are you sure the issue is NOT resolved? This will reopen the complaint.")) return;
        const user = auth.currentUser;
        if (!user) return;
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/complaints/${complaintId}/reject`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!res.ok) throw new Error("Failed to reject");
            alert("Complaint has been reopened for further action.");
            loadDashboardComplaints(user);
        } catch(err) { alert(err.message); }
    };

    window.deleteComplaint = async function(complaintId) {
        if (!confirm("Are you sure you want to delete this complaint? This action cannot be undone.")) return;
        const user = auth.currentUser;
        if (!user) return;
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/complaints/${complaintId}`, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!res.ok) throw new Error("Failed to delete complaint. It may already be assigned.");
            loadDashboardComplaints(user);
        } catch(err) { alert(err.message); }
    };

    window.currentDashboardComplaints = [];
    window.currentEditComplaintId = null;

    window.editComplaint = function(complaintId) {
        const c = window.currentDashboardComplaints.find(x => x.id === complaintId);
        if (!c) return;
        window.currentEditComplaintId = complaintId;
        
        const descInput = document.getElementById('edit-complaint-desc');
        if (descInput) {
            descInput.value = c.description || '';
            document.getElementById('edit-complaint-modal').style.display = 'flex';
        }
    };

    window.closeEditModal = function() {
        const modal = document.getElementById('edit-complaint-modal');
        if (modal) modal.style.display = 'none';
        window.currentEditComplaintId = null;
    };

    window.saveComplaintEdit = async function() {
        if (!window.currentEditComplaintId) return;
        const newDesc = document.getElementById('edit-complaint-desc').value;
        const c = window.currentDashboardComplaints.find(x => x.id === window.currentEditComplaintId);
        if (newDesc.trim() === "" || (c && newDesc === c.description)) {
            closeEditModal();
            return;
        }
        
        const btn = document.getElementById('btn-save-edit');
        if (btn) { btn.disabled = true; btn.innerText = 'Saving...'; }
        
        const user = auth.currentUser;
        if (!user) return;
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/complaints/${window.currentEditComplaintId}`, {
                method: 'PUT',
                headers: { 
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ description: newDesc.trim() })
            });
            if (!res.ok) throw new Error("Failed to edit complaint. It may already be assigned or verified.");
            
            closeEditModal();
            loadDashboardComplaints(user);
        } catch(err) { 
            alert(err.message); 
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = 'Save Changes'; }
        }
    };

    async function loadDashboardComplaints(user) {
        const listEl = document.getElementById('complaints-list');
        if (!listEl) return;

        listEl.innerHTML = '<p class="text-muted">Loading complaints...</p>';

        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/complaints/me', {
                headers: { 'Authorization': 'Bearer ' + token }
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(`Failed to fetch complaints (Status: ${response.status}): ${errData.error || response.statusText}`);
            }

            const complaints = await response.json();
            window.currentDashboardComplaints = complaints;

            if (complaints.length === 0) {
                listEl.innerHTML = `
                    <div style="text-align: center; padding: 2rem 0;">
                        <p class="text-muted" style="margin-bottom: 1rem;">You haven't reported any civic issues yet.</p>
                        <p>No complaints yet</p>
                    </div>
                `;
                return;
            }

            let html = '<div class="complaints-grid" style="display: grid; gap: 1rem;">';
            complaints.forEach(c => {
                const date = new Date(c.created_at).toLocaleDateString();
                const dept = c.department || 'General Services';
                const priority = c.priority_score || 0;
                const supporters = c.support_count || 1;
                
                html += `
                    <div class="card" style="padding: 1.5rem; border: 1px solid var(--border-color); border-radius: var(--radius);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                            <span style="font-weight: bold; color: var(--primary-color)">${c.category}</span>
                            <span style="background: #e2e8f0; padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.85rem;">${c.status.toUpperCase()}</span>
                        </div>
                        <h4 style="margin-bottom: 0.5rem;">${c.description || 'No description provided'}</h4>
                        <p class="text-muted" style="font-size: 0.9rem; margin-bottom: 0.5rem;">📍 ${c.location_text || c.location || 'Unknown location'}</p>
                        
                        <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem; align-items: center; flex-wrap: wrap;">
                            <span style="background: #f1f5f9; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem;">🏢 ${dept}</span>
                            <span style="background: #f1f5f9; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem;">👍 ${supporters} Supporters</span>
                            
                            <details style="background: #fef3c7; color: #b45309; border-radius: 4px; font-size: 0.8rem; border: 1px solid #fde68a;">
                                <summary style="padding: 0.2rem 0.5rem; cursor: pointer; font-weight: bold; list-style-type: none;">🔥 Priority: ${priority} ▾</summary>
                                ${c.priority_breakdown ? `
                                <div style="padding: 0.5rem; border-top: 1px solid #fde68a; font-family: monospace;">
                                    Severity: +${c.priority_breakdown.severity}<br>
                                    Evidence: +${c.priority_breakdown.evidence}<br>
                                    Support : +${c.priority_breakdown.support}<br>
                                    Age     : +${c.priority_breakdown.age}<br>
                                    Reopens : +${c.priority_breakdown.reopens}<br>
                                    <hr style="margin: 4px 0; border-color: #fcd34d;">
                                    Total   : ${c.priority_breakdown.total}
                                </div>
                                ` : ''}
                            </details>
                        </div>
                        
                        ${c.status === 'completed' ? `
                        <div style="background: #ecfdf5; border: 1px solid #10b981; padding: 1rem; border-radius: 4px; margin-bottom: 1rem;">
                            <p style="color: #047857; font-weight: bold; margin-bottom: 0.5rem;">The assigned worker marked this as Completed.</p>
                            ${c.proof_image_url ? `<p style="margin-bottom: 1rem;"><a href="${c.proof_image_url}" target="_blank" style="text-decoration: underline; color: #047857;">View Proof Photo</a></p>` : ''}
                            <div style="display: flex; gap: 1rem;">
                                <button class="btn btn-primary btn-sm" onclick="confirmComplaint('${c.id}')">Yes, it's resolved</button>
                                <button class="btn btn-secondary btn-sm" onclick="rejectComplaint('${c.id}')">No, it's not resolved</button>
                            </div>
                        </div>
                        ` : ''}
                        
                        ${c.status === 'pending_verification' ? `
                        <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
                            <button class="btn btn-secondary btn-sm" onclick="editComplaint('${c.id}')">Edit</button>
                            <button class="btn btn-secondary btn-sm" style="color: var(--danger-color); border-color: var(--danger-color);" onclick="deleteComplaint('${c.id}')">Delete</button>
                        </div>
                        ` : `
                        <div style="margin-bottom: 1rem;">
                            <span class="text-muted" style="font-size: 0.85rem;">(Editing blocked: Worker assigned or status progressed)</span>
                        </div>
                        `}

                        <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--text-muted); border-top: 1px solid var(--border-color); padding-top: 0.5rem;">
                            <span>ID: ${c.id.substring(0, 8)}...</span>
                            <span>Reported: ${date}</span>
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
                                        <div style="font-size: 0.85rem;">By: ${h.actor_role.replace('_', ' ')}</div>
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
            console.error("Dashboard error:", error);
            listEl.innerHTML = `
                <div class="alert alert-error" style="margin-bottom: 0;">
                    <p>Unable to load your complaints.</p>
                    <button onclick="window.location.reload()" class="btn btn-secondary btn-sm" style="margin-top: 0.5rem;">Try Again</button>
                </div>
            `;
        }
    }


    const forgotPasswordLink = document.getElementById('forgot-password-link');
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', async (e) => {
            e.preventDefault();
            let currentEmail = document.getElementById('email')?.value || '';
            
            try {
                const email = await window.SnapFixModal.prompt(
                    "Reset Password",
                    "Enter your email address to receive a password reset link:",
                    currentEmail
                );
                
                if (!email) return; // cancelled or empty
                
                await auth.sendPasswordResetEmail(email.trim());
                if (window.SnapFixToast) {
                    window.SnapFixToast.show("Password reset email sent. Please check your inbox.", "success");
                } else {
                    showSuccess('login-error', "Password reset email sent. Please check your inbox.");
                    const loginErrEl = document.getElementById('login-error');
                    if (loginErrEl) loginErrEl.className = 'alert alert-success';
                }
            } catch (error) {
                if (window.SnapFixToast) {
                    window.SnapFixToast.show(error.message, "error");
                } else {
                    showError('login-error', error.message);
                }
            }
        });
    }

});
