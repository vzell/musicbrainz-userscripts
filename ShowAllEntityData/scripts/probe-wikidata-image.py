#!/usr/bin/env python3
"""Probe the route to an entity's picture that MusicBrainz's own server takes.

MusicBrainz's `/<type>/<mbid>/commons-image` answers `{"image": null}` on the
live site because its Commons switch is off (DEBUG-NOTES.md 2026-10-11). Its
server code (lib/MusicBrainz/Server/Controller/Role/CommonsImage.pm) takes the
file from an `image`/`logo` relationship to Commons, else from the entity's
Wikidata item: P242 (an area's locator map), P18 (image), P154 (logo). Part 4
of docs/claude/sidebar.md does the same in the browser, on Space only. This
records, before any code depends on it:

1. each entity's url-rels from the Web Service: which relationship types
   point at Commons and Wikidata;
2. Wikidata's `wbgetclaims` for P18 and P154: status, bytes, ranks, time;
3. an item without a picture, and one that does not exist;
4. Commons' `Special:FilePath/<file>?width=N`: where it redirects, for the
   widths the card (64 px, asked at 330) and the viewer (1280) would use.

One request per 1.2 s per host. Run: python3 scripts/probe-wikidata-image.py
"""

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 (https://github.com/vzell/mb-userscripts)'
ENTITIES = [
    ('artist', '70248960-cb53-4ea4-943a-edb18f7d336f', 'Bruce Springsteen'),
    ('label', '011d1192-6f65-45bd-85c4-0400dd45693e', 'Columbia'),
    ('place', '9e3e1c20-1d63-43f2-8e09-6e30c06aa7c4', 'a place'),
    ('artist', '89ad4ac3-39f7-470e-963a-56509c546377', 'Various Artists'),
]
MISSING_ITEM = 'Q999999999999'
FALLBACK_ITEMS = {'Bruce Springsteen': 'Q1225', 'Columbia': 'Q183387'}
_last = {}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Hands a redirect back as the answer instead of following it."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch(url, follow=True):
    """GET a URL, spaced per host; return (status, headers, body, ms)."""
    host = urllib.parse.urlsplit(url).hostname
    wait = 1.2 - (time.time() - _last.get(host, 0))
    if wait > 0:
        time.sleep(wait)
    _last[host] = time.time()
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    opener = urllib.request.build_opener() if follow else urllib.request.build_opener(NoRedirect)
    t0 = time.time()
    try:
        with opener.open(req, timeout=20) as r:
            body = r.read()
            return r.status, dict(r.headers), body, round((time.time() - t0) * 1000)
    except urllib.error.HTTPError as e:
        body = e.read()
        return e.code, dict(e.headers), body, round((time.time() - t0) * 1000)


def as_json(body):
    """The body as JSON, or None."""
    try:
        return json.loads(body.decode('utf-8', 'replace'))
    except ValueError:
        return None


def claims(item, prop):
    """`wbgetclaims` for one property: a summary of what it answers."""
    url = ('https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json'
           f'&entity={item}&property={prop}')
    status, headers, body, ms = fetch(url)
    d = as_json(body) or {}
    vals = [{'rank': c.get('rank'),
             'value': ((c.get('mainsnak') or {}).get('datavalue') or {}).get('value')}
            for c in (d.get('claims') or {}).get(prop, [])]
    return {'url': url, 'status': status, 'bytes': len(body), 'ms': ms,
            'contentType': headers.get('Content-Type', ''), 'error': d.get('error'), 'values': vals}


def file_path(name, width):
    """Where Special:FilePath sends a file at a width (not followed)."""
    url = ('https://commons.wikimedia.org/wiki/Special:FilePath/'
           f'{urllib.parse.quote(name.replace(" ", "_"))}?width={width}')
    status, headers, body, ms = fetch(url, follow=False)
    loc = headers.get('Location') or headers.get('location') or ''
    out = {'url': url, 'status': status, 'ms': ms, 'location': loc}
    if loc:
        st2, h2, b2, ms2 = fetch(loc)
        out.update({'target': st2, 'targetType': h2.get('Content-Type', ''), 'targetBytes': len(b2), 'targetMs': ms2})
    return out


def main():
    started = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    out = {'started': started, 'entities': [], 'missing': None, 'filePath': []}
    files = []
    for kind, mbid, name in ENTITIES:
        url = f'https://musicbrainz.org/ws/2/{kind}/{mbid}?inc=url-rels&fmt=json'
        status, headers, body, ms = fetch(url)
        d = as_json(body)
        rels = []
        if isinstance(d, dict):
            for r in d.get('relations', []):
                res = (r.get('url') or {}).get('resource', '')
                if 'wikidata.org' in res or 'commons.wikimedia.org' in res:
                    rels.append({'type': r.get('type'), 'typeId': r.get('type-id'), 'resource': res,
                                 'ended': r.get('ended')})
        row = {'kind': kind, 'name': name, 'ws': status, 'wsMs': ms, 'wsBytes': len(body),
               'wsJson': d is not None, 'rels': rels}
        item = next((r['resource'].rstrip('/').split('/')[-1] for r in rels if 'wikidata.org' in r['resource']), '')
        item = item or FALLBACK_ITEMS.get(name, '')
        row['item'] = item
        if item:
            row['P18'] = claims(item, 'P18')
            row['P154'] = claims(item, 'P154')
            for p in ('P18', 'P154'):
                for v in row[p]['values']:
                    if v['rank'] != 'deprecated' and isinstance(v['value'], str):
                        files.append(v['value'])
                        break
        out['entities'].append(row)
        print(f"{name}: ws {status} ({ms} ms, json={d is not None}); rels {rels}; item {item or '-'}")
        for p in ('P18', 'P154'):
            if p in row:
                c = row[p]
                print(f"   {p}: {c['status']} {c['bytes']} B {c['ms']} ms {c['values']}")
    out['missing'] = claims(MISSING_ITEM, 'P18')
    print(f"missing item: {out['missing']['status']} {out['missing']['bytes']} B error={out['missing']['error']}")
    for f in files[:3]:
        for w in (330, 1280):
            r = file_path(f, w)
            out['filePath'].append(r)
            print(f"FilePath {f} @{w}: {r['status']} → {r['location'][:140]} → {r.get('target')} "
                  f"{r.get('targetType')} {r.get('targetBytes')} B")
    out['finished'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    print(json.dumps(out, indent=1)[:12000])
    return 0


if __name__ == '__main__':
    sys.exit(main())
