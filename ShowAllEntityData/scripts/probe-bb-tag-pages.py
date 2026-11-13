#!/usr/bin/env python3
"""Probes Brucebase's tag pages, signed out, for Phase 11 of org/brucebase.org
(the pageTypes bb-tags, bb-tag, bb-pages-and-tags and a tag link reader).

Reads, one request at a time and 1 s apart:

    /system:page-tags                    the tag cloud
    /system:page-tags/tag/<tag>          one tag's pages, for a small and a big tag
                                         (and its /p/2 if the page has a pager)
    /manage:pages-and-tags               page 1 of the pages and their tags
    /manage:pages-and-tags/p/2, /p/<last>

and reports per page: bytes, seconds, the pager ("page 1 of N"), the
containers seen (pages-tag-cloud-box, pages-list, wiki-content-table, …),
item counts, and for a tag's page the markup of the first two items. Writes
each page to debug/ (gitignored):

    debug/bb-page-tags-raw.html
    debug/bb-tag-<tag>-raw.html (and -p2)
    debug/bb-pages-and-tags-p<N>-raw.html

    python3 scripts/probe-bb-tag-pages.py [--small storyteller] [--big <tag>]

Without --big the biggest tag of the cloud (largest font-size) is used.
"""

import argparse
import html
import os
import re
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://brucebase.wikidot.com'
UA = 'ShowAllEntityData-probe/1.0 (+https://github.com/vzell/mb-userscripts)'
_last = [0.0]


def get(path):
    """GET one page 1 s after the previous one; returns (text, seconds)."""
    wait = 1.0 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    t0 = time.time()
    req = urllib.request.Request(BASE + path, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=90) as res:
        text = res.read().decode('utf-8')
    _last[0] = time.time()
    return text, _last[0] - t0


def save(name, text):
    """Writes one page into debug/."""
    with open(os.path.join(ROOT, 'debug', name), 'w', encoding='utf-8') as f:
        f.write(text)


def content_of(text):
    """The #page-content part of a page (or the whole text)."""
    m = re.search(r'<div id="page-content"[^>]*>(.*?)<div class="page-tags"|<div id="page-content"[^>]*>(.*)', text, re.S)
    if not m:
        return text
    return m.group(1) or m.group(2) or ''


def describe(label, text, secs):
    """Prints what one page holds."""
    pc = content_of(text)
    pager = re.search(r'<span class="pager-no">([^<]*)</span>', text)
    classes = {}
    for c in re.findall(r'<(?:div|table|ul)[^>]*class="([^"]+)"', pc):
        for k in c.split():
            classes[k] = classes.get(k, 0) + 1
    top = sorted(classes.items(), key=lambda kv: -kv[1])[:14]
    print(f'{label}: {len(text):,} bytes, {secs:.1f} s, pager "{pager.group(1) if pager else "-"}"')
    print(f'    containers: {", ".join(f"{k}×{v}" for k, v in top)}')
    title = re.search(r'<div id="page-title">\s*(.*?)\s*</div>', text, re.S)
    print(f'    page-title: {html.unescape(re.sub("<[^>]+>", "", title.group(1))).strip() if title else "-"}')
    return pc


def probe_cloud():
    """The tag cloud: count, weights, and the biggest tags."""
    text, secs = get('/system:page-tags')
    save('bb-page-tags-raw.html', text)
    pc = describe('system:page-tags', text, secs)
    tags = re.findall(r'<a class="tag" href="/system:page-tags/tag/([^"#]+)#pages"[^>]*style="font-size:\s*([\d.]+)%[^"]*"[^>]*>([^<]*)</a>', pc)
    if not tags:
        tags = [(h, s, t) for h, s, t in re.findall(r'<a[^>]*href="/system:page-tags/tag/([^"#]+)[^"]*"[^>]*style="[^"]*font-size:\s*([\d.]+)%[^"]*"[^>]*>([^<]*)</a>', pc)]
    print(f'    tags: {len(tags):,}; distinct sizes: {len(set(s for _, s, _ in tags))}')
    sizes = sorted(set(float(s) for _, s, _ in tags))
    if sizes:
        print(f'    font-size range: {sizes[0]}% .. {sizes[-1]}%; first sizes {sizes[:8]}')
    m = re.search(r'<a[^>]*href="/system:page-tags/tag/[^>]*>[^<]*</a>', pc)
    print(f'    first link markup: {m.group(0)[:240] if m else "-"}')
    big = sorted(tags, key=lambda t: -float(t[1]))[:8]
    print('    biggest: ' + ', '.join(f'{t[2]} ({t[1]}%)' for t in big))
    return tags, big


