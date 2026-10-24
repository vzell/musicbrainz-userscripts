"""Brucebase venue pages: what does one hold, across eras and countries
(vzell, 2026-10-24: "Parse a couple different venue links to get the idea
about their content and write a venue parser/reader")?

A year page's Venue cell links the ENTRY page, not the venue; the entry page
names the venue in its "Info & Setlist | Venue" line
(`<a href="/venue:…">Venue</a>`, debug/bb-event-detail.html). This probe
takes the entry pages already cached in debug/foreign-images/ (the
setlist-images probe read them) plus the 2026-03-20 rehearsal, reads each
one's venue link, fetches that venue page (cached in debug/foreign-images/,
1.1 s apart, one at a time) and reports its parts:

- the page title and the breadcrumbs (Home » … » Venues In <region> » title);
- the description paragraphs before the performance count, and their Source;
- the "Springsteen did N performances, excl. rehearsals" count;
- the tab labels and, per tab, links to entry pages / images / "Sorry, no …";
- anything else in `#page-content`, so a page shaped differently shows up.

usage: python3 -I scripts/probe-bb-venue-pages.py [--refresh] [ENTRY_PATH ...]
"""
import html
import os
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'debug', 'foreign-images')
UA = 'ShowAllEntityData-bb-venue-probe/1.0 ( info@volkerzell.de )'
SPACING_S = 1.1
EXTRA = ['/rehearsal:2026-03-20-youth-temple-ocean-grove-nj', '/gig:1973-01-03-max-s-kansas-city-new-york-city-ny',
         '/gig:1975-08-13-bottom-line-new-york-city-ny', '/gig:1985-06-01-castle-slane-ireland',
         '/gig:1985-04-10-kokuritsu-yoyogi-kyogi-jo-tokyo-japan']

_last = [0.0]


def _wait():
    """Keep requests SPACING_S apart."""
    d = _last[0] + SPACING_S - time.time()
    if d > 0:
        time.sleep(d)
    _last[0] = time.time()


def fetch(path, refresh):
    """A page's HTML, from the cache or the site; ('', reason) on a failure."""
    url = 'https://brucebase.wikidot.com' + path
    name = 'brucebase.wikidot.com_' + path.strip('/').replace(':', '_').replace('/', '_') + '.html'
    file = os.path.join(CACHE, name)
    if os.path.exists(file) and not refresh:
        with open(file, encoding='utf-8', errors='replace') as f:
            return f.read(), 'cache'
    _wait()
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            text = r.read().decode('utf-8', 'replace')
            status = r.status
    except urllib.error.HTTPError as e:
        return '', f'HTTP {e.code}'
    except Exception as e:  # noqa: BLE001
        return '', type(e).__name__
    os.makedirs(CACHE, exist_ok=True)
    with open(file, 'w', encoding='utf-8') as f:
        f.write(text)
    return text, f'HTTP {status}'


def text_of(fragment):
    """Visible text of an HTML fragment, whitespace folded."""
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', fragment))).strip()


def content(page):
    """`#page-content` up to the page tags (the footer box cut off)."""
    m = re.search(r'<div id="page-content">(.*?)<div class="page-tags">', page, re.S)
    body = m.group(1) if m else page
    return re.split(r'<a href="/content:disclaimer">', body)[0]


def report(entry, refresh):
    """Print one venue page's parts, reached from an entry page."""
    epage, how = fetch(entry, refresh)
    m = re.search(r'<a href="(/venue:[^"]+)">Venue</a>', epage)
    if not m:
        print(f'{entry} ({how}): no venue link')
        return
    vpath = m.group(1)
    page, how = fetch(vpath, refresh)
    print(f'=== {vpath} ({how}) from {entry}')
    if not page:
        return
    t = re.search(r'<div id="page-title">(.*?)</div>', page, re.S)
    print('  title:', text_of(t.group(1)) if t else None)
    b = re.search(r'<div id="breadcrumbs">(.*?)</div>', page, re.S)
    print('  breadcrumbs:', text_of(b.group(1)) if b else None)
    body = content(page)
    tabs_at = body.find('<div id="wiki-tabview')
    head = body[:tabs_at] if tabs_at >= 0 else body
    paras = [text_of(p) for p in re.findall(r'<p>(.*?)</p>', head, re.S)]
    for p in paras:
        print('  p:', (p[:140] + '…') if len(p) > 140 else p)
    other = sorted(set(re.findall(r'<(table|img|ul|ol|div class="[^"]+"|h\d|blockquote)', head)))
    print('  head tags:', other)
    labels = [text_of(x) for x in re.findall(r'<li[^>]*><a href="javascript:;"><em>(.*?)</em>', body)]
    print('  tabs:', labels)
    for i, part in enumerate(re.split(r'<div id="wiki-tab-0-\d+"', body)[1:]):
        lab = labels[i] if i < len(labels) else f'#{i}'
        ev = re.findall(r'href="/((?:gig|nogig|rehearsal|recording|interview|nobruce):[^"]+)"', part)
        imgs = re.findall(r'local--resized-images/([^/"]+)/[^/"]+/thumbnail\.jpg', part)
        sorry = re.findall(r'Sorry, no [^<.]*', part)
        other = sorted(set(re.findall(r'href="/([a-z]+):', part)) - {'gig', 'nogig', 'rehearsal', 'recording', 'interview', 'nobruce'})
        print(f'  tab {lab}: {len(ev)} entry links, {len(imgs)} images {sorted(set(imgs))[:3]}, sorry={sorry}, other link kinds={other}')
        if ev:
            print('    first/last:', ev[0], '…', ev[-1])


def main(argv):
    """Report every sampled venue page."""
    refresh = '--refresh' in argv
    entries = [a for a in argv if a.startswith('/')]
    if not entries:
        cached = sorted(f for f in os.listdir(CACHE) if re.match(r'brucebase\.wikidot\.com_(gig|nogig|rehearsal)_', f))
        entries = ['/' + re.sub(r'^brucebase\.wikidot\.com_', '', f[:-5]).replace('_', ':', 1) for f in cached] + EXTRA
    for e in dict.fromkeys(entries):
        report(e, refresh)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
