import re

with open('templates/public.html', 'r', encoding='utf-8') as f:
    content = f.read()

old_header = """<div class="sf-page-header">
    <div class="sf-header-content">
        <span class="sf-eyebrow">Public Wall</span>
        <h1 class="sf-page-title">Civic Accountability Board</h1>
        <p class="sf-page-subtitle">View, track, and support infrastructure issues raised by the community. Every action is recorded on an immutable timeline.</p>
    </div>
    <div class="sf-header-stats">
        <div class="sf-stat">
            <span class="sf-stat-value" id="stat-total">-</span>
            <span class="sf-stat-label">Issues Reported</span>
        </div>
        <div class="sf-stat">
            <span class="sf-stat-value" id="stat-resolved">-</span>
            <span class="sf-stat-label">Resolved</span>
        </div>
    </div>
</div>"""

new_header = """<div class="page-header">
    <div>
        <p class="text-muted font-mono" style="margin-bottom: var(--space-2); font-size: 0.875rem;">PUBLIC WALL</p>
        <h1>Civic Accountability Board</h1>
        <p class="text-muted">View, track, and support infrastructure issues raised by the community. Every action is recorded on an immutable timeline.</p>
    </div>
</div>

<div class="grid-metrics">
    <div class="metric-box metric-primary">
        <div class="metric-label">Issues Reported</div>
        <div class="metric-value" id="stat-total">-</div>
    </div>
    <div class="metric-box metric-success">
        <div class="metric-label">Resolved</div>
        <div class="metric-value" id="stat-resolved">-</div>
    </div>
</div>"""

content = content.replace(old_header, new_header)

old_card = """        html += `
            <div class="sf-card">
                <div class="sf-card-header">
                    <span class="sf-card-id">${c.report_id || c.id.substring(0,8) + '...'}</span>
                    <div class="sf-badge ${badgeClass}"><span class="sf-badge-dot"></span>${statusText}</div>
                </div>
                
                <h4 class="sf-card-title">${c.description || 'No description'}</h4>
                
                <div class="sf-card-meta">
                    <div class="sf-meta-item">
                        <svg class="sf-meta-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                        <span class="sf-meta-text">${(c.location_locality ? c.location_locality + ', ' : '')}${c.location_text || ''}</span>
                    </div>
                    <div class="sf-meta-item">
                        <svg class="sf-meta-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><path d="M9 22v-4h6v4"></path><path d="M8 6h.01"></path><path d="M16 6h.01"></path><path d="M12 6h.01"></path><path d="M12 10h.01"></path><path d="M12 14h.01"></path><path d="M16 10h.01"></path><path d="M16 14h.01"></path><path d="M8 10h.01"></path><path d="M8 14h.01"></path></svg>
                        <span class="sf-meta-text">${c.category}</span>
                    </div>
                    <div class="sf-meta-item">
                        <svg class="sf-meta-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        <span class="sf-meta-text">${date}</span>
                    </div>
                </div>
                
                <div class="sf-card-footer">
                    ${supportBtnHtml}
                    <button class="sf-btn-view" onclick="openDetails('${c.id}')">
                        View Details <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"></path></svg>
                    </button>
                </div>
            </div>
        `;"""

new_card = """        html += `
            <div class="data-row">
                <div class="data-row-main">
                    <div style="display: flex; gap: var(--space-4); align-items: baseline; margin-bottom: var(--space-2);">
                        <span class="font-mono" style="font-weight: 700; color: var(--sf-primary);">${c.report_id || c.id.substring(0,8)}</span>
                        <h4 style="margin: 0; flex: 1;">${c.category}</h4>
                        <span class="status-flag status-\${rawStatus}">\${statusText}</span>
                    </div>
                    
                    <p style="margin-bottom: var(--space-2); color: var(--sf-text-main); font-size: 1rem;">${c.description}</p>
                    
                    <div class="data-row-meta">
                        <span>📍 ${(c.location_locality ? c.location_locality + ', ' : '')}${c.location_text || ''}</span>
                        <span>📅 ${date}</span>
                    </div>
                    
                    <div style="margin-top: var(--space-4);">
                        ${supportBtnHtml}
                    </div>
                </div>
                <div class="data-row-actions">
                    <button class="btn btn-secondary btn-sm" onclick="openDetails('${c.id}')">View Details &rarr;</button>
                </div>
            </div>
        `;"""

content = content.replace(old_card, new_card)
content = content.replace('class="sf-grid"', 'class="data-list"')
content = content.replace('class="sf-tabs-container"', 'class="surface-header" style="display: flex; gap: var(--space-2); margin-bottom: var(--space-4); border-bottom: 0;"')
content = content.replace('class="sf-tab active"', 'class="btn btn-primary btn-sm active"')
content = content.replace('class="sf-tab"', 'class="btn btn-secondary btn-sm"')

with open('templates/public.html', 'w', encoding='utf-8') as f:
    f.write(content)
