"""Check whether the NATIVE MusicBrainz work/relationship page has a Length column,
and whether jesus2099 markers are present in that snapshot."""
import re
import sys
from html import unescape

for path in sys.argv[1:]:
    try:
        html = open(path, encoding='utf-8', errors='replace').read()
    except OSError as e:
        print(f'{path}: {e}')
        continue
    print(f'=== {path} ({len(html)} bytes) ===')
    print('  jesus2099 markers:', len(re.findall(r'jesus2099|treleases|SUPER&nbsp;MIND', html)))
    # first table.tbl thead row header texts
    m = re.search(r'<table[^>]*class="[^"]*tbl[^"]*"[^>]*>(.*?)</table>', html, re.S)
    if not m:
        print('  no table.tbl found')
        continue
    tbl = m.group(1)
    head = re.search(r'<thead.*?</thead>', tbl, re.S)
    scope = head.group(0) if head else tbl[:4000]
    ths = re.findall(r'<th[^>]*>(.*?)</th>', scope, re.S)
    print('  th texts:', [unescape(re.sub(r'<[^>]+>', '', t)).strip()[:30] for t in ths[:15]])
    ms = re.findall(r'\b\d{1,2}:\d{2}\.\d{3}\b', html)
    print(f'  M:SS.mmm: {len(ms)} {ms[:5]}')
    bare = re.findall(r'>(\d{1,2}:\d{2})<', html)
    print(f'  bare M:SS: {len(bare)} {bare[:5]}')
