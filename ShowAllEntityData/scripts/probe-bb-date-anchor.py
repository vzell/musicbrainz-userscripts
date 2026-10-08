"""U0 of the external-link previews (org/iframe.org, "* generalize to URLs"):
how does a Brucebase year page hold the show a date anchor names?

MusicBrainz events link Brucebase as "reviews" with a URL such as
http://brucebase.wikidot.com/2025#261025: the year page, and a fragment
that is the date as ddmmyy. The planned "Brucebase date" reader fetches the
year page once (every show of that year comes with it) and shows the one
show the fragment names. This probe establishes, on the live page, what the
fragment points at and what one show's block holds, so the reader's parser
is written from the page and not from a guess.

It saves the page to debug/bb-year-<year>.html (gitignored) for the reader's
fixture, and reports:
  1. the request: status, redirect chain, bytes, time;
  2. every element whose id or name is a six-digit date, how many, which tag
     they are, and whether the requested fragment is among them;
  3. the requested show's block: the anchor's ancestors, then the HTML and
     text from the anchor to the next date anchor, the links in it (gig
     pages, venues), and its headings;
  4. a second year (an older one) to see whether the shape is the same.

usage: python3 scripts/probe-bb-date-anchor.py [URL ...]
       (default: the event page's link and a 1978 show; one request per
       distinct year page, 1.1 s apart)

Results of the first runs (2026-10-08, host NB-3641) are recorded in
org/iframe.org, "* generalize to URLs", "U0: probes", X8: <a name="ddmmyy">
in #page-content > p, 2 to 3.5 KB per show, year pages 121 to 363 KB.
"""
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-ext-preview-probe/1.0 ( info@volkerzell.de )'
SPACING_S = 1.1
DEFAULTS = ['http://brucebase.wikidot.com/2025#261025', 'http://brucebase.wikidot.com/1978#190978']

_last = [0.0]


class _Chain(urllib.request.HTTPRedirectHandler):
    """Records every redirect (status, Location) of one request."""

    def __init__(self):
        super().__init__()
        self.hops = []

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        """Keeps the hop, then follows it as urllib normally does."""
        self.hops.append((code, newurl))
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url):
    """GET one page, 1.1 s after the previous request. Returns (status,
    final URL, hops, text, bytes, ms)."""
    wait = _last[0] + SPACING_S - time.time()
    if wait > 0:
        time.sleep(wait)
    _last[0] = time.time()
    chain = _Chain()
    opener = urllib.request.build_opener(chain)
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    t0 = time.time()
    try:
        with opener.open(req, timeout=60) as r:
            status, final, body = r.status, r.geturl(), r.read()
    except urllib.error.HTTPError as e:
        status, final, body = e.code, url, e.read()
    ms = round((time.time() - t0) * 1000)
    return status, final, chain.hops, body.decode('utf-8', 'replace'), len(body), ms


def text_of(html):
    """Visible text of an HTML fragment, whitespace collapsed."""
    t = re.sub(r'<(script|style)\b.*?</\1>', ' ', html, flags=re.I | re.S)
    t = re.sub(r'<br\s*/?>', '\n', t, flags=re.I)
    t = re.sub(r'<[^>]+>', ' ', t)
    t = re.sub(r'&nbsp;', ' ', t)
    t = re.sub(r'[ \t]+', ' ', t)
    return re.sub(r'\n\s*', '\n', t).strip()


def ancestors(html, pos):
    """The open tags around position `pos` (a rough stack, enough to see
    whether an anchor sits in a table row, a div or a heading)."""
    stack = []
    for m in re.finditer(r'<(/?)([a-zA-Z0-9]+)([^>]*)>', html[:pos]):
        closing, tag, attrs = m.group(1), m.group(2).lower(), m.group(3)
        if tag in ('br', 'img', 'hr', 'meta', 'link', 'input'):
            continue
        if closing:
            while stack and stack[-1][0] != tag:
                stack.pop()
            if stack:
                stack.pop()
        elif not attrs.rstrip().endswith('/'):
            cls = re.search(r'class="([^"]*)"', attrs)
            ident = re.search(r'id="([^"]*)"', attrs)
            stack.append((tag, (f'#{ident.group(1)}' if ident else '') + (f'.{cls.group(1).replace(" ", ".")}' if cls else '')))
    return ' > '.join(t + a for t, a in stack[-8:])


def report(url):
    """Fetches one year page and reports how its date anchors are built."""
    p = urllib.parse.urlsplit(url)
    frag = p.fragment
    page = urllib.parse.urlunsplit((p.scheme, p.netloc, p.path, p.query, ''))
    print(f'\n# {url}')
    status, final, hops, html, nbytes, ms = fetch(page)
    print(f'   HTTP {status} · {nbytes:,} bytes · {ms} ms · final {final}'
          + (' · redirects: ' + ' → '.join(f'{c} {u}' for c, u in hops) if hops else ''))
    if status != 200:
        return
    year = p.path.strip('/')
    os.makedirs('debug', exist_ok=True)
    with open(f'debug/bb-year-{year}.html', 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'   saved debug/bb-year-{year}.html')

    anchors = [(m.start(), m.group(1), m.group(2), m.group(0)[:120])
               for m in re.finditer(r'<([a-zA-Z0-9]+)\b[^>]*?\b(?:id|name)="(\d{6})"[^>]*>', html)]
    tags = {}
    for _, tag, _, _ in anchors:
        tags[tag] = tags.get(tag, 0) + 1
    print(f'\n   six-digit id/name anchors: {len(anchors)} {tags}')
    for a in anchors[:3]:
        print(f'     e.g. {a[3]}')
    ids = [a[2] for a in anchors]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    print(f'   duplicate dates (two shows a day?): {dupes or "none"}')
    if frag not in ids:
        near = [m.start() for m in re.finditer(re.escape(frag), html)]
        print(f'   the fragment {frag} is NOT an id/name; it occurs as text {len(near)} time(s)')
        for pos in near[:3]:
            print(f'     ...{html[max(0, pos - 160):pos + 80]!r}')
        return
    i = ids.index(frag)
    start = anchors[i][0]
    end = anchors[i + 1][0] if i + 1 < len(anchors) else start + 6000
    block = html[start:end]
    print(f'\n   the anchor {frag}: {anchors[i][3]}')
    print(f'   inside: {ancestors(html, start)}')
    print(f'   block to the next date anchor: {len(block):,} characters of HTML')
    heads = re.findall(r'<(h[1-6]|strong|b)\b[^>]*>(.*?)</\1>', block, re.I | re.S)
    print(f'   headings / bold: {[text_of(h[1])[:70] for h in heads[:8]]}')
    links = re.findall(r'<a\b[^>]*href="([^"]+)"[^>]*>(.*?)</a>', block, re.I | re.S)
    print(f'   links ({len(links)}):')
    for href, inner in links[:12]:
        print(f'     {href}  |  {text_of(inner)[:60]}')
    imgs = re.findall(r'<img\b[^>]*src="([^"]+)"', block, re.I)
    print(f'   images: {len(imgs)}' + (f' (first: {imgs[0]})' if imgs else ''))
    print('   text:')
    for ln in text_of(block).split('\n')[:25]:
        if ln.strip():
            print(f'     | {ln[:110]}')


def main():
    """Probes the URLs given, or the defaults."""
    urls = sys.argv[1:] or DEFAULTS
    print(f'probe-bb-date-anchor · {time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())} · host {os.uname().nodename}')
    for u in urls:
        report(u)
    print(f'\nfinished {time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())}')


if __name__ == '__main__':
    main()
