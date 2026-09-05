"""Is a recording's millisecond length present ANYWHERE in a work / artist-relationships /
place-performances page's own embedded data, in any shape?"""
import json
import re

TARGETS = [
    'debug/work-rec.html',
    'debug/work.recordings.html',
    'debug/work-rec-double-relationships.html',
    'debug/a-rel.html',
    'debug/rock-on-recordings.html',
]

pat = re.compile(r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', re.S)

for path in TARGETS:
    try:
        html = open(path, encoding='utf-8', errors='replace').read()
    except OSError as e:
        print(f'{path}: {e}\n')
        continue
    print(f'=== {path} ({len(html)} bytes) ===')
    blobs = pat.findall(html)
    print(f'  application/json scripts: {len(blobs)}')
    # every top-level key of every blob
    keys = []
    numeric_lengths = 0
    for b in blobs:
        try:
            d = json.loads(b)
        except Exception:
            continue
        if isinstance(d, dict):
            keys.append(sorted(d.keys())[:12])

        def walk(o, depth=0):
            global numeric_lengths
            if depth > 9:
                return
            if isinstance(o, dict):
                if isinstance(o.get('length'), (int, float)) and o['length'] > 1000:
                    numeric_lengths += 1
                for v in o.values():
                    walk(v, depth + 1)
            elif isinstance(o, list):
                for v in o:
                    walk(v, depth + 1)
        walk(d)
    for k in keys:
        print(f'    top-level keys: {k}')
    print(f'  objects with numeric length > 1000: {numeric_lengths}')
    # raw text probes for the ms integers we KNOW this work has
    for probe in ('305146', '334866', '264000', '"length"'):
        print(f'  raw contains {probe!r}: {html.count(probe)}')
    print()
