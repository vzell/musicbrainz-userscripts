"""What does a native release-page tracklist row look like (pre-surgery)?

Determines safe selectors for stamping data-mb-ms onto the Length <td>.
"""
import re

html = open('tests/snapshots/release-tracks/raw.html', encoding='utf-8', errors='replace').read()

m = re.search(r'<table[^>]*class="[^"]*\btbl\b[^"]*"[^>]*>(.*?)</table>', html, re.S)
tbl = m.group(1)
head = re.search(r'<thead.*?</thead>', tbl, re.S)
ths = re.findall(r'<th[^>]*>(.*?)</th>', head.group(0), re.S)
print('native <th> texts:', [re.sub(r'<[^>]+>', '', t).strip()[:20] for t in ths])

rows = re.findall(r'<tr[^>]*>(.*?)</tr>', tbl[tbl.index('<tbody'):], re.S)
for i, r in enumerate(rows[:2]):
    print(f'\n--- row {i} ---')
    for j, td in enumerate(re.findall(r'<t[dh][^>]*>.*?</t[dh]>', r, re.S)):
        print(f'  [{j}] {td[:300]}')
