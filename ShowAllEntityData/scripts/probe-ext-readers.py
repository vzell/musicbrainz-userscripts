"""U0 of the external-link previews (org/iframe.org, "* generalize to URLs"):
what do the planned READERS get back from the sites they read?

The plan has a reader per known site (Wikipedia, Wikidata, YouTube, Discogs)
and a generic reader for every other page. This probe sends each reader's
candidate request against the live site and reports what the card would have:
the fields, the size, the time, the status and redirects, the headers that
matter (rate limits, CORS, cookies), and for the generic reader where in the
HTML the og: tags sit, which decides whether a 512 KB cap reads them.

What the docs say (read 2026-10-08):
- Wikimedia REST, https://www.mediawiki.org/wiki/Wikimedia_REST_API:
  `/api/rest_v1/page/summary/<title>`; fields from a live sample: type,
  title, description, extract, thumbnail, originalimage, content_urls,
  wikibase_item, lang, timestamp. The User-Agent policy
  (foundation.wikimedia.org, Policy:User-Agent_policy) wants an informative
  User-Agent from scripts and, from browser JavaScript that cannot set one,
  an `Api-User-Agent` header. Rate limits
  (mediawiki.org/wiki/Wikimedia_APIs/Rate_limits, "new in 2026"): 10/min
  unidentified, 200/min for an unauthenticated browser user, at most 3
  concurrent requests, 429 with Retry-After.
- oEmbed (oembed.com, providers.json): YouTube serves https watch, v/,
  youtu.be, playlist, shorts, embed and live URLs; errors 404, 401, 501.
- Discogs (https://www.discogs.com/developers): the page answered 403 to the
  doc fetcher, so nothing from the docs. The rate limit and the token are
  read here from the API's own `X-Discogs-Ratelimit*` headers.

A userscript's GM_xmlhttpRequest sends the BROWSER's User-Agent, so every
external page is fetched twice: with the probe's identifying UA, and with a
browser UA. A site that answers one and refuses the other says which one the
userscript will see.

Sections:
  1. Wikipedia summaries (an article, a title with punctuation, a German
     article, a disambiguation page, a missing title);
  2. Wikidata, two forms: Special:EntityData/<Q>.json against
     wbgetentities with labels|descriptions|aliases|sitelinks for one
     language (the size difference decides which one a card can afford);
  3. YouTube oEmbed: the event page's playlist, a video, a channel URL, an
     invalid video id;
  4. Discogs API, unauthenticated (and with $DISCOGS_TOKEN if set): artist,
     master, release; the rate-limit headers; image URLs present?
  5. Generic pages: setlist.fm, allmusic, rateyourmusic, songkick,
     brucebase, Wikipedia as a page: status, redirect chain, content type,
     bytes, the head's title/og:/twitter:/description/canonical/icon,
     JSON-LD types, the byte offset of the LAST og: tag, visible text length
     (a script-only page has almost none), Set-Cookie, CORS.

usage: python3 scripts/probe-ext-readers.py [--json OUT]
       (31 requests, 1.1 s apart per host; about 25 s)

Results of the first runs (2026-10-08, host NB-3641) are recorded in
org/iframe.org, "* generalize to URLs", "U0: probes", X1 to X6.
"""
import argparse
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-ext-preview-probe/1.0 ( info@volkerzell.de )'
BROWSER_UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
              '(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36')
SPACING_S = 1.1
CAP = 512 * 1024

_last = {}


