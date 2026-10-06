"""Why does `data-li-big-src` carry -500.jpg for some releases and -250.jpg for
others on the same page (org/redesign-CAA-EAA-column.org, P0 / F0)?

`_artBuildImageLi()` picks the hover-preview URL with this ladder:

    thumbnails[String(sa_caa_big_img_size || 250)] || thumbnails['1200']
        || thumbnails['large'] || thumbnails['500'] || image

and strips a leading `http:`. In the design snapshot four releases of the
"Bootleg release" sub-table carried `//…-500.jpg` and one (Berlin Night)
carried `https:…-250.jpg`. This probe records, per image, which `thumbnails`
keys the archive returns and with which URL scheme, and prints what the ladder
yields for big size 250 — so the explanation rests on a measurement rather than
on a guess about two cache tiers.

Default: release group fa9c43a7-2592-3336-a09b-1414b4b6ee68 (the design study).
Its releases are listed with ONE WS/2 browse (`/ws/2/release?release-group=`),
then one archive request per release that has artwork, one second apart.

usage: python3 scripts/probe-caa-thumbnail-keys.py [release-group-mbid]
"""
import collections
import json
import sys
import time
import urllib.error
import urllib.request

DEFAULT_RG = 'fa9c43a7-2592-3336-a09b-1414b4b6ee68'
UA = 'ShowAllEntityData-caa-thumbnail-keys-probe/1.0 ( https://github.com/vzell/mb-userscripts )'


def get_json(url):
    """Fetch `url`; return (status, parsed JSON or None)."""
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return e.code, None
    except urllib.error.URLError as e:
        return f'transport error ({e.reason})', None


def scheme(url):
    """Classify a URL's scheme as 'http', 'https', '//' or 'other'."""
    if url.startswith('https:'):
        return 'https'
    if url.startswith('http:'):
        return 'http'
    if url.startswith('//'):
        return '//'
    return 'other'


def ladder(im, big_size='250'):
    """Return the URL `_artBuildImageLi()` would stamp as data-li-big-src."""
    th = im.get('thumbnails') or {}
    url = th.get(big_size) or th.get('1200') or th.get('large') or th.get('500') or im.get('image') or ''
    return url[5:] if url.startswith('http:') else url


def main():
    """Browse the release group's releases and probe each one's archive record."""
    rg = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_RG
    status, data = get_json(f'https://musicbrainz.org/ws/2/release?release-group={rg}&limit=100&fmt=json')
    time.sleep(1)
    if data is None:
        print(f'WS/2 browse HTTP {status}')
        return
    releases = data.get('releases', [])
    print(f'release group {rg}: {len(releases)} releases')
    for rel in releases:
        caa = rel.get('cover-art-archive', {})
        if not caa.get('count'):
            continue
        mbid = rel['id']
        status, rec = get_json(f'https://coverartarchive.org/release/{mbid}')
        time.sleep(1)
        print(f'== {rel.get("title")} [{mbid}] count={caa.get("count")} archive HTTP {status}')
        if rec is None:
            continue
        keysets = collections.Counter()
        schemes = collections.Counter()
        chosen = collections.Counter()
        for im in rec.get('images', []):
            th = im.get('thumbnails') or {}
            keysets[','.join(sorted(th.keys()))] += 1
            for k, u in th.items():
                schemes[f'{k}:{scheme(u)}'] += 1
            pick = ladder(im)
            chosen[f'{scheme(pick)} …{pick[-12:]}'] += 1
        print(f'   thumbnail key sets: {dict(keysets)}')
        print(f'   key:scheme: {dict(schemes)}')
        print(f'   big size 250 ladder picks: {dict(chosen)}')
        # An old record lists only small/large. Does the archive still serve a
        # 1200 rendition at the URL a new record would name? One HEAD request
        # for the first image of such a release, so the viewer's choice
        # (trust the listed keys vs derive -1200.jpg) rests on a measurement.
        first = (rec.get('images') or [None])[0]
        if first and '1200' not in (first.get('thumbnails') or {}):
            large = (first.get('thumbnails') or {}).get('large', '')
            if large.endswith('-500.jpg'):
                guess = 'https:' + large[len('http:'):] if large.startswith('http:') else large
                guess = guess[:-len('-500.jpg')] + '-1200.jpg'
                req = urllib.request.Request(guess, method='HEAD', headers={'User-Agent': UA})
                try:
                    with urllib.request.urlopen(req, timeout=60) as r:
                        print(f'   derived -1200.jpg HEAD: {r.status} ({r.headers.get("Content-Type")})')
                except urllib.error.HTTPError as e:
                    print(f'   derived -1200.jpg HEAD: {e.code}')
                except urllib.error.URLError as e:
                    print(f'   derived -1200.jpg HEAD: transport error ({e.reason})')
                time.sleep(1)


if __name__ == '__main__':
    main()
