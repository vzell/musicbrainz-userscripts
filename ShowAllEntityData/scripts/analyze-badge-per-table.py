#!/usr/bin/env python3
"""Per sub-table: its heading and how many .mb-col-uniq-count badges are
populated, straight out of a committed rendered.html baseline. Answers 'which
sub-table survived the shared coalescing token'."""
import io, re, sys

for path in sys.argv[1:]:
    html = io.open(path, encoding='utf-8', errors='replace').read()
    print('==', path)
    # Split on table starts, keeping the preceding heading text.
    parts = re.split(r'(<table[^>]*class="[^"]*\btbl\b[^"]*"[^>]*>)', html)
    # parts[0] is the preamble; then (tag, body) pairs
    heads = re.findall(r'<h3[^>]*>(.*?)</h3>', html, re.S)
    idx = 0
    for i in range(1, len(parts), 2):
        body = parts[i + 1] if i + 1 < len(parts) else ''
        thead = body.split('</thead>')[0]
        badges = re.findall(r'<span class="mb-col-uniq-count">([^<]*)</span>', thead)
        filled = [b for b in badges if b.strip()]
        # heading immediately preceding this table
        pre = parts[i - 1] if i - 1 >= 0 else ''
        h = re.findall(r'<h3[^>]*>(.*?)</h3>', pre, re.S)
        name = re.sub(r'<[^>]+>', '', h[-1]).strip() if h else '(no h3)'
        name = re.sub(r'\s+', ' ', name)[:60]
        idx += 1
        print(f'  {idx:3d}. badges={len(badges):3d} filled={len(filled):3d}  {name}')