class _Chain(urllib.request.HTTPRedirectHandler):
    """Records every redirect (status, Location) of one request."""

    def __init__(self):
        super().__init__()
        self.hops = []

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        """Keeps the hop, then follows it as urllib normally does."""
        self.hops.append((code, newurl))
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def get(url, ua=UA, accept='*/*', extra=None, attempts=3):
    """GET one URL, 1.1 s after the previous request to the same host.

    Returns a dict: status, final (URL after redirects), hops, headers
    (lower-case keys), body (bytes), ms. A 4xx is returned, not raised; 429
    and 5xx are retried with Retry-After as a floor.
    """
    host = urllib.parse.urlsplit(url).hostname
    headers = {'User-Agent': ua, 'Accept': accept}
    headers.update(extra or {})
    res = {}
    for attempt in range(1, attempts + 1):
        wait = _last.get(host, 0) + SPACING_S - time.time()
        if wait > 0:
            time.sleep(wait)
        _last[host] = time.time()
        chain = _Chain()
        opener = urllib.request.build_opener(chain)
        req = urllib.request.Request(url, headers=headers)
        t0 = time.time()
        try:
            with opener.open(req, timeout=60) as r:
                res = {'status': r.status, 'final': r.geturl(), 'headers': {k.lower(): v for k, v in r.headers.items()},
                       'body': r.read(), 'set_cookie': r.headers.get_all('Set-Cookie') or []}
        except urllib.error.HTTPError as e:
            res = {'status': e.code, 'final': e.geturl() or url, 'headers': {k.lower(): v for k, v in (e.headers or {}).items()},
                   'body': e.read(), 'set_cookie': (e.headers.get_all('Set-Cookie') if e.headers else None) or []}
        except Exception as e:  # DNS, TLS, timeout
            res = {'status': 0, 'final': url, 'headers': {}, 'body': str(e).encode(), 'set_cookie': []}
        res['ms'] = round((time.time() - t0) * 1000)
        res['hops'] = chain.hops
        if res['status'] in (429, 500, 502, 503, 504) and attempt < attempts:
            ra = res['headers'].get('retry-after', '')
            time.sleep(max(SPACING_S * attempt * 2, float(ra) if ra.isdigit() else 0))
            continue
        return res
    return res


def as_json(res):
    """The body parsed as JSON, or None."""
    try:
        return json.loads(res['body'].decode('utf-8'))
    except (ValueError, UnicodeDecodeError):
        return None


def line(label, value):
    """Prints one aligned report line."""
    print(f'   {label:<26} {value}')


def head(title, res):
    """Prints a request's header line: status, bytes, ms, redirects, CORS."""
    hops = ' → '.join(f'{c} {u}' for c, u in res['hops'])
    print(f'\n## {title}\n   HTTP {res["status"]} · {len(res["body"]):,} bytes · {res["ms"]} ms'
          + (f' · redirects: {hops}' if hops else ''))
    cors = res['headers'].get('access-control-allow-origin')
    line('content-type', res['headers'].get('content-type', '-'))
    if res['status'] >= 400 and 'html' in res['headers'].get('content-type', ''):
        html = res['body'].decode('utf-8', 'replace')
        t = re.search(r'<title[^>]*>(.*?)</title>', html, re.I | re.S)
        line('refusal page title', cut(t.group(1).strip() if t else None, 80))
        line('server / cf-mitigated', f'{res["headers"].get("server", "-")} / {res["headers"].get("cf-mitigated", "-")}')
    line('CORS allow-origin', cors or 'none (fetch() could not read it)')
    if res['set_cookie']:
        line('Set-Cookie', f'{len(res["set_cookie"])} cookie(s): ' + ', '.join(c.split('=')[0] for c in res['set_cookie']))


def cut(s, n=100):
    """A value shortened for one report line."""
    s = s if isinstance(s, str) else json.dumps(s, ensure_ascii=False)
    s = re.sub(r'\s+', ' ', s or '')
    return s if len(s) <= n else s[:n - 3] + '...'


