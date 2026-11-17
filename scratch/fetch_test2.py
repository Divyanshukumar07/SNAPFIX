import urllib.request
try:
    req = urllib.request.Request('http://localhost:5001/api/admin/complaints')
    print(urllib.request.urlopen(req).read().decode('utf-8'))
except Exception as e:
    print("ERROR:", e)
    if hasattr(e, 'read'):
        print(e.read().decode('utf-8'))
