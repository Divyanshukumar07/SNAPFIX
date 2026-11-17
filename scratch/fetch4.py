import urllib.request
import json
req = urllib.request.Request('http://localhost:5000/api/admin/complaints', headers={'Authorization': 'Bearer test-token-does-not-matter'})
try:
    print(urllib.request.urlopen(req).read().decode('utf-8'))
except Exception as e:
    print(getattr(e, 'read', lambda: str(e))())
