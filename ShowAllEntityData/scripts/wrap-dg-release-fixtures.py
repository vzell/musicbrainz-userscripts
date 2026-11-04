"""Wraps saved Discogs release answers (scripts/probe-dg-release-shapes.py's
release-<id>.json) as fixtures: tests/fixtures/ext-discogs-release-<id>.json,
{url, status, contentType, body} with `body` the answer's text, as
capture-ext-fixtures.py writes them. The Tracks view's spec
(tests/fixtures/discogs-release-tracks.spec.js) reads them; the ids it uses:
2012001 (5 CD, headings as sections, ranges per disc), 10667945 (10 × 7",
"Record N" headings, a "Record 10" range), 532687 (dotted parts of track
16, track artists), 15121926 (a split LP: one heading per side).

usage: python3 scripts/wrap-dg-release-fixtures.py PROBE_DIR ID [ID …]
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'tests', 'fixtures')


def main():
    """Write one fixture per id."""
    src, ids = sys.argv[1], sys.argv[2:]
    for rid in ids:
        with open(os.path.join(src, f'release-{rid}.json'), encoding='utf-8') as f:
            body = json.dumps(json.load(f), ensure_ascii=False, separators=(',', ':'))
        out = os.path.join(OUT, f'ext-discogs-release-{rid}.json')
        with open(out, 'w', encoding='utf-8') as f:
            json.dump({'url': f'https://api.discogs.com/releases/{rid}', 'status': 200, 'contentType': 'application/json', 'body': body},
                      f, ensure_ascii=False, indent=1)
            f.write('\n')
        print(out, len(body))


if __name__ == '__main__':
    main()
