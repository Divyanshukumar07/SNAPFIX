document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        console.error("Complaint UI: Firebase not loaded.");
        return;
    }

    const auth = firebase.auth();
    // Removed firebase.storage() for Cloudinary backend migration

    const form = document.getElementById('complaint-form');
    const btnSubmit = document.getElementById('btn-submit');
    const errEl = document.getElementById('complaint-error');
    const sucEl = document.getElementById('complaint-success');
    
    const btnGetLocation = document.getElementById('btn-get-location');
    const locStatus = document.getElementById('location-status');
    const latInput = document.getElementById('location_lat');
    const lngInput = document.getElementById('location_lng');

    const duplicatesContainer = document.getElementById('duplicates-container');
    const duplicatesList = document.getElementById('duplicates-list');
    const btnContinueSubmit = document.getElementById('btn-continue-submit');

    // State
    let isBypassingDuplicateCheck = false;

    function showError(msg) {
        errEl.innerText = msg;
        errEl.style.display = 'block';
        sucEl.style.display = 'none';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function showSuccess(msg) {
        sucEl.innerText = msg;
        sucEl.style.display = 'block';
        errEl.style.display = 'none';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function setLoading(isLoading, text = 'Loading...') {
        if (isLoading) {
            btnSubmit.dataset.originalText = btnSubmit.innerText;
            btnSubmit.innerText = text;
            btnSubmit.disabled = true;
        } else {
            btnSubmit.innerText = btnSubmit.dataset.originalText || 'Submit Complaint';
            btnSubmit.disabled = false;
        }
    }

    if (btnGetLocation) {
        btnGetLocation.addEventListener('click', () => {
            if (!navigator.geolocation) {
                locStatus.innerText = "Geolocation is not supported by your browser";
                return;
            }
            
            btnGetLocation.disabled = true;
            locStatus.innerText = "Locating...";

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    latInput.value = position.coords.latitude;
                    lngInput.value = position.coords.longitude;
                    locStatus.innerText = `Found! (${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)})`;
                    locStatus.style.color = 'green';
                    btnGetLocation.disabled = false;
                },
                (error) => {
                    locStatus.innerText = "Unable to retrieve your location.";
                    locStatus.style.color = 'red';
                    btnGetLocation.disabled = false;
                    console.warn(error);
                }
            );
        });
    }

    // Expose support function globally for inline button clicks
    window.supportComplaint = async function(complaintId) {
        const user = auth.currentUser;
        if (!user) return;
        
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/complaints/${complaintId}/support`, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + token
                }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to support complaint");
            
            duplicatesContainer.style.display = 'none';
            form.style.display = 'none';
            showSuccess("Thank you! You have successfully supported an existing complaint instead of creating a duplicate.");
            
            setTimeout(() => { window.location.href = '/dashboard'; }, 3000);
        } catch(err) {
            alert(err.message);
        }
    };

    if (btnContinueSubmit) {
        btnContinueSubmit.addEventListener('click', () => {
            duplicatesContainer.style.display = 'none';
            isBypassingDuplicateCheck = true;
            // Trigger form submission again, bypassing the check
            form.dispatchEvent(new Event('submit'));
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            errEl.style.display = 'none';
            sucEl.style.display = 'none';

            const user = auth.currentUser;
            if (!user) {
                showError("You must be logged in to submit a complaint.");
                return;
            }

            if (!user.emailVerified) {
                showError("Please verify your email before submitting complaints.");
                return;
            }

            const category = document.getElementById('category').value;
            const description = document.getElementById('description').value;
            const location_text = document.getElementById('location_text').value;
            const lat = parseFloat(latInput.value) || null;
            const lng = parseFloat(lngInput.value) || null;
            const evidenceFile = document.getElementById('evidence').files[0];

            if (!category || !description || !location_text) {
                showError("Please fill out all required fields.");
                return;
            }

            // --- MILESTONE 2: Duplicate Checking ---
            if (!isBypassingDuplicateCheck) {
                setLoading(true, 'Checking for duplicates...');
                try {
                    const checkRes = await fetch('/api/complaints/check_duplicate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ category, location_lat: lat, location_lng: lng })
                    });
                    
                    if (checkRes.ok) {
                        const duplicates = await checkRes.json();
                        if (duplicates.length > 0) {
                            // Show duplicates UI
                            let html = '';
                            duplicates.forEach(d => {
                                html += `
                                    <div class="card" style="margin-bottom: 1rem; border-color: #f59e0b;">
                                        <h4 style="margin-bottom: 0.5rem;">${d.category} - ${d.location_text}</h4>
                                        <p class="text-muted" style="margin-bottom: 0.5rem;">Status: ${d.status} | Supporters: ${d.support_count}</p>
                                        <p style="margin-bottom: 1rem; font-size: 0.9rem;">${d.description}</p>
                                        <button type="button" class="btn btn-secondary btn-sm" onclick="window.supportComplaint('${d.id}')">
                                            Support This Complaint
                                        </button>
                                    </div>
                                `;
                            });
                            duplicatesList.innerHTML = html;
                            duplicatesContainer.style.display = 'block';
                            setLoading(false);
                            return; // Stop submission until user decides
                        }
                    }
                } catch(err) {
                    console.warn("Duplicate check failed, proceeding anyway", err);
                }
            }

            // --- PROCEED WITH SUBMISSION ---
            try {
                let imageUrl = "";

                if (evidenceFile) {
                    setLoading(true, 'Uploading Image...');
                    const formData = new FormData();
                    formData.append('image', evidenceFile);
                    formData.append('folder', `smart-city/complaints/${user.uid}`);
                    
                    const token = await user.getIdToken();
                    const uploadRes = await fetch('/api/upload_image', {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + token
                        },
                        body: formData
                    });
                    
                    const uploadData = await uploadRes.json();
                    if (!uploadRes.ok) {
                        throw new Error(uploadData.error || "Failed to upload image securely.");
                    }
                    
                    imageUrl = uploadData.url;
                }

                setLoading(true, 'Submitting Complaint...');
                const token = await user.getIdToken();
                const payload = {
                    category: category,
                    description: description,
                    location_text: location_text,
                    location_lat: lat,
                    location_lng: lng,
                    image_url: imageUrl
                };

                const response = await fetch('/api/complaints', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.error || "Failed to submit complaint.");
                }

                const result = await response.json();

                form.reset();
                locStatus.innerText = "";
                isBypassingDuplicateCheck = false; // reset
                showSuccess(`Complaint submitted successfully! ID: ${result.id}. You can track it in your dashboard.`);
                
                setTimeout(() => { window.location.href = '/dashboard'; }, 3000);

            } catch (error) {
                console.error("Submission error:", error);
                showError(error.message || "An unexpected error occurred.");
            } finally {
                setLoading(false);
            }
        });
    }
});