def section_wikipedia(out):
    """1. Wikipedia REST summaries."""
    print('\n# 1. Wikipedia: /api/rest_v1/page/summary/<title>')
    cases = [
        ('en', 'TeachRock', 'the event annotation\'s link'),
        ('en', 'Greetings_from_Asbury_Park%2C_N.J.', 'punctuation, as MusicBrainz writes it (%2C)'),
        ('de', 'Bruce_Springsteen', 'another language'),
        ('en', 'Mercury', 'a disambiguation page'),
        ('en', 'No_such_article_ShowAllEntityData_probe', 'a missing title'),
    ]
    for lang, title, why in cases:
        url = f'https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title}'
        res = get(url, accept='application/json', extra={'Api-User-Agent': UA})
        head(f'{lang}:{title} ({why})', res)
        d = as_json(res) or {}
        for k in ('type', 'title', 'description', 'extract', 'thumbnail', 'wikibase_item', 'lang', 'timestamp'):
            line(k, cut(d.get(k)) if k in d else 'ABSENT')
        out.setdefault('wikipedia', []).append({'url': url, 'status': res['status'], 'bytes': len(res['body']),
                                                'type': d.get('type'), 'keys': sorted(d.keys())})
    # The same article with the browser's User-Agent and no Api-User-Agent:
    # what a userscript that forgets the header gets.
    url = 'https://en.wikipedia.org/api/rest_v1/page/summary/TeachRock'
    res = get(url, ua=BROWSER_UA, accept='application/json')
    head('en:TeachRock with a browser UA and no Api-User-Agent', res)


def section_wikidata(out, qid):
    """2. Wikidata: the full entity JSON against a trimmed wbgetentities."""
    print(f'\n# 2. Wikidata: {qid}')
    full = get(f'https://www.wikidata.org/wiki/Special:EntityData/{qid}.json', accept='application/json')
    head(f'Special:EntityData/{qid}.json (everything)', full)
    d = (as_json(full) or {}).get('entities', {}).get(qid, {})
    line('claims (properties)', len(d.get('claims') or {}))
    line('sitelinks', len(d.get('sitelinks') or {}))
    trim_url = ('https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*'
                f'&ids={qid}&props=labels|descriptions|aliases|sitelinks&languages=en&sitefilter=enwiki|dewiki')
    trim = get(trim_url, accept='application/json')
    head('wbgetentities, labels|descriptions|aliases|sitelinks, en only', trim)
    t = (as_json(trim) or {}).get('entities', {}).get(qid, {})
    line('label', cut((t.get('labels') or {}).get('en', {}).get('value')))
    line('description', cut((t.get('descriptions') or {}).get('en', {}).get('value')))
    line('aliases (en)', len((t.get('aliases') or {}).get('en') or []))
    line('sitelinks (filtered)', cut(list((t.get('sitelinks') or {}).keys())))
    out['wikidata'] = {'qid': qid, 'full_bytes': len(full['body']), 'trim_bytes': len(trim['body']),
                       'full_cors': full['headers'].get('access-control-allow-origin'),
                       'trim_cors': trim['headers'].get('access-control-allow-origin')}


def section_youtube(out):
    """3. YouTube oEmbed."""
    print('\n# 3. YouTube: oEmbed')
    cases = [
        ('https://www.youtube.com/playlist?list=PLM0aPYPhFzkq16BnNlrlAIcVvN1_TBmcS', 'the event annotation\'s playlist'),
        ('https://www.youtube.com/watch?v=M3r2XDceM6A', 'a video (oembed.com\'s own example)'),
        ('https://youtu.be/M3r2XDceM6A', 'the same video, short form'),
        ('http://www.youtube.com/brucebasewiki', 'a channel URL, http, as Brucebase links it'),
        ('https://www.youtube.com/watch?v=aaaaaaaaaaa', 'an id that does not exist'),
    ]
    for page, why in cases:
        url = 'https://www.youtube.com/oembed?format=json&url=' + urllib.parse.quote(page, safe='')
        res = get(url, accept='application/json')
        head(f'{page} ({why})', res)
        d = as_json(res) or {}
        for k in ('type', 'title', 'author_name', 'thumbnail_url', 'thumbnail_width'):
            line(k, cut(d.get(k)) if k in d else 'ABSENT')
        if res['status'] != 200:
            line('body', cut(res['body'].decode('utf-8', 'replace'), 80))
        out.setdefault('youtube', []).append({'page': page, 'status': res['status'], 'type': d.get('type')})


