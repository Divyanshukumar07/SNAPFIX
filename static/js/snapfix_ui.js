// SnapFix UI Standard Library

window.SnapFixToast = {
    show: function(message, type = 'info') {
        const container = document.getElementById('snapfix-toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.style.padding = '0.75rem 1.25rem';
        toast.style.borderRadius = '8px';
        toast.style.color = '#fff';
        toast.style.fontSize = '0.9rem';
        toast.style.fontWeight = '500';
        toast.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)';
        toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.pointerEvents = 'auto';
        toast.innerText = message;
        
        if (type === 'success') {
            toast.style.background = 'var(--success-color, #10b981)';
        } else if (type === 'error') {
            toast.style.background = 'var(--danger-color, #ef4444)';
        } else if (type === 'warning') {
            toast.style.background = '#f59e0b';
        } else {
            toast.style.background = '#3b82f6';
        }
        
        container.appendChild(toast);
        
        // Animate in
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });
        
        // Remove after 3 seconds
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => {
                if (container.contains(toast)) {
                    container.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }
};

window.SnapFixModal = {
    _resolve: null,
    
    _init: function() {
        const confirmBtn = document.getElementById('snapfix-modal-confirm');
        const cancelBtn = document.getElementById('snapfix-modal-cancel');
        
        // Remove old listeners to prevent memory leaks if called multiple times
        const newConfirm = confirmBtn.cloneNode(true);
        const newCancel = cancelBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
        cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
        
        newConfirm.addEventListener('click', () => {
            if (this._resolve) {
                const inputEl = document.getElementById('snapfix-modal-input');
                const val = inputEl.style.display !== 'none' ? inputEl.value : true;
                if (inputEl.style.display !== 'none' && !val.trim() && this._requireInput) {
                    // Quick validation shake
                    inputEl.style.borderColor = 'red';
                    setTimeout(() => inputEl.style.borderColor = '', 500);
                    return;
                }
                document.getElementById('snapfix-modal-overlay').style.display = 'none';
                this._resolve(val);
                this._resolve = null;
            }
        });
        
        newCancel.addEventListener('click', () => {
            if (this._resolve) {
                document.getElementById('snapfix-modal-overlay').style.display = 'none';
                this._resolve(null);
                this._resolve = null;
            }
        });
    },

    confirm: function(title, message, confirmText = 'Confirm', destructive = false) {
        return new Promise((resolve) => {
            this._resolve = resolve;
            this._requireInput = false;
            this._init();
            
            document.getElementById('snapfix-modal-title').innerText = title;
            document.getElementById('snapfix-modal-body').innerHTML = message;
            
            const inputContainer = document.getElementById('snapfix-modal-input-container');
            const inputEl = document.getElementById('snapfix-modal-input');
            inputContainer.style.display = 'none';
            inputEl.value = '';
            
            const confirmBtn = document.getElementById('snapfix-modal-confirm');
            confirmBtn.innerText = confirmText;
            if (destructive) {
                confirmBtn.style.background = 'var(--danger-color, #ef4444)';
                confirmBtn.style.borderColor = 'var(--danger-color, #ef4444)';
            } else {
                confirmBtn.style.background = 'var(--primary-color)';
                confirmBtn.style.borderColor = 'var(--primary-color)';
            }
            
            document.getElementById('snapfix-modal-overlay').style.display = 'flex';
        });
    },
    
    prompt: function(title, message, placeholder = 'Enter details...', requireInput = true) {
        return new Promise((resolve) => {
            this._resolve = resolve;
            this._requireInput = requireInput;
            this._init();
            
            document.getElementById('snapfix-modal-title').innerText = title;
            document.getElementById('snapfix-modal-body').innerHTML = message;
            
            const inputContainer = document.getElementById('snapfix-modal-input-container');
            const inputEl = document.getElementById('snapfix-modal-input');
            inputContainer.style.display = 'block';
            inputEl.style.display = 'block';
            inputEl.placeholder = placeholder;
            inputEl.value = '';
            inputEl.style.borderColor = 'var(--border-color)';
            
            const confirmBtn = document.getElementById('snapfix-modal-confirm');
            confirmBtn.innerText = 'Submit';
            confirmBtn.style.background = 'var(--primary-color)';
            confirmBtn.style.borderColor = 'var(--primary-color)';
            
            document.getElementById('snapfix-modal-overlay').style.display = 'flex';
            setTimeout(() => inputEl.focus(), 100);
        });
    }
};

// Attachment Hover Logic
document.addEventListener('mouseover', (e) => {
    if (e.target.tagName === 'A' && e.target.href && (e.target.href.includes('cloudinary') || e.target.href.match(/\.(jpg|jpeg|png|gif)$/i))) {
        let preview = document.getElementById('snapfix-hover-preview');
        if (!preview) {
            preview = document.createElement('div');
            preview.id = 'snapfix-hover-preview';
            preview.style.position = 'fixed';
            preview.style.zIndex = '99999';
            preview.style.pointerEvents = 'none';
            preview.style.border = '2px solid white';
            preview.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)';
            preview.style.borderRadius = '8px';
            preview.style.overflow = 'hidden';
            preview.style.background = '#fff';
            preview.style.maxWidth = '250px';
            preview.style.maxHeight = '250px';
            preview.innerHTML = '<img style="display:block; max-width:100%; max-height:100%; object-fit:contain;">';
            document.body.appendChild(preview);
        }
        
        preview.querySelector('img').src = e.target.href;
        preview.style.display = 'block';
        
        const moveHandler = (ev) => {
            const previewWidth = preview.offsetWidth || 250;
            const previewHeight = preview.offsetHeight || 250;
            let left = ev.clientX + 15;
            let top = ev.clientY + 15;
            
            // Boundary detection
            if (left + previewWidth > window.innerWidth) {
                left = ev.clientX - previewWidth - 15;
            }
            if (top + previewHeight > window.innerHeight) {
                top = ev.clientY - previewHeight - 15;
            }
            
            preview.style.left = left + 'px';
            preview.style.top = top + 'px';
        };
        const outHandler = () => {
            preview.style.display = 'none';
            document.removeEventListener('mousemove', moveHandler);
            e.target.removeEventListener('mouseout', outHandler);
        };
        
        document.addEventListener('mousemove', moveHandler);
        e.target.addEventListener('mouseout', outHandler);
    }
});
