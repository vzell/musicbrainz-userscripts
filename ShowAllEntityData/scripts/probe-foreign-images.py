"""Images on the non-MusicBrainz sites: where a row's pictures live, and
whether the thumbnail -> full-size rule holds (org/foreign-images.org).

MusicBrainz's image hover card and full-screen viewer are to come to the
foreign pageTypes (sl-*, jl-*, bs-*, bb-*; discogs.com already has both).
Those tables mostly show no image at all: the pictures sit on each row's item
page. This probe reads a few item pages per site, taking the links from the
committed fixtures, and reports per page:

  1. every image the detail parsers would pick up (the `_dpParse*` selectors:
     springsteenlyrics `img[src*="_tn."]` and `lyrics/images/`, jungleland
     `a > img` under `artwork/`, brucespringsteen.it `img[src*="blegs"]`),
     plus the Wikidot gallery links (`a.with-lb`) and any content image on a
     Brucebase `/gig:` page, which no parser reads yet;
  2. the full-size URL: the wrapping link, and whether the derivation rule
     (drop `_tn`, drop `thumb/tn_`, `local--resized-images` -> `local--files`
     minus `/thumbnail.jpg`) gives the same URL;
  3. one HEAD per site on a full-size URL (status, type, length).

A refusal (403, Cloudflare page) is recorded as such, never as "no images".
Pages are cached in the --out directory, so a re-run costs no request;
--refresh fetches again. Requests are 1.1 s apart, one at a time.

usage: python3 -I scripts/probe-foreign-images.py [--out DIR] [--refresh]
"""
import html.parser
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = os.path.join(ROOT, 'tests', 'fixtures')
UA = 'ShowAllEntityData-foreign-images-probe/1.0 ( info@volkerzell.de )'
SPACING_S = 1.1
PER_SOURCE = 4

_last = [0.0]


def _read(name):
    """A fixture's text (latin-1 safe)."""
    with open(os.path.join(FIX, name), 'rb') as f:
        return f.read().decode('utf-8', 'replace')


def _uniq(seq):
    """Order-preserving de-duplication."""
    seen, out = set(), []
    for x in seq:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def sources():
    """(site, kind, url) triples, links read from the committed fixtures."""
    out = []
    sl = 'https://www.springsteenlyrics.com/'
    for fx, rx in (('sl-bootlegs-page1.html', r'bootlegs\.php\?item=\d+'),
                   ('sl-brucelegs-page1.html', r'brucelegs\.php\?item=\d+'),
                   ('sl-lyrics-b.html', r'lyrics\.php\?song=[\w-]+')):
        links = _uniq(re.findall(rx, _read(fx)))
        kind = fx.split('-page')[0].replace('.html', '')
        out += [('springsteenlyrics', kind, sl + h) for h in links[:PER_SOURCE]]
    out += [('springsteenlyrics', 'sl-collection', sl + 'collection.php?item=' + n)
            for n in ('7431', '8981')]
    jl = _uniq(re.findall(r'href="(\d{8}[^"]*\.htm)"', _read('jl-list-page1.html')))
    # Across the decades: the first link of each.
    by_dec = {}
    for h in jl:
        by_dec.setdefault(h[:3], h)
    out += [('jungleland', 'jl-list', 'https://www.jungleland.it/html/' + h)
            for h in list(by_dec.values())[:6]]
    for fx in ('bs-records-lp.html', 'bs-records-unofficial.html'):
        codes = _uniq(re.findall(r'detrec\.aspx\?code=(\w+)', _read(fx)))
        out += [('brucespringsteen', fx.replace('.html', ''),
                 'https://www.brucespringsteen.it/DB/detrec.aspx?code=' + c)
                for c in codes[:PER_SOURCE]]
    bb = 'https://brucebase.wikidot.com'
    songs = _uniq(re.findall(r'href="(/song:[^"]+)"', _read('bb-songs.html')))
    out += [('brucebase', 'bb-songs', bb + h) for h in songs[2:2 + PER_SOURCE]]
    gigs = _uniq(re.findall(r'href="(/gig:[^"]+)"', _read('bb-year-1985.html')))
    out += [('brucebase', 'bb-year', bb + h) for h in gigs[:PER_SOURCE]]
    return out


def _slug(url):
    """A cache file name for a URL."""
    u = urllib.parse.urlsplit(url)
    s = re.sub(r'[^\w.-]+', '_', u.netloc + u.path + ('_' + u.query if u.query else ''))
    return s[:150] + '.html'


def _wait():
    """Keep the request spacing."""
    d = SPACING_S - (time.time() - _last[0])
    if d > 0:
        time.sleep(d)
    _last[0] = time.time()


def fetch(url, outdir, refresh):
    """The page: (text, status, note). Cached pages cost no request."""
    path = os.path.join(outdir, _slug(url))
    if os.path.exists(path) and not refresh:
        with open(path, 'rb') as f:
            return f.read().decode('utf-8', 'replace'), 200, 'cached'
    _wait()
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            status = r.status
    except urllib.error.HTTPError as e:
        return '', e.code, 'refused' if e.code in (403, 429, 503) else 'http-error'
    except Exception as e:  # noqa: BLE001 -- recorded, not raised
        return '', 0, 'error: ' + type(e).__name__
    text = raw.decode('utf-8', 'replace')
    if 'cf-browser-verification' in text or 'Just a moment...' in text:
        return text, status, 'refused (challenge page)'
    with open(path, 'wb') as f:
        f.write(raw)
    return text, status, 'fetched'


