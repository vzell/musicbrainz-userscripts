"""U0 of the external-link previews (org/iframe.org, "* generalize to URLs"):
what does the Web Service say about a URL entity, and how does a lookup by
the URL itself match?

Two planned features depend on this. The "[info]" link beside every URL
relationship (/url/<mbid>) gets a card of its own, and an external link's
pinned window says "MusicBrainz knows this URL" (or that it does not).

What https://musicbrainz.org/doc/MusicBrainz_API says (read 2026-10-08,
revision #79405):
- lookup: /ws/2/url/<mbid>; the Browse inc table lists url with "(only
  relationship includes)", while the same section says "all entities
  support: annotation, tags, user-tags, genres, user-genres". The two
  disagree, so section 2 asks;
- by resource: /ws/2/url?resource=<URL>[&resource=<URL>]... "can be
  specified multiple times (up to 100) in a single query"; one resource
  answers a single url, several answer "a url-list", and "any 'resource'
  that is not found will be skipped"; a single unknown resource answers 404;
- the URL must be URL-escaped as a query parameter. NOTHING about how it is
  matched: exact string, or normalised (scheme, www., trailing slash, case,
  fragment)? Section 3 asks.
https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting: one request a
second per IP, 503 beyond; a User-Agent with a contact. The probe keeps
1.1 s between requests, as `_relAwaitRateSlot()` does.

Sections:
  1. the event page's URL entity, every relationship include;
  2. which non-relationship includes a url lookup accepts;
  3. lookup by resource: the exact string and its variants (http/https,
     www., trailing slash, host case, without the fragment), on the event's
     Brucebase URL and on URLs of Bruce Springsteen's artist page;
  4. the annotation's Wikipedia link (is an annotation link a URL entity?);
  5. several resources in one request: the JSON shape, a missing one
     skipped, and the artist's whole URL list in one request (size, time);
  6. a search on url (documented on another page; does it answer?).

usage: python3 scripts/probe-mb-url-entity.py [--json OUT]
       (33 requests, about 35 s)

Results of the first runs (2026-10-08, host NB-3641) are recorded in
org/iframe.org, "* generalize to URLs", "U0: probes", X7: relationship
includes only; matching is exact except for the host's case.
"""
import argparse
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-ext-preview-probe/1.0 ( info@volkerzell.de )'
WS = 'https://musicbrainz.org/ws/2'
SPACING_S = 1.1

URL_MBID = '7c36bf3a-15d4-4b1f-afaa-40847960e3e0'   # debug/URL-*.html's "[info]" link
URL_RES = 'http://brucebase.wikidot.com/2025#261025'
ARTIST = '70248960-cb53-4ea4-943a-edb18f7d336f'
ALL_RELS = ('area-rels+artist-rels+event-rels+instrument-rels+label-rels+place-rels+recording-rels'
            '+release-rels+release-group-rels+series-rels+url-rels+work-rels')

_last = [0.0]


