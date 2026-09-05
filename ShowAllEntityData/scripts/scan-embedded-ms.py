"""Which debug snapshots carry MusicBrainz-embedded millisecond lengths?"""
import glob
import re

pat = re.compile(r'"length":\s*(\d{4,7})')
rows = []
for p in sorted(glob.glob('debug/*.html')) + sorted(glob.glob('tests/snapshots/*/raw.html')):
    try:
        html = open(p, encoding='utf-8', errors='replace').read()
    except OSError:
        continue
    hits = pat.findall(html)
    if hits:
        rows.append((p, len(hits), hits[:3]))
print(f'{len(rows)} file(s) with embedded ms lengths:')
for p, n, sample in rows:
    print(f'  {n:>5}  {p}   e.g. {sample}')
