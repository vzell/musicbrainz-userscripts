"""Split jesus2099 markers into INSIDE our rendered table.tbl vs OUTSIDE (page furniture).

Determines the correct scope for an 'strip all artifacts from the final rendered page' policy:
outside-the-table markers belong to jesus2099 features on the surrounding page, which must
keep working.
"""
import collections
import re

MARK = re.compile(r'jesus2099[\w-]*|treleases')


def table_spans(html):
    """Yield (start, end) char offsets of every <table ... class="...tbl..."> ... </table>."""
    spans = []
    for m in re.finditer(r'<table[^>]*class="[^"]*\btbl\b[^"]*"[^>]*>', html):
        depth, i = 1, m.end()
        while depth and i < len(html):
            nxt = re.search(r'<(/?)table\b', html[i:])
            if not nxt:
                break
            depth += -1 if nxt.group(1) else 1
            i += nxt.end()
        spans.append((m.start(), i))
    return spans


for path in ('debug/work-rec.html', 'debug/therising.html',
             'tests/snapshots/release-tracks/rendered.html'):
    html = open(path, encoding='utf-8', errors='replace').read()
    spans = table_spans(html)
    inside, outside = collections.Counter(), collections.Counter()
    for m in MARK.finditer(html):
        pos = m.start()
        tgt = inside if any(a <= pos < b for a, b in spans) else outside
        tgt[m.group(0)] += 1
    print(f'=== {path}  ({len(spans)} table.tbl) ===')
    print('  INSIDE  table.tbl :', dict(inside) or '—')
    print('  OUTSIDE table.tbl :', dict(outside) or '—')
    print()
