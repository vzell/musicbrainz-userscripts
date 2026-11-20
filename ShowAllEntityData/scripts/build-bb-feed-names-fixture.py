#!/usr/bin/env python3
"""Build tests/fixtures/bb-feed-2026-11-19-names.json from BruceParser's feed 1.6.

The real feed's `dependent-name` kind (Track A idea 4, feed 1.6) and nothing
else: format, run, site, credit and its `reports` entry as written, every page
that carries the kind with that kind only, and the `anchors` that name one of
their shows (so a year listing's row finds the show). A few KB instead of the
whole 365 KB file, the values as BruceParser wrote them.

Read-only on the feed; writes the fixture. No network.

Usage:
    python3 scripts/build-bb-feed-names-fixture.py [--feed FILE] [--out FILE]
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
KIND = 'dependent-name'


def main(argv):
    """Write the fixture and print what it holds."""
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--feed', default=os.path.expanduser('~/git/scripts/BruceParser/bb/2026-11-19/bb-feed.json'))
    ap.add_argument('--out', default=os.path.join(HERE, '..', 'tests', 'fixtures', 'bb-feed-2026-11-19-names.json'))
    args = ap.parse_args(argv)
    with open(args.feed, encoding='utf-8') as fh:
        feed = json.load(fh)
    if feed.get('run', {}).get('feed') != '1.6' or KIND not in feed.get('reports', {}):
        print(f'{args.feed}: not a feed 1.6 with {KIND}', file=sys.stderr)
        return 1
    pages = {n: {KIND: v[KIND]} for n, v in feed['pages'].items() if KIND in v}
    shows = {v[KIND]['event'] for v in pages.values()}
    anchors = {a: ps for a, ps in feed['anchors'].items() if any(p in shows for p in ps)}
    out = {
        'format': feed['format'], 'run': feed['run'], 'site': feed['site'], 'credit': feed['credit'],
        'reports': {KIND: feed['reports'][KIND]}, 'pages': pages, 'anchors': anchors,
    }
    with open(args.out, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, sort_keys=True, indent=1)
        fh.write('\n')
    print(f'{os.path.relpath(args.out)}: {len(pages)} pages, {len(shows)} shows, {len(anchors)} anchors '
          f'(run {feed["run"]["date"]}, BruceParser {feed["run"]["bruceparser"]}, feed {feed["run"]["feed"]})')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
