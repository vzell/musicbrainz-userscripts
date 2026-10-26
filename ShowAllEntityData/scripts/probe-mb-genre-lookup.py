"""Probe the Web Service genre lookup the genre card and window would use.

What https://musicbrainz.org/doc/MusicBrainz_API says (checked 2026-10-26):
genre is a core entity with a lookup `/ws/2/genre/<MBID>` and a list
`/ws/2/genre/all`; like every entity it accepts `aliases`, `annotation`,
the `<kind>-rels` relationship includes and `url-rels`. Genre has no
browse and no search. What the page shows (debug/genre-initial.html,
roots rock): the name, a disambiguation, the primary tag, the Wikipedia
extract (a page-only feature), relationships to other genres
("subgenre of", "subgenres", "influenced by", ...) and the URLs.

This probe sends each candidate inc set against the live endpoint and
reports status, bytes, time and which of the fields are there, so the
reader's request rests on what the endpoint answers rather than on the
docs. Rate limit: one request per second per IP
(https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting); the probe
keeps 1.1 s between requests and retries 503 once.

usage: python3 scripts/probe-mb-genre-lookup.py [GENRE_MBID ...]
       (not yet run: written 2026-10-26 in a session with no route to musicbrainz.org)
       (default: roots rock 883d75d5-1365-46ee-8cbe-d3ae2facdd93; 4 requests per genre)
"""
import json
import sys
import time
import urllib.error
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 ( info@volkerzell.de )'
BASE = 'https://musicbrainz.org/ws/2/genre/'
INCS = ['', 'aliases', 'genre-rels+url-rels', 'aliases+genre-rels+url-rels+annotation']
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
            with urllib.request.urlopen(req, timeout=30) as r:
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


def main():
    """Run the probe for each genre MBID given (or the default) and print a report."""
    ids = sys.argv[1:] or ['883d75d5-1365-46ee-8cbe-d3ae2facdd93']
    for gid in ids:
        for inc in INCS:
            url = BASE + gid + '?fmt=json' + ('&inc=' + inc if inc else '')
            status, size, ms, d = fetch(url)
            print(f'{gid} inc={inc or "(none)"}: HTTP {status}, {size} B, {ms} ms')
            if not d:
                continue
            print('  keys:', sorted(d.keys()))
            print('  name:', d.get('name'), '| disambiguation:', repr(d.get('disambiguation')))
            if 'aliases' in d:
                print('  aliases:', [a.get('name') for a in d['aliases']])
            if 'annotation' in d:
                print('  annotation:', repr((d.get('annotation') or '')[:80]))
            rels = d.get('relations')
            if rels is not None:
                for r in rels:
                    tgt = r.get(r.get('target-type'), {}) or {}
                    print(f"  rel: {r.get('target-type')} {r.get('type')} {r.get('direction')}"
                          f" -> {tgt.get('name') or tgt.get('resource')}")


if __name__ == '__main__':
    main()
