#!/usr/bin/env python3
"""Build tests/fixtures/bb-feed-2026-11-19-dates.json from BruceParser's feed 1.7.

The real feed's whole `mb` map (Track A idea 5, check 1: feed 1.7 adds the
kind `date-differs`) and its envelope: format, run, site, credit, reports and
tagTables as written; `pages`, `anchors`, `songTags` and `venueTags` left
empty (the spec reads only `mb`). About 120 KB instead of 368 KB.

Read-only on the feed; writes the fixture. No network.

Usage:
    python3 scripts/build-bb-feed-dates-fixture.py [--feed FILE] [--out FILE]
"""
import argparse
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
FEED = os.path.expanduser('~/git/scripts/BruceParser/bb/2026-11-19/bb-feed.json')
OUT = os.path.join(HERE, '..', 'tests', 'fixtures', 'bb-feed-2026-11-19-dates.json')


def main():
    """Read the feed, keep its envelope and `mb`, write the fixture."""
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--feed', default=FEED, help='BruceParser feed 1.7 (default: the run of 2026-11-19)')
    ap.add_argument('--out', default=OUT, help='fixture to write')
    args = ap.parse_args()
    with open(args.feed, encoding='utf-8') as fh:
        f = json.load(fh)
    if f.get('run', {}).get('feed') != '1.7':
        raise SystemExit(f"not a feed 1.7: {f.get('run')}")
    out = {k: f[k] for k in ('format', 'run', 'site', 'credit', 'reports')}
    out.update({'pages': {}, 'anchors': {}, 'mb': f['mb'], 'tagTables': f['tagTables'], 'songTags': {}, 'venueTags': {}})
    with open(args.out, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1, sort_keys=True)
        fh.write('\n')
    kinds = {}
    for v in out['mb'].values():
        kinds[v['kind']] = kinds.get(v['kind'], 0) + 1
    print(f"{args.out}: {len(out['mb'])} mb entries {kinds}")


if __name__ == '__main__':
    main()
