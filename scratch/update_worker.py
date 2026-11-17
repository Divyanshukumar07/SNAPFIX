import re

with open('static/js/worker.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_html = """                html += `
                    <div class="sf-card">
                        <div class="sf-card-header">
                            <span class="sf-card-id">${c.report_id || c.id.substring(0,8)}</span>
                            <div class="sf-badge ${badgeClass}"><span class="sf-badge-dot"></span>${c.status.toUpperCase()}</div>
                        </div>
                        
                        <h4 class="sf-card-title">${c.category}</h4>
                        <p style="margin: 0 0 1.25rem 0; word-break: break-word; font-size: 0.95rem; color: var(--text-main);">${c.description}</p>
                        
                        <div class="sf-card-meta">
                            <div class="sf-meta-item">
                                <svg class="sf-meta-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                                <span class="sf-meta-text">${c.location_text}</span>
                            </div>
                            <div class="sf-meta-item">
                                <svg class="sf-meta-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                <span class="sf-meta-text">${window.formatIST(c.created_at)}</span>
                            </div>
                        </div>
                        
                        ${c.image_url ? `<p style="margin-bottom: 1rem;"><a href="${c.image_url}" target="_blank" style="color: var(--primary-color); text-decoration: underline; font-size: 0.9rem;">View Issue Photo 📸</a></p>` : ''}
                        
                        ${c.expected_completion_deadline ? (function() {
                            const dl = window.formatDeadline(c.expected_completion_deadline);
                            return dl ? `<div style="margin-bottom: 1rem; background: ${dl.bg}; color: ${dl.color}; padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 600; border-left: 3px solid ${dl.color};">Deadline: ${dl.formatted} (${dl.status})</div>` : '';
                        })() : ''}
                        
                        ${actionHtml}
                    </div>
                `;"""

new_html = """                html += `
                    <div class="data-row">
                        <div class="data-row-main">
                            <div style="display: flex; gap: var(--space-4); align-items: baseline; margin-bottom: var(--space-2);">
                                <span class="font-mono" style="font-weight: 700; color: var(--sf-primary);">${c.report_id || c.id.substring(0,8)}</span>
                                <h4 style="margin: 0; flex: 1;">${c.category}</h4>
                                <span class="status-flag status-${c.status}">\${c.status.replace('_', ' ').toUpperCase()}</span>
                            </div>
                            
                            <p style="margin-bottom: var(--space-2); color: var(--sf-text-main); font-size: 1rem;">${c.description}</p>
                            
                            <div class="data-row-meta">
                                <span>📍 ${c.location_text}</span>
                                <span>📅 ${window.formatIST(c.created_at)}</span>
                            </div>
                            
                            \${c.image_url ? \`<p style="margin-top: var(--space-2);"><a href="\${c.image_url}" target="_blank" style="color: var(--sf-primary); text-decoration: underline; font-weight: 600; font-size: 0.875rem;">View Issue Photo 📸</a></p>\` : ''}
                            
                            \${c.expected_completion_deadline ? (function() {
                                const dl = window.formatDeadline(c.expected_completion_deadline);
                                return dl ? \`<div style="margin-top: var(--space-2); font-size: 0.875rem; color: \${dl.color}; font-weight: 600;">Deadline: \${dl.formatted} (\${dl.status})</div>\` : '';
                            })() : ''}
                            
                            <div style="margin-top: var(--space-4);">
                                ${actionHtml}
                            </div>
                        </div>
                        <div class="data-row-actions">
                            <a href="/complaints/\${c.id}" class="btn btn-secondary btn-sm">View Details &rarr;</a>
                        </div>
                    </div>
                `;"""

if old_html in content:
    content = content.replace(old_html, new_html)
    print("Replaced successfully.")
else:
    print("Could not find old_html")

with open('static/js/worker.js', 'w', encoding='utf-8') as f:
    f.write(content)
