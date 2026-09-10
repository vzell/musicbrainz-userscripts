"""Count Picard DOM elements in a captured rendered.html snapshot.

Raw `grep -o` counts conflate the injected <style> block's own selector text
with real elements — GM_addStyle's rules land in the captured HTML too — so
this counts attribute occurrences inside tags instead, and reports the <style>
mentions separately so the difference is visible rather than surprising.

usage: python3 scripts/count-picard-markup.py <rendered.html> [...]
"""
import re
import sys

CLASSES = [
    'mb-picard-th',
    'mb-picard-cell',
    'mb-picard-btn',
    'mb-picard-col-hdr-btn',
    'mb-picard-col-hdr-all-label',
]

for path in sys.argv[1:]:
    html = open(path, encoding='utf-8', errors='replace').read()
    # Strip every <style>...</style> so CSS selector text cannot be counted.
    body = re.sub(r'<style\b[^>]*>.*?</style>', '', html, flags=re.S | re.I)
    style = ''.join(re.findall(r'<style\b[^>]*>(.*?)</style>', html, flags=re.S | re.I))
    print(path)
    for cls in CLASSES:
        # class="… cls …" on a real element, word-bounded.
        dom = len(re.findall(r'class="[^"]*\b' + re.escape(cls) + r'\b[^"]*"', body))
        css = len(re.findall(r'\.' + re.escape(cls) + r'\b', style))
        print(f'  {cls:30} dom={dom:5}  (css selector mentions={css})')
    gid = len(re.findall(r'id="mb-picard-col-hdr-toggle-all-btn"', body))
    pressed = len(re.findall(r'aria-pressed="(true|false)"[^>]*class="[^"]*mb-picard-col-hdr-btn'
                             r'|class="[^"]*mb-picard-col-hdr-btn[^"]*"[^>]*aria-pressed="(true|false)"', body))
    print(f'  {"#…toggle-all-btn (id)":30} dom={gid:5}')
    print(f'  {"toggle spans w/ aria-pressed":30} dom={pressed:5}')
