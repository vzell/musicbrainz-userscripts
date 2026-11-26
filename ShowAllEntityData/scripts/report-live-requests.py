#!/usr/bin/env python3
"""Report the live musicbrainz.org requests the fixture projects made.

`tests/support/test.js`'s live-request guard (`liveGuard()`) writes one JSON
line per request that no spec route answered to
`test-results/live-requests/w<worker>.jsonl`: spec, test title, project,
kind (`page`: a top-level page load, `frame`: a frame's load, `request`:
anything else), resource type, method and URL. This turns them into:

- the pages that need a shell (`page`, by URL, with the specs that load them):
  the inventory for `tests/fixtures/shells/index.json`;
- the frames and other requests, by host and path pattern (MBIDs folded), with
  their specs.

Usage:
    python3 scripts/report-live-requests.py [--dir test-results/live-requests] [--json OUT] [--check]

`--check` exits 1 when any top-level page load was recorded.
"""
import argparse
import glob
import json
import os
import re
import sys
from collections import defaultdict

MBID = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')


def pattern(url):
    """The URL with MBIDs and query values folded, for grouping requests."""
    u = MBID.sub('<mbid>', url)
    u = re.sub(r'=([^&]*)', '=…', u)
    return u


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', default=os.path.join(os.path.dirname(__file__), '..', 'test-results', 'live-requests'))
    ap.add_argument('--json')
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    rows = []
    for f in sorted(glob.glob(os.path.join(a.dir, '*.jsonl'))):
        with open(f, encoding='utf-8') as fh:
            for line in fh:
                line = line.strip()
                if line:
                    try:
                        rows.append(json.loads(line))
                    except ValueError:
                        pass
    pages = defaultdict(set)
    others = defaultdict(lambda: defaultdict(set))
    for r in rows:
        if r.get('kind') == 'page':
            pages[r['url']].add(r['spec'])
        else:
            others[r.get('kind', 'request')][pattern(r['url'])].add(r['spec'])
    print(f'{len(rows)} live requests recorded; {len(pages)} page(s) loaded live')
    if pages:
        print('\n== Pages that need a shell (top-level page loads) ==')
        for url in sorted(pages):
            specs = sorted(pages[url])
            print(f'{url}\n    {len(specs)} spec(s): {", ".join(os.path.basename(s) for s in specs)}')
    for kind in sorted(others):
        print(f'\n== {kind}s (recorded, passed on) ==')
        for pat, specs in sorted(others[kind].items(), key=lambda kv: -len(kv[1])):
            print(f'{len(specs):3d} spec(s)  {pat}')
    if a.json:
        with open(a.json, 'w', encoding='utf-8') as fh:
            json.dump({'pages': {u: sorted(s) for u, s in pages.items()},
                       'others': {k: {p: sorted(s) for p, s in v.items()} for k, v in others.items()}},
                      fh, indent=2, ensure_ascii=False)
            fh.write('\n')
    return 1 if (a.check and pages) else 0


if __name__ == '__main__':
    sys.exit(main())
