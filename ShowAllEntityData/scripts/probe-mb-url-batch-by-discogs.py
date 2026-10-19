"""The Discogs pageTypes' MusicBrainz column (docs/claude/discogs.md,
"MusicBrainz column"): how does /ws/2/url?resource=... answer for Discogs
URLs, the way murdos' "Import Discogs releases to MusicBrainz" asks it?

The importer (tests/fixtures/live-userscripts/discogs_importer.user.js,
lib/mblinks.js@755843cf) asks
    /ws/2/url?resource=<u1>&resource=<u2>...&inc=<mbType>-rels
with up to 75 resources, `https://www.discogs.com/<type>/<id>` (no slug),
one inc per request (that of the batch's first item).

What https://musicbrainz.org/doc/MusicBrainz_API says (re-read 2026-10-18):
resource "can be specified multiple times (up to 100) in a single query";
several answer a url-list, an unknown one "will be skipped", a single
unknown resource answers 404. scripts/probe-mb-url-entity.py (2026-10-08)
found matching exact except for the host's case.

Sections:
  1. one known release URL: the single-resource shape, where `ended` is;
  2. a batch of known + unknown releases: the url-list shape, the unknown
     one skipped (or not), the order of the answer;
  3. a batch where EVERY resource is unknown (404?);
  4. variants: a slugged URL, http:, no www.;
  5. one request with several incs (release-rels+release-group-rels);
  6. labels: Columbia (several MB labels), a studio (a place), place-rels
     and label-rels in one request;
  7. the batch-size limit: 75, 100 and 101 resources;
  8. a master and an artist.

usage: python3 scripts/probe-mb-url-batch-by-discogs.py [--save DIR]
       (about 20 requests, 25 s). --save writes each answer as
       mb-url-discogs-<name>.json, for the fixture specs.

Results (Env: 2026-10-19T00:05+02:00 · NB-3641 · WSL2 Ubuntu 24.04.3
(Linux 6.18.54.1) · no browser, Python urllib · n/a):
  - one resource answers {id, resource, relations}; several answer
    {url-count, url-offset, urls: [{id, resource, relations}]}, in an
    order of the server's own, NOT the order asked; match by `resource`;
  - an unknown resource is skipped; one unknown alone answers 404, two or
    more unknown answer 200 with url-count 0;
  - matching is exact: a slugged URL, http: or no www. all answer 404
    (ask `https://www.discogs.com/<type>/<id>` only);
  - up to 100 resources per request; the 101st is DROPPED SILENTLY (200,
    no error), so a batch must never exceed 100;
  - no paging: 87 matches of 100 came back in one answer;
  - several relationship incs in one request work
    (label-rels+place-rels, release-rels+release-group-rels), each
    relation carrying its target under its own key (`label`, `place`,
    `release`, `release_group`, `artist`);
  - `ended` is a boolean on each relation (the importer greys an ended
    release link with it);
  - Columbia (label/1866) has three MB labels; Thrill Hill Recording
    (label/275307) is a place, not a label.
"""
import argparse
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-dg-mb-column-probe/1.0 ( info@volkerzell.de )'
WS = 'https://musicbrainz.org/ws/2'
SPACING_S = 1.1
DG = 'https://www.discogs.com'

_last = [0.0]


def get(path, attempts=5):
    """GET a Web Service path as JSON, 1.1 s after the previous request.

    Returns (status, data-or-None, ms). 429/502/503/504 are retried with
    Retry-After as a floor; any other status is returned.
    """
    sep = '&' if '?' in path else '?'
    url = f'{WS}/{path}{sep}fmt=json'
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    status, body, ms = 0, b'', 0
    for attempt in range(1, attempts + 1):
        wait = _last[0] + SPACING_S - time.time()
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                status, body = r.status, r.read()
        except urllib.error.HTTPError as e:
            status, body = e.code, e.read()
            if status in (429, 502, 503, 504) and attempt < attempts:
                time.sleep(max(2.0, float(e.headers.get('Retry-After') or 0)))
                continue
        ms = int((time.time() - t0) * 1000)
        break
    try:
        data = json.loads(body.decode('utf-8')) if body else None
    except ValueError:
        data = None
    return status, data, ms


def by_resource(resources, inc):
    """The importer's query: every resource as its own parameter, one inc."""
    q = '&'.join('resource=' + urllib.parse.quote(r, safe='') for r in resources)
    return get(f'url?{q}&inc={inc}')


