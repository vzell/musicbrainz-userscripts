"""Probe the label lookups the enriched MusicBrainz label card and window use.

What https://musicbrainz.org/doc/MusicBrainz_API says (checked 2026-10-26):
a label lookup `/ws/2/label/<MBID>` accepts `aliases`, `genres`, `tags`,
`ratings`, `annotation` and the `<kind>-rels` relationship includes plus
`url-rels`; `life-span`, `label-code`, `ipis`, `isnis`, `sort-name`, `area`
and `type` are in the plain answer. The docs say nothing about how many
relationships a big label's `artist-rels` answer carries (a "recording
contract" per signed artist), so the window asks `artist-rels+place-rels+
series-rels` in a lookup of its own (pinned windows only, never the card)
and shows each relationship type capped; `release-rels` (distributor,
manufacturer, ...) is not asked at all, as it scales with the catalogue.

This probe sends each inc set the code uses against the live endpoint and
reports status, bytes, time and the relationship count per target type and
type, so the caps rest on what the endpoint answers rather than on the docs.
Rate limit: one request per second per IP
(https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting); the probe
keeps 1.1 s between requests and retries 503 once.

usage: python3 scripts/probe-mb-label-inc.py [LABEL_MBID ...]
       (not yet run: written 2026-10-26 in a session with no route to musicbrainz.org)
       (default: Columbia 3d8cf8be-09b6-470c-970b-9c1c6d511507; 3 requests per label)
"""
import json
import sys
import time
import urllib.error
import urllib.request
from collections import Counter

UA = 'ShowAllEntityData-probe/1.0 ( info@volkerzell.de )'
BASE = 'https://musicbrainz.org/ws/2/label/'
INCS = ['genres+ratings+aliases', 'url-rels+label-rels', 'artist-rels+place-rels+series-rels']
FIELDS = ['sort-name', 'label-code', 'life-span', 'ipis', 'isnis', 'rating', 'area', 'type']
_last = [0.0]


def fetch(url):
    """Fetch one URL as JSON, keeping 1.1 s between requests.

    @param url: The Web Service URL.
    @return: (status, bytes, ms, parsed JSON or None).
    """
    for attempt in range(2):
        wait = 1.1 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        t0 = time.time()
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read()
                return r.status, len(body), int((time.time() - t0) * 1000), json.loads(body)
        except urllib.error.HTTPError as e:
            if e.code == 503 and attempt == 0:
                continue
            return e.code, 0, int((time.time() - t0) * 1000), None
        except urllib.error.URLError as e:
            # No route (a proxy refusing the host, DNS): say so, not a traceback.
            print(f'  network error: {e.reason}')
            return 0, 0, int((time.time() - t0) * 1000), None
    return 0, 0, 0, None


def probe(mbid):
    """Ask every inc set for one label and print what came back.

    @param mbid: The label's MBID.
    @return: None.
    """
    print(f'label {mbid}')
    for inc in INCS:
        status, size, ms, data = fetch(f'{BASE}{mbid}?fmt=json&inc={inc}')
        print(f'  inc={inc}: HTTP {status}, {size} bytes, {ms} ms')
        if not data:
            continue
        if inc == INCS[0]:
            print('    fields: ' + ', '.join(f'{k}={json.dumps(data.get(k))[:60]}' for k in FIELDS))
        rels = data.get('relations') or []
        by = Counter((r.get('target-type'), r.get('type'), r.get('direction')) for r in rels)
        for (tt, ty, d), n in by.most_common():
            print(f'    {n:6d}  {tt} / {ty} / {d}')


def main():
    """Probe the labels named on the command line, or Columbia.

    @return: None.
    """
    for mbid in sys.argv[1:] or ['3d8cf8be-09b6-470c-970b-9c1c6d511507']:
        probe(mbid)


if __name__ == '__main__':
    main()