def get(path, attempts=5):
    """GET a Web Service path as JSON, 1.1 s after the previous request.

    Returns (status, data-or-None, bytes, ms). 429/502/503/504 are retried
    with Retry-After as a floor; any other status is returned.
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
        headers = {}
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                status, body, headers = r.status, r.read(), dict(r.headers)
        except urllib.error.HTTPError as e:
            status, body, headers = e.code, e.read(), dict(e.headers or {})
        except Exception as e:  # transport failure: retry like a 503
            status, body = 0, str(e).encode()
        ms = round((time.time() - t0) * 1000)
        if status in (0, 429, 502, 503, 504) and attempt < attempts:
            ra = next((v for k, v in headers.items() if k.lower() == 'retry-after'), '')
            time.sleep(max(SPACING_S * attempt, float(ra) if ra.isdigit() else 0))
            continue
        break
    try:
        data = json.loads(body.decode('utf-8'))
    except ValueError:
        data = None
    return status, data, len(body), ms


def q(resource):
    """A resource as one escaped query parameter (the docs' rule)."""
    return 'resource=' + urllib.parse.quote(resource, safe='')


def line(label, value):
    """Prints one aligned report line."""
    print(f'   {label:<34} {value}')


def by_resource(resource):
    """Looks one resource up; returns (status, the url's id or None, ms)."""
    s, d, _, ms = get('url?' + q(resource))
    return s, (d or {}).get('id'), (d or {}).get('resource'), ms


def section_lookup(out):
    """1. The event page's URL entity with every relationship include."""
    print(f'\n# 1. /url/{URL_MBID}?inc=<every *-rels>')
    s, d, b, ms = get(f'url/{URL_MBID}?inc={ALL_RELS}')
    d = d or {}
    line('HTTP / bytes / ms', f'{s} · {b:,} · {ms}')
    line('keys', sorted(d.keys()))
    line('resource', d.get('resource'))
    for r in d.get('relations') or []:
        tgt = r.get(r.get('target-type')) or {}
        line(f'{r.get("type")} ({r.get("direction")})',
             f'{r.get("target-type")}: {tgt.get("name") or tgt.get("title")} {tgt.get("id")}'
             + (f' · ended {r.get("end")}' if r.get('ended') else ''))
    out['lookup'] = {'status': s, 'bytes': b, 'keys': sorted(d.keys()), 'relations': len(d.get('relations') or [])}


def section_incs(out):
    """2. Which non-relationship includes a url lookup accepts."""
    print('\n# 2. Non-relationship includes on a url lookup')
    out['incs'] = {}
    for inc in ('annotation', 'tags', 'genres', 'aliases', 'ratings'):
        s, d, b, _ = get(f'url/{URL_MBID}?inc={inc}')
        line(f'inc={inc}', f'HTTP {s} · {b:,} bytes' + (f' · error: {(d or {}).get("error")}' if s != 200 else
                                                    f' · keys {sorted((d or {}).keys())}'))
        out['incs'][inc] = s


def variants(res):
    """The spellings of one URL that a user or a page might carry."""
    p = urllib.parse.urlsplit(res)
    host = p.netloc
    other = 'https' if p.scheme == 'http' else 'http'
    alt_host = host[4:] if host.startswith('www.') else 'www.' + host
    path = p.path
    toggled = path[:-1] if path.endswith('/') and len(path) > 1 else path + '/'
    v = [
        ('exact', res),
        (f'scheme {other}', urllib.parse.urlunsplit((other, host, path, p.query, p.fragment))),
        ('www. toggled', urllib.parse.urlunsplit((p.scheme, alt_host, path, p.query, p.fragment))),
        ('trailing slash toggled', urllib.parse.urlunsplit((p.scheme, host, toggled, p.query, p.fragment))),
        ('host upper case', urllib.parse.urlunsplit((p.scheme, host.upper(), path, p.query, p.fragment))),
    ]
    if p.fragment:
        v.append(('without the fragment', urllib.parse.urlunsplit((p.scheme, host, path, p.query, ''))))
    return v


def section_matching(out, samples):
    """3. Lookup by resource: the exact string and its variants."""
    print('\n# 3. ?resource= matching')
    out['matching'] = []
    for res in samples:
        print(f'\n   {res}')
        for label, v in variants(res):
            s, mbid, stored, ms = by_resource(v)
            line(f'  {label}', f'HTTP {s}' + (f' · {mbid} · stored as {stored}' if mbid else ''))
            out['matching'].append({'base': res, 'variant': label, 'status': s, 'id': mbid, 'stored': stored})


def section_annotation(out):
    """4. The annotation's Wikipedia link."""
    print('\n# 4. An annotation link as a resource')
    for res in ('https://en.wikipedia.org/wiki/TeachRock', 'https://en.wikipedia.org/wiki/Hard_Rock_Cafe'):
        s, mbid, stored, _ = by_resource(res)
        line(res, f'HTTP {s}' + (f' · {mbid}' if mbid else ''))
        out.setdefault('annotation', []).append({'resource': res, 'status': s, 'id': mbid})


def section_many(out, artist_urls):
    """5. Several resources in one request."""
    print('\n# 5. Several resources in one request')
    some = artist_urls[:3] + ['https://no-such-host.example/showallentitydata-probe']
    s, d, b, ms = get('url?' + '&'.join(q(r) for r in some))
    d = d or {}
    line('3 known + 1 unknown', f'HTTP {s} · {b:,} bytes · {ms} ms')
    line('top-level keys', sorted(d.keys()))
    lst = d.get('urls') or d.get('url-list') or []
    line('entries returned', len(lst))
    if lst:
        line('entry keys', sorted(lst[0].keys()))
    out['many_small'] = {'status': s, 'keys': sorted(d.keys()), 'returned': len(lst)}
    batch = artist_urls[:100]
    distinct = list(dict.fromkeys(batch))
    s, d, b, ms = get('url?' + '&'.join(q(r) for r in batch) + f'&inc={ALL_RELS}')
    lst = (d or {}).get('urls') or (d or {}).get('url-list') or []
    with_rels = sum(1 for u in lst if u.get('relations'))
    line(f'{len(batch)} URLs ({len(distinct)} distinct) + every *-rels',
         f'HTTP {s} · {b:,} bytes · {ms} ms · {len(lst)} returned, {with_rels} with relations')
    missing = sorted(set(distinct) - {u.get('resource') for u in lst})
    line('distinct URLs not returned', missing or 'none')
    out['many_batch'] = {'sent': len(batch), 'distinct': len(distinct), 'status': s, 'bytes': b, 'ms': ms,
                         'returned': len(lst), 'with_relations': with_rels, 'missing': missing}


def section_search(out):
    """6. A url search."""
    print('\n# 6. Search')
    s, d, b, _ = get('url?query=' + urllib.parse.quote('url:"http://brucebase.wikidot.com/2025#261025"'))
    line('url?query=url:"…"', f'HTTP {s} · {b:,} bytes · keys {sorted((d or {}).keys())} · '
         f'count {(d or {}).get("count")}')
    out['search'] = {'status': s, 'keys': sorted((d or {}).keys())}


def main():
    """Runs every section and optionally writes the summary as JSON."""
    ap = argparse.ArgumentParser()
    ap.add_argument('--json', default='', help='write a summary here (e.g. debug/probe-mb-url-entity.json)')
    args = ap.parse_args()
    started = time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())
    print(f'probe-mb-url-entity · {started} · host {os.uname().nodename}')
    out = {'started': started, 'host': os.uname().nodename}
    section_lookup(out)
    section_incs(out)
    _, artist, _, _ = get(f'artist/{ARTIST}?inc=url-rels')
    artist_urls = [r['url']['resource'] for r in (artist or {}).get('relations') or [] if r.get('url')]
    print(f'\n(Bruce Springsteen\'s artist page has {len(artist_urls)} URL relations)')
    pick = [u for u in artist_urls if any(h in u for h in ('discogs.com', 'wikidata.org', 'allmusic.com'))][:3]
    section_matching(out, [URL_RES] + pick)
    section_annotation(out)
    section_many(out, artist_urls)
    section_search(out)
    out['finished'] = time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())
    print(f'\nfinished {out["finished"]}')
    if args.json:
        with open(args.json, 'w', encoding='utf-8') as f:
            json.dump(out, f, indent=1, ensure_ascii=False)
        print(f'summary written to {args.json}')


if __name__ == '__main__':
    main()
