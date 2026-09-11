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
                        window.location.href = dashboardPath;
                        return;
                    }

                    // DOM Interception for Unauthorized Access
                    if (authGuard) {
                        const allowedRolesStr = authGuard.getAttribute('data-allowed-roles');
                        if (allowedRolesStr) {
                            const allowedRoles = allowedRolesStr.split(',').map(r => r.trim());
                            if (!allowedRoles.includes(role)) {
                                document.querySelector('main').innerHTML = `
                                    <div class="card" style="text-align: center; padding: 4rem 2rem; max-width: 500px; margin: 4rem auto;">
                                        <h2 style="color: var(--danger-color); margin-bottom: 1rem;">🔒 Access Restricted</h2>
                                        <p style="margin-bottom: 2rem;">You don't have permission to access this area. This section is available only to authorized users.</p>
                                        <a href="${dashboardPath}" class="btn btn-primary">Return to Dashboard</a>
                                    </div>
                                `;
                                return; // Halt further page execution
                            }
                        }
                    }

                    // Role-Aware Navigation
                    let navHtml = `<span>${user.email} (${role.toUpperCase()}) ✅</span>`;
                    
                    if (role === 'citizen') {
                        navHtml += `<a href="/dashboard">My Dashboard</a>`;
                        navHtml += `<a href="/complaints/new">Report Issue</a>`;
                    } else if (role === 'service_worker') {
                        navHtml += `<a href="/worker/dashboard">Worker Dashboard</a>`;
                    } else if (role === 'department_head') {
                        navHtml += `<a href="/admin/dashboard">Dept Dashboard</a>`;
                    } else if (['city_admin', 'main_authority'].includes(role)) {
                        navHtml += `<a href="/admin/dashboard">City Dashboard</a>`;
                        navHtml += `<a href="/admin/heatmap">Civic Map</a>`;
                    }
                    
                    navHtml += `<button id="nav-logout" class="btn btn-secondary" style="padding: 0.3rem 0.8rem; margin-left: 1rem;">Logout</button>`;
                    navLinks.innerHTML = navHtml;

                    if (path === '/dashboard' && role === 'citizen') {
                        loadDashboardComplaints(user);
                    }
                    
                } catch (e) {
                    console.error("Failed to fetch user role", e);
                }
            }

            const logoutBtn = document.getElementById('nav-logout');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', () => {
                    auth.signOut().then(() => {
                        window.location.href = '/login';
                    });
                });
            }

        } else {
            // User is signed out
            navLinks.innerHTML = `
                <a href="/login" id="nav-login">Login</a>
                <a href="/register" id="nav-register" class="btn btn-primary">Register</a>
            `;
            
            if (requiresAuth || path === '/verify') {
                window.location.href = '/login';
                return;
            }

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
                        return userCredential.user.sendEmailVerification();
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

    async function loadDashboardComplaints(user) {
        const listEl = document.getElementById('complaints-list');
        if (!listEl) return;

        listEl.innerHTML = '<p class="text-muted">Loading complaints...</p>';

        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/complaints/me', {
                headers: { 'Authorization': 'Bearer ' + token }
            });

            if (!response.ok) throw new Error("Failed to fetch complaints");

            const complaints = await response.json();

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
                        
                        <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
                            <span style="background: #f1f5f9; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem;">🏢 ${dept}</span>
                            <span style="background: #f1f5f9; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem;">👍 ${supporters} Supporters</span>
                            <span style="background: #fef3c7; color: #b45309; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem;">🔥 Priority: ${priority}</span>
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

                        <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--text-muted); border-top: 1px solid var(--border-color); padding-top: 0.5rem;">
                            <span>ID: ${c.id.substring(0, 8)}...</span>
                            <span>Reported: ${date}</span>
                        </div>
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
});
