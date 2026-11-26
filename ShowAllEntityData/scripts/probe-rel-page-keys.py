#!/usr/bin/env python3
"""Find real MusicBrainz entities for the rel-same-page browser check.

Browses an artist's releases (or release groups) with their URL relationships
and reports every entity that links one page in two forms, by the same
platform rules as the userscript's `_REL_PAGE_RULES` / `_relPageKey()`
(feat/link-page-keys, 2026-11-26): Apple Music storefront and slug, Deezer and
Qobuz locales, Tidal's listen. host and /browse/, Spotify's intl-, Beatport's
locale, Discogs' locale and slug; an Amazon product by store + ASIN. It also
reports the entities with two DIFFERENT pages on one site (rel-multi-site).

Read-only, about one request a second against musicbrainz.org.

Usage:
    python3 scripts/probe-rel-page-keys.py [--artist MBID] [--kind release|release-group] [--pages N] [--out FILE]
"""
import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 (+https://github.com/vzell/mb-userscripts)'

RULES = [
    ('apple', re.compile(r'^(?:geo\.|classical\.)?music\.apple\.com$'),
     re.compile(r'^/(?:[a-z]{2}/)?(album|artist|label|song|music-video|playlist)/(?:[^/]+/)?(?:id)?([0-9]+|pl\.[A-Za-z0-9-]+)/?$')),
    ('itunes', re.compile(r'^itunes\.apple\.com$'),
     re.compile(r'^/(?:[a-z]{2}/)?(album|artist|label|song|music-video|playlist)/(?:[^/]+/)?(?:id)?([0-9]+)/?$')),
    ('deezer', re.compile(r'^deezer\.com$'),
     re.compile(r'^/(?:[a-z]{2}(?:-[a-z]{2})?/)?(album|artist|label|track|playlist)/([0-9]+)/?$')),
    ('tidal', re.compile(r'^(?:listen\.)?tidal\.com$'),
     re.compile(r'^/(?:[a-z]{2}/)?(?:browse/|store/)?(album|artist|track|video|playlist)/([0-9a-f-]+)/?$')),
    ('spotify', re.compile(r'^open\.spotify\.com$'),
     re.compile(r'^/(?:intl-[a-z-]+/)?(album|artist|track|playlist)/([A-Za-z0-9]{22})/?$')),
    ('qobuz', re.compile(r'^(?:open\.|play\.)?qobuz\.com$'),
     re.compile(r'^/(?:[a-z]{2}-[a-z]{2}/)?(album)/(?:[^/]+/)?([A-Za-z0-9]+)/?$')),
    ('beatport', re.compile(r'^beatport\.com$'),
     re.compile(r'^/(?:[a-z]{2}/)?(release|artist|label|track)/[^/]+/([0-9]+)/?$')),
    ('discogs', re.compile(r'^discogs\.com$'),
     re.compile(r'^/(?:[a-z]{2}(?:_[A-Za-z]{2})?/)?(release|master|artist|label)/([0-9]+)(?:-[^/]*)?/?$')),
]


def page_key(url):
    """(site, key, form) for one URL, as `_relPageKey()`; None if not http(s)."""
    u = urllib.parse.urlsplit(url)
    if u.scheme not in ('http', 'https'):
        return None
    host = (u.hostname or '').lower()
    host = host[4:] if host.startswith('www.') else host
    form = 'https://' + host + u.path.rstrip('/')
    for name, host_re, path_re in RULES:
        if not host_re.match(host):
            continue
        m = path_re.match(u.path)
        if not m:
            return (name, form, form)
        kind, ident = m.group(1), m.group(2)
        if name == 'apple' and kind == 'album':
            i = urllib.parse.parse_qs(u.query).get('i', [''])[0]
            if i.isdigit():
                kind, ident = 'song', i
        return (name, f'{name}:{kind}:{ident if name == "spotify" else ident.lower()}', form)
    am = re.match(r'^(music\.)?amazon\.[a-z.]+$', host) and (
        re.match(r'^/albums/([A-Z0-9]{10})(?:[/?#]|$)', u.path, re.I) or re.search(r'/(?:dp|gp/product)/([A-Z0-9]{10})(?:[/?#]|$)', u.path, re.I))
    if am:
        return (host, f'{host}:{am.group(1).upper()}', form)
    return (host, form, form)


def get(url, tries=6):
    """One JSON GET with the probe's User-Agent; a 503 is retried after its Retry-After (at least 2 s)."""
    import urllib.error
    for attempt in range(tries):
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code != 503 or attempt == tries - 1:
                raise
            wait = max(2.0, float(e.headers.get('Retry-After') or 0)) * (attempt + 1)
            print(f'503, retrying in {wait:.0f} s', file=sys.stderr)
            time.sleep(wait)
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--artist', default='70248960-cb53-4ea4-943a-edb18f7d336f')
    ap.add_argument('--kind', default='release', choices=['release', 'release-group'])
    ap.add_argument('--pages', type=int, default=5)
    ap.add_argument('--out')
    a = ap.parse_args()
    same, multi = [], []
    total = 0
    for p in range(a.pages):
        url = (f'https://musicbrainz.org/ws/2/{a.kind}?artist={a.artist}&inc=url-rels'
               f'&limit=100&offset={p * 100}&fmt=json')
        data = get(url)
        items = data.get('releases' if a.kind == 'release' else 'release-groups', [])
        total += len(items)
        for e in items:
            urls = [r['url']['resource'] for r in e.get('relations', []) if r.get('url')]
            sites = {}
            for x in urls:
                k = page_key(x)
                if not k:
                    continue
                sites.setdefault(k[0], {}).setdefault(k[1], set()).add(k[2])
            for site, pages in sites.items():
                for key, forms in pages.items():
                    if len(forms) >= 2:
                        same.append({'id': e['id'], 'title': e.get('title'), 'site': site, 'forms': sorted(forms)})
                if len(pages) >= 2:
                    multi.append({'id': e['id'], 'title': e.get('title'), 'site': site, 'pages': len(pages)})
        if len(items) < 100:
            break
        time.sleep(1.1)
    out = {'artist': a.artist, 'kind': a.kind, 'entities': total, 'same_page': same, 'multi_site': multi}
    text = json.dumps(out, indent=2, ensure_ascii=False)
    if a.out:
        with open(a.out, 'w', encoding='utf-8') as f:
            f.write(text + '\n')
    print(f'{total} {a.kind}s · {len(same)} same-page · {len(multi)} multi-site')
    for s in same[:20]:
        print(f"SAME  https://musicbrainz.org/{a.kind}/{s['id']}  {s['site']}: {' | '.join(s['forms'])}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
