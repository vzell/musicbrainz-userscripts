#!/usr/bin/env python3
"""Probe MusicBrainz's undocumented `/<type>/<mbid>/commons-image` endpoint.

MusicBrainz's own sidebar loads an entity's Wikimedia Commons picture after
page load. The entity hover card (docs/claude/sidebar.md, part 4) would ask
the same endpoint when a card is pinned. The web service docs
(https://musicbrainz.org/doc/MusicBrainz_API) do not cover it, so this records
what it actually answers before any code depends on it: status, content type,
body shape, for an entity with a picture and one without, per entity type, and
the time each answer took. One request per 1.2 s (the documented rate limit is
about one per second).

Run: python3 scripts/probe-commons-image.py
"""

import json
import sys
import time
import urllib.error
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 (https://github.com/vzell/mb-userscripts)'
CASES = [
    ('artist', '70248960-cb53-4ea4-943a-edb18f7d336f', 'Bruce Springsteen: has a sidebar picture'),
    ('artist', '89ad4ac3-39f7-470e-963a-56509c546377', 'Various Artists: no picture expected'),
    ('label', '011d1192-6f65-45bd-85c4-0400dd45693e', 'Columbia: label'),
    ('place', '9e3e1c20-1d63-43f2-8e09-6e30c06aa7c4', 'a place'),
    ('event', '3f2ca30a-7de4-4964-ad30-48376535fec8', 'an event'),
    ('artist', '00000000-0000-0000-0000-000000000000', 'an MBID that does not exist'),
]


def fetch(url):
    """GET a URL; return (status, content type, body text, milliseconds)."""
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            body = r.read().decode('utf-8', 'replace')
            return r.status, r.headers.get('Content-Type', ''), body, round((time.time() - t0) * 1000)
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', 'replace')
        return e.code, e.headers.get('Content-Type', ''), body, round((time.time() - t0) * 1000)


def shape(v, depth=0):
    """A short description of a JSON value's structure."""
    if isinstance(v, dict):
        if depth > 2:
            return '{…}'
        return '{' + ', '.join(f'{k}: {shape(x, depth + 1)}' for k, x in list(v.items())[:12]) + '}'
    if isinstance(v, list):
        return f'[{len(v)}× ' + (shape(v[0], depth + 1) if v else '') + ']'
    if isinstance(v, str):
        return repr(v[:80])
    return repr(v)


def main():
    out = []
    for i, (kind, mbid, note) in enumerate(CASES):
        if i:
            time.sleep(1.2)
        url = f'https://musicbrainz.org/{kind}/{mbid}/commons-image'
        status, ctype, body, ms = fetch(url)
        try:
            parsed = json.loads(body)
            desc = shape(parsed)
        except ValueError:
            parsed = None
            desc = f'(not JSON) {body[:160]!r}'
        print(f'{status} {ms:>5} ms  {kind:<7} {note}\n        {ctype}\n        {desc}')
        out.append({'kind': kind, 'mbid': mbid, 'note': note, 'status': status, 'ms': ms,
                    'contentType': ctype, 'body': parsed if parsed is not None else body[:400]})
    print(json.dumps({'probedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'results': out}, indent=1)[:6000])
    return 0


if __name__ == '__main__':
    sys.exit(main())