def section_discogs(out):
    """4. Discogs API, unauthenticated, then with $DISCOGS_TOKEN when set."""
    print('\n# 4. Discogs API')
    token = os.environ.get('DISCOGS_TOKEN', '').strip()
    paths = ['artists/219986', 'masters/26725', 'releases/1874253']
    runs = [('no token', {})]
    if token:
        runs.append(('with token', {'Authorization': f'Discogs token={token}'}))
    for label, extra in runs:
        for p in paths:
            res = get(f'https://api.discogs.com/{p}', accept='application/json', extra=extra)
            head(f'{p} ({label})', res)
            for h in ('x-discogs-ratelimit', 'x-discogs-ratelimit-used', 'x-discogs-ratelimit-remaining'):
                line(h, res['headers'].get(h, 'ABSENT'))
            d = as_json(res) or {}
            line('title / name', cut(d.get('title') or d.get('name')))
            line('year', d.get('year', 'ABSENT'))
            line('formats', cut([f.get('name') for f in d.get('formats') or []]) if 'formats' in d else 'ABSENT')
            line('labels', cut([lb.get('name') for lb in d.get('labels') or []]) if 'labels' in d else 'ABSENT')
            line('tracklist entries', len(d.get('tracklist') or []))
            imgs = d.get('images') or []
            line('images', f'{len(imgs)}; first uri: {cut(imgs[0].get("uri"), 70)}' if imgs else 'none in the answer')
            out.setdefault('discogs', []).append({'path': p, 'auth': label, 'status': res['status'],
                                                  'limit': res['headers'].get('x-discogs-ratelimit'),
                                                  'images': len(imgs),
                                                  'cors': res['headers'].get('access-control-allow-origin')})
    if not token:
        print('\n   (set DISCOGS_TOKEN to probe the authenticated budget too)')


_META_RE = re.compile(r'<meta\b[^>]*>', re.I)
_ATTR_RE = re.compile(r'([a-zA-Z:_-]+)\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)')


def _attrs(tag):
    """A tag's attributes as a lower-case-key dict."""
    return {k.lower(): v.strip('"\'') for k, v in _ATTR_RE.findall(tag)}


def read_head(html):
    """What the generic reader would take from a page: title, og:, twitter:,
    description, canonical, icon, JSON-LD types, and where the last og: tag
    ends (bytes from the start, so it can be held against the cap)."""
    found, last_og = {}, -1
    for m in _META_RE.finditer(html):
        a = _attrs(m.group(0))
        key = (a.get('property') or a.get('name') or '').lower()
        if key.startswith('og:') or key.startswith('twitter:') or key == 'description':
            found.setdefault(key, a.get('content', ''))
            if key.startswith('og:'):
                last_og = m.end()
    t = re.search(r'<title[^>]*>(.*?)</title>', html, re.I | re.S)
    canon = re.search(r'<link\b[^>]*rel=["\']?canonical[^>]*>', html, re.I)
    icon = re.search(r'<link\b[^>]*rel=["\']?(?:shortcut )?icon[^>]*>', html, re.I)
    ld = re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', html, re.I | re.S)
    types = []
    for block in ld:
        types += re.findall(r'"@type"\s*:\s*"([^"]+)"', block)
    text = re.sub(r'<(script|style|noscript)\b.*?</\1>', ' ', html, flags=re.I | re.S)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return {'title': t.group(1).strip() if t else None, 'meta': found,
            'canonical': _attrs(canon.group(0)).get('href') if canon else None,
            'icon': _attrs(icon.group(0)).get('href') if icon else None,
            'ld_types': types[:8], 'last_og_end': len(html[:last_og].encode('utf-8')) if last_og >= 0 else None,
            'visible_text': len(text)}


