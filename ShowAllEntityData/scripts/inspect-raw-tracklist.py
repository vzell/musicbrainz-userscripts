"""Map exactly where millisecond lengths live in a pristine MB release page,
and what the native Length <td> renders."""
import json
import re
import sys
from html import unescape

path = sys.argv[1]
html = open(path, encoding='utf-8', errors='replace').read()
print(f'=== {path} ({len(html)} bytes) ===')
print('jesus2099 markers:', len(re.findall(r'jesus2099|treleases', html)))

# native Length cells
cells = re.findall(r'<td[^>]*class="[^"]*treleases[^"]*"[^>]*>(.*?)</td>', html, re.S)
print('treleases td:', len(cells))
durs = re.findall(r'<td[^>]*>\s*(\d{1,2}:\d{2}(?:\.\d+)?)\s*</td>', html)
print('native duration <td> texts:', durs[:12], f'({len(durs)} total)')

# embedded JSON scripts: id + where "length" sits
for m in re.finditer(r'<script([^>]*)type="application/json"([^>]*)>(.*?)</script>', html, re.S):
    attrs = (m.group(1) + m.group(2)).strip()
    body = m.group(3)
    print(f'\n--- script {attrs[:120]} ({len(body)} bytes) ---')
    try:
        data = json.loads(body)
    except Exception as e:
        print('  unparseable:', e)
        continue
    paths = []
    def walk(o, p='$', depth=0):
        if depth > 8 or len(paths) > 40:
            return
        if isinstance(o, dict):
            if isinstance(o.get('length'), (int, float)):
                paths.append((p, {k: o[k] for k in ('name', 'number', 'position', 'length') if k in o}))
            for k, v in o.items():
                walk(v, f'{p}.{k}', depth + 1)
        elif isinstance(o, list):
            for i, v in enumerate(o[:3]):
                walk(v, f'{p}[{i}]', depth + 1)
    walk(data)
    seen = set()
    for p, obj in paths:
        key = re.sub(r'\[\d+\]', '[]', p)
        if key in seen:
            continue
        seen.add(key)
        print(f'  {key}  ->  {json.dumps(obj)[:160]}')