def probe_tag(tag):
    """One tag's page (and its page 2 when it has a pager)."""
    enc = urllib.parse.quote(urllib.parse.unquote(tag), safe=':')
    text, secs = get(f'/system:page-tags/tag/{enc}')
    save(f'bb-tag-{re.sub(r"[^a-z0-9-]", "_", tag)}-raw.html', text)
    pc = describe(f'tag {tag}', text, secs)
    pages = re.search(r'<div[^>]*id="tagged-pages-list"[^>]*>(.*?)</div>\s*</div>', pc, re.S)
    area = pages.group(1) if pages else pc
    items = re.findall(r'<div class="pages-list-item">(.*?)</div>\s*</div>', area, re.S)
    print(f'    pages-list-item: {len(items)}; links to pages: {len(re.findall(r"<a href=\"/[^\"]+\"", area))}')
    for it in items[:2]:
        print('    item: ' + re.sub(r'\s+', ' ', it)[:300])
    if not items:
        i = pc.find('/system:page-tags/tag/')
        print('    no pages-list-item; content excerpt: ' + re.sub(r'\s+', ' ', pc[:1500]))
    pager = re.search(r'<span class="pager-no">page \d+ of (\d+)</span>', text)
    hrefs = sorted(set(re.findall(r'href="(/system:page-tags/tag/[^"]*/p/\d+)"', text)))[:4]
    print(f'    pager hrefs: {hrefs}')
    if pager and int(pager.group(1)) > 1 and hrefs:
        t2, s2 = get(hrefs[0])
        save(f'bb-tag-{re.sub(r"[^a-z0-9-]", "_", tag)}-p2-raw.html', t2)
        describe(f'tag {tag} {hrefs[0]}', t2, s2)


def probe_pat():
    """manage:pages-and-tags: p1, p2 and the last page."""
    text, secs = get('/manage:pages-and-tags')
    save('bb-pages-and-tags-p1-raw.html', text)
    pc = describe('manage:pages-and-tags p1', text, secs)
    rows = re.findall(r'<tr>(.*?)</tr>', pc, re.S)
    print(f'    rows: {len(rows)}')
    for r in rows[:3]:
        print('    row: ' + re.sub(r'\s+', ' ', r)[:300])
    m = re.search(r'page \d+ of (\d+)', text)
    last = int(m.group(1)) if m else 1
    hrefs = sorted(set(re.findall(r'href="(/manage:pages-and-tags/p/\d+)"', text)))
    print(f'    pager hrefs: {hrefs[:6]}')
    intro = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', pc.split('<table')[0]))[:600]
    print(f'    before the table: {intro}')
    for n in (2, last):
        t, s = get(f'/manage:pages-and-tags/p/{n}')
        save(f'bb-pages-and-tags-p{n}-raw.html', t)
        p = describe(f'manage:pages-and-tags p{n}', t, s)
        rs = re.findall(r'<tr>(.*?)</tr>', p, re.S)
        print(f'    rows: {len(rs)}; last row: {re.sub(r"<[^>]+>", " ", rs[-1]).split() if rs else "-"}')


def main():
    """Runs the probes."""
    ap = argparse.ArgumentParser()
    ap.add_argument('--small', default='storyteller')
    ap.add_argument('--big')
    a = ap.parse_args()
    print(f'probe started {time.strftime("%Y-%m-%dT%H:%M:%S%z")}')
    _, big = probe_cloud()
    probe_tag(a.small)
    probe_tag(a.big or (big[0][0] if big else 'gig'))
    probe_pat()


if __name__ == '__main__':
    main()
