"""What identifying keys do embedded tracks/recordings carry (for map keying)?"""
import json
import re

html = open('debug/tracklist-single-medium.html', encoding='utf-8', errors='replace').read()
for m in re.finditer(r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', html, re.S):
    body = m.group(1)
    if '"mediums"' not in body:
        continue
    data = json.loads(body)
    rel = data.get('release') or {}
    print('release keys:', sorted(rel.keys())[:25])
    print('release.gid  :', rel.get('gid'))
    print('release.length:', rel.get('length'))
    for med in (rel.get('mediums') or [])[:1]:
        print('\nmedium keys:', sorted(med.keys()))
        print('medium position:', med.get('position'), 'format:', (med.get('format') or {}).get('name') if isinstance(med.get('format'), dict) else med.get('format'))
        for tr in (med.get('tracks') or [])[:2]:
            print('\n  track keys:', sorted(tr.keys()))
            print('  track:', {k: tr.get(k) for k in ('gid', 'id', 'number', 'position', 'length', 'name')})
            rec = tr.get('recording') or {}
            print('  recording keys:', sorted(rec.keys()))
            print('  recording:', {k: rec.get(k) for k in ('gid', 'id', 'length', 'name', 'video')})
    break
