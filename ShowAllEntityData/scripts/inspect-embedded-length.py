"""Look for embedded JSON carrying millisecond track/recording lengths in snapshots."""
import json
import re
import sys

pat_script = re.compile(r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', re.S)

for path in sys.argv[1:]:
    try:
        html = open(path, encoding='utf-8', errors='replace').read()
    except OSError as e:
        print(f'{path}: {e}')
        continue
    blobs = pat_script.findall(html)
    print(f'=== {path} ({len(html)} bytes) — {len(blobs)} application/json script(s) ===')
    hits = 0
    for b in blobs:
        if '"length"' not in b:
            continue
        try:
            data = json.loads(b)
        except Exception:
            continue
        found = []
        def walk(o, depth=0):
            if depth > 6 or len(found) > 4:
                return
            if isinstance(o, dict):
                if 'length' in o and isinstance(o['length'], (int, float)):
                    found.append({k: o[k] for k in ('name', 'title', 'number', 'length', 'position') if k in o})
                for v in o.values():
                    walk(v, depth + 1)
            elif isinstance(o, list):
                for v in o[:20]:
                    walk(v, depth + 1)
        walk(data)
        if found:
            hits += 1
            print('  numeric-length objects:', json.dumps(found[:4])[:400])
    if not hits:
        # raw grep for a plausible ms integer near "length"
        for m in list(re.finditer(r'"length"\s*:\s*(\d{4,7})', html))[:5]:
            print('  raw "length": ms =', m.group(1))
