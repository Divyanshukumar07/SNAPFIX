import re

with open('static/js/admin.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_end = """                            </div>
                        </details>
                        ` : ''}
                    </div>
                `;"""

new_end = """                            </div>
                        </details>
                        ` : ''}
                        </div> <!-- End data-row-main -->
                        <div class="data-row-actions" style="margin-left: auto;">
                            <a href="/complaint.html?id=${c.id}" class="btn btn-secondary btn-sm">View Details &rarr;</a>
                        </div>
                    </div>
                `;"""

if old_end in content:
    content = content.replace(old_end, new_end)
    print("Replaced end successfully.")
else:
    print("Could not find old_end")

with open('static/js/admin.js', 'w', encoding='utf-8') as f:
    f.write(content)
