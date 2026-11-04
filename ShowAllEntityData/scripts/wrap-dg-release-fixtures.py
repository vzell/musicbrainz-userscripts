"""Wraps saved Discogs release answers (scripts/probe-dg-release-shapes.py's
release-<id>.json) as fixtures: tests/fixtures/ext-discogs-release-<id>.json,
{url, status, contentType, body} with `body` the answer's text, as
capture-ext-fixtures.py writes them. The Tracks view's spec
(tests/fixtures/discogs-release-tracks.spec.js) reads them; the ids it uses:
2012001 (5 CD, headings as sections, ranges per disc), 10667945 (10 × 7",
"Record N" headings, a "Record 10" range), 532687 (dotted parts of track
16, track artists), 15121926 (a split LP: one heading per side).

Masters too (scripts/probe-dg-master-shapes.py, 2026-11-04): an argument
`master-<id>` wraps master-<id>.json as ext-discogs-master-<id>.json (URL
masters/<id>), and `master-<id>-versions-p1` its first versions page (URL
masters/<id>/versions?per_page=100&page=1). The master's Tracks view spec
(tests/fixtures/discogs-master-tracks.spec.js) reads them.

usage: python3 scripts/wrap-dg-release-fixtures.py PROBE_DIR ID|master-ID|master-ID-versions-p1 [...]
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'tests', 'fixtures')
API = 'https://api.discogs.com'


def source(arg):
    """(saved file name, fixture name, API URL) of one argument."""
    m = re.fullmatch(r'master-(\d+)-versions-p1', arg)
    if m:
        return f'{arg}.json', f'ext-discogs-{arg}.json', f'{API}/masters/{m.group(1)}/versions?per_page=100&page=1'
    m = re.fullmatch(r'master-(\d+)', arg)
    if m:
        return f'{arg}.json', f'ext-discogs-{arg}.json', f'{API}/masters/{m.group(1)}'
    return f'release-{arg}.json', f'ext-discogs-release-{arg}.json', f'{API}/releases/{arg}'


def main():
    """Write one fixture per argument."""
    src, args = sys.argv[1], sys.argv[2:]
    for arg in args:
        name, fixture, url = source(arg)
        with open(os.path.join(src, name), encoding='utf-8') as f:
            body = json.dumps(json.load(f), ensure_ascii=False, separators=(',', ':'))
        out = os.path.join(OUT, fixture)
        with open(out, 'w', encoding='utf-8') as f:
            json.dump({'url': url, 'status': 200, 'contentType': 'application/json', 'body': body},
                      f, ensure_ascii=False, indent=1)
            f.write('\n')
        print(out, len(body))


if __name__ == '__main__':
    main()
