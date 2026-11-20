#!/usr/bin/env python3
"""Show which relationship link types a release page's embedded JSON carries.

For the release-notice finding (batch 4 of the Apollo findings): does the
payload hold the release's and the recordings' "phonographic copyright"
relationships, and under which link type ids and names?

Usage:
    python3 scripts/inspect-release-payload-rels.py tests/fixtures/<release>.html
"""
import collections
import json
import re
import sys


def payloads(html):
    """Every parseable script[type=application/json] body of the page."""
    for m in re.finditer(r'<script type="application/json">(.*?)</script>', html, re.S):
        try:
            yield json.loads(m.group(1))
        except ValueError:
            pass


def main():
    """Print link type names and where the ℗ relationships sit."""
    html = open(sys.argv[1], encoding='utf-8').read()
    for p in payloads(html):
        lt = (p.get('initialLinkedEntities') or {}).get('link_type') or {}
        if lt:
            for k, v in lt.items():
                if 'copyright' in (v.get('name') or ''):
                    print('link_type', k, v.get('name'), v.get('type0'), v.get('type1'), v.get('gid'))
        rel = p.get('release')
        if not rel:
            continue
        print('release keys:', sorted(rel.keys())[:60])
        own = collections.Counter(r.get('linkTypeID') for r in rel.get('relationships') or [])
        print('release own rels by linkTypeID:', dict(own))
        recs = collections.Counter()
        ntr = 0
        for m in rel.get('mediums') or []:
            print('medium keys:', sorted(m.keys()))
            for t in m.get('tracks') or []:
                ntr += 1
                for r in (t.get('recording') or {}).get('relationships') or []:
                    recs[r.get('linkTypeID')] += 1
        print('tracks:', ntr, 'recording rels by linkTypeID:', dict(recs))


if __name__ == '__main__':
    main()