def section_generic(out):
    """5. Generic pages, each with the probe's UA and with a browser UA."""
    print('\n# 5. Generic pages (identifying UA, then a browser UA)')
    pages = [
        'https://www.setlist.fm/setlist/bruce-springsteen/2025/co-op-live-manchester-england-43535b97.html',
        'https://www.allmusic.com/album/mw0000650803',
        'https://rateyourmusic.com/release/album/bruce-springsteen/born-to-run/',
        'https://www.songkick.com/artists/227030',
        'http://brucebase.wikidot.com/2025',
        'https://www.discogs.com/release/1874253',
        'https://en.wikipedia.org/wiki/TeachRock',
    ]
    for page in pages:
        for label, ua in (('probe UA', UA), ('browser UA', BROWSER_UA)):
            res = get(page, ua=ua, accept='text/html,application/xhtml+xml')
            head(f'{page} ({label})', res)
            html = res['body'].decode('utf-8', 'replace')
            h = read_head(html) if res['status'] == 200 else {}
            if h:
                line('title', cut(h['title']))
                for k in ('og:title', 'og:description', 'og:image', 'og:type', 'twitter:card', 'description'):
                    line(k, cut(h['meta'].get(k), 90) if k in h['meta'] else 'ABSENT')
                line('canonical', cut(h['canonical']))
                line('icon', cut(h['icon']))
                line('JSON-LD @type', cut(h['ld_types']))
                last = h['last_og_end']
                line('last og: tag ends at', f'{last:,} bytes ({"inside" if last <= CAP else "PAST"} 512 KB)'
                     if last is not None else 'no og: tag')
                line('visible text', f'{h["visible_text"]:,} characters')
            out.setdefault('generic', []).append({
                'page': page, 'ua': label, 'status': res['status'], 'final': res['final'],
                'hops': res['hops'], 'bytes': len(res['body']), 'ms': res['ms'],
                'content_type': res['headers'].get('content-type'), 'cookies': len(res['set_cookie']),
                'cors': res['headers'].get('access-control-allow-origin'),
                'title': h.get('title'), 'og': sorted(k for k in h.get('meta', {}) if k.startswith('og:')),
                'last_og_end': h.get('last_og_end'), 'visible_text': h.get('visible_text')})


def wikidata_qid():
    """Bruce Springsteen's Wikidata item, read from his MusicBrainz URL
    relations rather than written from memory."""
    res = get('https://musicbrainz.org/ws/2/artist/70248960-cb53-4ea4-943a-edb18f7d336f?inc=url-rels&fmt=json',
              accept='application/json')
    for r in (as_json(res) or {}).get('relations') or []:
        m = re.search(r'wikidata\.org/wiki/(Q\d+)', (r.get('url') or {}).get('resource', ''))
        if m:
            return m.group(1)
    return None


def main():
    """Runs every section and optionally writes the summary as JSON."""
    ap = argparse.ArgumentParser()
    ap.add_argument('--json', default='', help='write a summary here (e.g. debug/probe-ext-readers.json)')
    args = ap.parse_args()
    started = time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())
    print(f'probe-ext-readers · {started} · host {os.uname().nodename}')
    out = {'started': started, 'host': os.uname().nodename}
    section_wikipedia(out)
    qid = wikidata_qid()
    if qid:
        section_wikidata(out, qid)
    else:
        print('\n# 2. Wikidata: no wikidata relation found on the artist; skipped')
    section_youtube(out)
    section_discogs(out)
    section_generic(out)
    out['finished'] = time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())
    print(f'\nfinished {out["finished"]}')
    if args.json:
        with open(args.json, 'w', encoding='utf-8') as f:
            json.dump(out, f, indent=1, ensure_ascii=False)
        print(f'summary written to {args.json}')


if __name__ == '__main__':
    main()
