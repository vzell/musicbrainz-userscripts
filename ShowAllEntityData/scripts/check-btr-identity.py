"""Confirm debug/btr-bug.html and the release-tracks snapshot baseline are the SAME release."""
import json
import re

for path in ('debug/btr-bug.html', 'tests/snapshots/release-tracks/raw.html',
             'debug/r-final.html', 'debug/r-initial.html'):
    html = open(path, encoding='utf-8', errors='replace').read()
    gids = re.findall(r'/release/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})', html)
    top = max(set(gids), key=gids.count) if gids else None
    title = re.search(r'<title>([^<]*)</title>', html)
    name = length = None
    for blob in re.findall(r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', html, re.S):
        if '"mediums"' in blob:
            rel = json.loads(blob).get('release') or {}
            name, length = rel.get('name'), rel.get('length')
            print(f'{path}\n  json release.gid = {rel.get("gid")}  name={name!r}  total={length}')
            break
    else:
        print(f'{path}\n  (no embedded release json)')
    print(f'  most-referenced /release/ gid = {top}')
    print(f'  <title> = {title.group(1) if title else "-"}\n')