def summary(data, rel_type):
    """Resource -> list of (target id, ended) for relations of `rel_type`."""
    if not isinstance(data, dict):
        return data
    items = data.get('urls') if 'urls' in data else [data]
    out = {}
    for u in items or []:
        rels = [(r.get(rel_type.replace('-', '_')) or {}).get('id') for r in u.get('relations', [])
                if rel_type.replace('-', '_') in r]
        ended = [r.get('ended') for r in u.get('relations', []) if rel_type.replace('-', '_') in r]
        out[u.get('resource')] = list(zip(rels, ended))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--save', help='directory for the answers (fixtures)')
    args = ap.parse_args()

    def save(name, data):
        if args.save and data is not None:
            os.makedirs(args.save, exist_ok=True)
            with open(os.path.join(args.save, f'mb-url-discogs-{name}.json'), 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=1)
                f.write('\n')

    def show(title, st, data, ms, rel_type):
        keys = sorted(data.keys()) if isinstance(data, dict) else type(data).__name__
        print(f'\n== {title}\n   status {st}, {ms} ms, top-level keys {keys}')
        if isinstance(data, dict) and 'url-count' in data:
            print(f'   url-count {data.get("url-count")}, url-offset {data.get("url-offset")}')
        print(f'   {json.dumps(summary(data, rel_type), indent=1)[:1500]}')

    rel = f'{DG}/release/1132381'
    st, d, ms = by_resource([rel], 'release-rels')
    show('1. one known release', st, d, ms, 'release')
    if isinstance(d, dict) and d.get('relations'):
        print('   first relation keys:', sorted(d['relations'][0].keys()))
    save('single-release', d)

    batch = [rel, f'{DG}/release/460636', f'{DG}/release/99999999998', f'{DG}/release/1131342']
    st, d, ms = by_resource(batch, 'release-rels')
    show('2. known + unknown releases', st, d, ms, 'release')
    if isinstance(d, dict) and 'urls' in d:
        print('   answer order:', [u.get('resource') for u in d['urls']])
    save('batch-release', d)

    st, d, ms = by_resource([f'{DG}/release/99999999998', f'{DG}/release/99999999997'], 'release-rels')
    show('3. every resource unknown', st, d, ms, 'release')

    for v in (f'{DG}/release/1132381-Bruce-Springsteen-Devils-Dust', 'http://www.discogs.com/release/1132381',
              'https://discogs.com/release/1132381'):
        st, d, ms = by_resource([v], 'release-rels')
        show(f'4. variant {v}', st, d, ms, 'release')

    st, d, ms = by_resource([rel, f'{DG}/master/27097'], 'release-rels+release-group-rels')
    show('5. two incs in one request (release part)', st, d, ms, 'release')
    print('   release-group part:', json.dumps(summary(d, 'release-group')))

    labels = [f'{DG}/label/1866', f'{DG}/label/275307', f'{DG}/label/93330', f'{DG}/label/266838']
    st, d, ms = by_resource(labels, 'label-rels')
    show('6a. labels, label-rels', st, d, ms, 'label')
    save('batch-label', d)
    st, d, ms = by_resource(labels, 'place-rels')
    show('6b. labels, place-rels', st, d, ms, 'place')
    save('batch-place', d)
    st, d, ms = by_resource(labels, 'label-rels+place-rels')
    show('6c. labels, label-rels+place-rels (label part)', st, d, ms, 'label')
    print('   place part:', json.dumps(summary(d, 'place')))

    for n in (75, 100, 101):
        res = [f'{DG}/release/{1132381 + i}' for i in range(n)]
        st, d, ms = by_resource(res, 'release-rels')
        found = len(d.get('urls', [])) if isinstance(d, dict) and 'urls' in d else (1 if isinstance(d, dict) and 'resource' in d else 0)
        err = d.get('error') if isinstance(d, dict) else None
        print(f'\n== 7. {n} resources: status {st}, {ms} ms, {found} found, error {err!r}')

    # Is a resource past the 100th honoured? The known release goes LAST.
    for n in (100, 101):
        res = [f'{DG}/release/99999{i:05d}' for i in range(n - 1)] + [rel]
        st, d, ms = by_resource(res, 'release-rels')
        got = [u.get('resource') for u in d.get('urls', [])] if isinstance(d, dict) else []
        print(f'\n== 9. known release at position {n}: status {st}, found {got}, '
              f'error {d.get("error") if isinstance(d, dict) else None!r}')

    # Paging: do more than 25 matches come back in one answer?
    res = [f'{DG}/artist/{i}' for i in range(1, 101)]
    st, d, ms = by_resource(res, 'artist-rels')
    if isinstance(d, dict):
        print(f'\n== 10. artists 1..100: status {st}, url-count {d.get("url-count")}, '
              f'urls in answer {len(d.get("urls", []))}, url-offset {d.get("url-offset")}')

    st, d, ms = by_resource([f'{DG}/master/27097'], 'release-group-rels')
    show('8a. a master', st, d, ms, 'release-group')
    save('single-master', d)
    st, d, ms = by_resource([f'{DG}/artist/219986', f'{DG}/artist/293630'], 'artist-rels')
    show('8b. artists', st, d, ms, 'artist')
    save('batch-artist', d)


if __name__ == '__main__':
    main()
