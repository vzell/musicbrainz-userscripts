"""Why is the ⏱ toggle missing on one place-performances-filtered page but not another?

Compares the three captured snapshots on every input
_initMsLengthColHeaderToggle() actually reads.
"""
import re

TBL = re.compile(r'<table[^>]*class="[^"]*\btbl\b')
FILES = [
    ('debug/place-performances-final.html', 'place-performances (works)'),
    ('debug/recording-location.html', 'place-performances-filtered, 398 rows (BROKEN)'),
    ('debug/shooting-location.html', 'place-performances-filtered, 1 row (works)'),
]

for path, note in FILES:
    html = open(path, encoding='utf-8', errors='replace').read()
    n_btn = len(re.findall(r'mb-ms-col-hdr-btn', html))
    n_ms = len(re.findall(r'data-mb-ms=', html))
    n_shown = len(re.findall(r'data-mb-ms-shown=', html))
    n_tbl = len(TBL.findall(html))
    cols = re.findall(r'data-col-name="([^"]*)"', html)
    print(f'=== {path}')
    print(f'    {note}  ({len(html)} bytes)')
    print(f'    mb-ms-col-hdr-btn : {n_btn}')
    print(f'    data-mb-ms cells  : {n_ms}')
    print(f'    data-mb-ms-shown  : {n_shown}')
    print(f'    table.tbl         : {n_tbl}')
    print(f'    columns ({len(cols)}) : {cols[:26]}')
    print(f'    has "Length" col  : {"Length" in cols}')
    i = html.find('data-col-name="Length"')
    if i != -1:
        start = html.rfind('<th', 0, i)
        print(f'    Length <th>       : {html[start:start + 300]!r}')
    print()