class _Imgs(html.parser.HTMLParser):
    """Every <img>, with the href and class of the <a> around it."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.imgs = []

    def handle_starttag(self, tag, attrs):
        """Track open <a>s; record each <img>."""
        a = dict(attrs)
        if tag == 'a':
            self.stack.append(a)
        elif tag == 'img':
            outer = self.stack[-1] if self.stack else {}
            self.imgs.append({'src': a.get('src') or '', 'alt': a.get('alt') or '',
                              'href': outer.get('href'), 'aclass': outer.get('class') or ''})

    def handle_endtag(self, tag):
        """Close the innermost <a>."""
        if tag == 'a' and self.stack:
            self.stack.pop()


def _abs(u, base):
    """Absolute URL; jungleland writes backslashes."""
    if not u:
        return None
    return urllib.parse.urljoin(base, u.replace('\\', '/'))


def derive(site, thumb):
    """The full-size URL by rule alone, or None when the site has no rule."""
    if site == 'springsteenlyrics' and '_tn.' in thumb:
        return thumb.replace('_tn.', '.')
    if site == 'jungleland' and '/thumb/tn_' in thumb:
        return thumb.replace('/thumb/tn_', '/')
    if site == 'brucebase' and 'local--resized-images' in thumb:
        return re.sub(r'/[^/]*thumbnail[^/]*$', '', thumb.replace('local--resized-images', 'local--files'))
    if site == 'brucespringsteen':
        return thumb
    return None


def pick(site, kind, imgs):
    """The images that are artwork, by the parsers' selectors."""
    out = []
    for im in imgs:
        s = im['src'].replace('\\', '/')
        if site == 'springsteenlyrics':
            ok = '_tn.' in s or 'lyrics/images/' in s or re.search(r'collection/|bootlegs/|brucelegs/', s)
        elif site == 'jungleland':
            ok = bool(re.search(r'(^|/)artwork/', s)) and im['href']
        elif site == 'brucespringsteen':
            ok = 'blegs' in s.lower()
        else:
            ok = ('local--files' in s or 'local--resized-images' in s) and not re.search(r'-32\.png$|/content:files/', s)
        if ok:
            out.append(im)
    return out


def head(url):
    """(status, content-type, length) of a HEAD request."""
    _wait()
    req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.headers.get('Content-Type'), r.headers.get('Content-Length')
    except urllib.error.HTTPError as e:
        return e.code, None, None
    except Exception as e:  # noqa: BLE001
        return 0, type(e).__name__, None


def main(argv):
    """Run the probe; print a summary and write summary.json."""
    outdir = os.path.join(ROOT, 'debug', 'foreign-images')
    refresh = '--refresh' in argv
    if '--out' in argv:
        outdir = os.path.abspath(argv[argv.index('--out') + 1])
    os.makedirs(outdir, exist_ok=True)
    rows, headed = [], {}
    for site, kind, url in sources():
        text, status, note = fetch(url, outdir, refresh)
        p = _Imgs()
        p.feed(text)
        found = []
        for im in pick(site, kind, p.imgs):
            thumb = _abs(im['src'], url)
            full = _abs(im['href'], url) if im['href'] else None
            if full and not re.search(r'\.(jpe?g|png|gif|webp)(\?|$)', full, re.I):
                full_kind = 'page'
            else:
                full_kind = 'image' if full else 'none'
            rule = derive(site, thumb)
            found.append({'thumb': thumb, 'full': full, 'full_kind': full_kind,
                          'rule': rule, 'rule_matches': bool(rule and full and rule == full),
                          'alt': im['alt'][:60], 'aclass': im['aclass']})
        rows.append({'site': site, 'kind': kind, 'url': url, 'status': status,
                     'note': note, 'bytes': len(text), 'images': found})
        target = next((f['full'] for f in found if f['full_kind'] == 'image'), None) \
            or next((f['rule'] for f in found if f['rule']), None)
        if target and site not in headed:
            headed[site] = {'url': target, 'head': head(target)}
        print(f'{site:17} {kind:24} {status:3} {note:9} {len(found):2} img  {url}')
        for f in found[:3]:
            print(f'    {f["full_kind"]:5} rule={"=" if f["rule_matches"] else ("≠" if f["rule"] else "-")} {f["thumb"]}')
    stamp = time.strftime('%Y-%m-%dT%H:%M:%S%z')
    with open(os.path.join(outdir, 'summary.json'), 'w', encoding='utf-8') as f:
        json.dump({'run': stamp, 'pages': rows, 'head': headed}, f, indent=1, ensure_ascii=False)
    print('\nHEAD per site:')
    for site, h in headed.items():
        print(f'  {site:17} {h["head"]}  {h["url"]}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
