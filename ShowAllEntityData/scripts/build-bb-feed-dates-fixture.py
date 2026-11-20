#!/usr/bin/env python3
"""Build a MusicBrainz-part fixture of BruceParser's feed: its envelope and one map.

  tests/fixtures/bb-feed-2026-11-19-dates.json  feed 1.7, the whole `mb` (the
      kind `date-differs`; Track A idea 5, check 1)
  tests/fixtures/bb-feed-2026-11-19-works.json  feed 1.8, the whole `mbWorks`
      (idea 5, check 2): --map mbWorks --min-feed 1.8 --out …

Format, run, site, credit, reports and tagTables as written; `pages`,
`anchors`, `songTags` and `venueTags` left empty, and of `mb` / `mbWorks` the
one named (the other empty): the specs read only that map. About 120 KB
instead of the whole file.

Read-only on the feed; writes the fixture. No network.

Usage:
    python3 scripts/build-bb-feed-dates-fixture.py [--feed FILE] [--out FILE] [--map mb|mbWorks] [--min-feed X.Y]
"""
import argparse
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
FEED = os.path.expanduser('~/git/scripts/BruceParser/bb/2026-11-19/bb-feed.json')
OUT = os.path.join(HERE, '..', 'tests', 'fixtures', 'bb-feed-2026-11-19-dates.json')


def ver(v):
    """'1.10' -> (1, 10)."""
    return tuple(int(x) for x in str(v).split('.'))


def main():
    """Read the feed, keep its envelope and one map, write the fixture."""
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--feed', default=FEED, help='BruceParser feed (default: the run of 2026-11-19)')
    ap.add_argument('--out', default=OUT, help='fixture to write')
    ap.add_argument('--map', default='mb', choices=['mb', 'mbWorks'], help='the map to keep')
    ap.add_argument('--min-feed', default='1.7', help='the oldest feed version that has what the fixture needs')
    args = ap.parse_args()
    with open(args.feed, encoding='utf-8') as fh:
        f = json.load(fh)
    if ver(f.get('run', {}).get('feed', '0')) < ver(args.min_feed):
        raise SystemExit(f"not a feed {args.min_feed} or newer: {f.get('run')}")
    out = {k: f[k] for k in ('format', 'run', 'site', 'credit', 'reports')}
    out.update({'pages': {}, 'anchors': {}, 'mb': {}, 'tagTables': f['tagTables'], 'songTags': {}, 'venueTags': {}})
    out[args.map] = f[args.map]
    with open(args.out, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1, sort_keys=True)
        fh.write('\n')
    kinds = {}
    for v in out[args.map].values():
        kinds[v['kind']] = kinds.get(v['kind'], 0) + 1
    print(f"{args.out}: {len(out[args.map])} {args.map} entries {kinds}")


if __name__ == '__main__':
    main()
