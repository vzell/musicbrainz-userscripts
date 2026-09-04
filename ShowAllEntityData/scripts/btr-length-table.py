"""Born to Run: native MB Length cell vs embedded track.length vs recording.length."""
import json
import re

html = open('debug/btr-bug.html', encoding='utf-8', errors='replace').read()
native = ['4:50', '3:12', '3:02', '6:31', '4:30', '4:31', '3:19', '9:34']  # from tests/snapshots/release-tracks/raw.html


def fmt(v):
    if v is None:
        return '?:??'
    m, s = divmod(v // 1000, 60)
    return f'{m}:{s:02d}.{v % 1000:03d}'


def rounded(v):
    if v is None:
        return '?:??'
    total = round(v / 1000)
    return f'{total // 60}:{total % 60:02d}'


for blob in re.findall(r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', html, re.S):
    if '"mediums"' not in blob:
        continue
    rel = json.loads(blob)['release']
    rows = [t for med in rel['mediums'] for t in (med.get('tracks') or [])]
    print(f'{rel["name"]!r}  ({len(rows)} tracks)\n')
    hdr = f'{"#":<4}{"title":<28}{"MB native":<11}{"track.length":<15}{"round(track)":<14}{"recording.length":<18}{"round(rec)":<12}'
    print(hdr)
    print('-' * len(hdr))
    for i, t in enumerate(rows):
        rec = t.get('recording') or {}
        nat = native[i] if i < len(native) else '?'
        mark = '' if rounded(t.get('length')) == nat else '   <-- track mismatch!'
        mark2 = '' if rounded(rec.get('length')) == nat else ' (rec would differ)'
        print(f'{t.get("number"):<4}{t.get("name")[:26]:<28}{nat:<11}'
              f'{fmt(t.get("length")):<15}{rounded(t.get("length")):<14}'
              f'{fmt(rec.get("length")):<18}{rounded(rec.get("length")):<12}{mark}{mark2}')
    break
