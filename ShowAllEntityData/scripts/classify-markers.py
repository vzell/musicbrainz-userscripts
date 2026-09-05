"""Classify each jesus2099 marker found INSIDE our rendered tables:
does the element carry real MusicBrainz content (strip marker, keep element)
or is it pure decoration (remove element)?"""
import re
from html import unescape

html = open('debug/therising.html', encoding='utf-8', errors='replace').read()

CLASSES = [
    'treleases',
    'jesus2099userjs81127acoustids-handled',
    'jesus2099userjs81127recording',
    'jesus2099userjs81127recname',
    'jesus2099userjs81127toolzone',
    'jesus2099userjs81127editbutt',
    'jesus2099userjs81127openEdits',
    'jesus2099userjs81127recdis',
]

for cls in CLASSES:
    # match an opening tag carrying the class, then grab a slice of following markup
    pat = re.compile(r'<(\w+)([^>]*class="[^"]*' + re.escape(cls) + r'[^"]*"[^>]*)>', re.S)
    hits = pat.finditer(html)
    print(f'--- {cls}')
    for i, m in enumerate(hits):
        if i >= 2:
            break
        start = m.start()
        frag = html[start:start + 460]
        text = unescape(re.sub(r'<[^>]+>', ' ', frag)).strip()
        print(f'    <{m.group(1)}{m.group(2)[:150]}>')
        print(f'      inner-ish text: {text[:110]!r}')
    print()
