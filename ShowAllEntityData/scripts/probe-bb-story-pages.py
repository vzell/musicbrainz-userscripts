#!/usr/bin/env python3
"""Probes every Brucebase story page of the BruceParser mirror (`story:`,
1,489 pages; org/brucebase.org Phase 12, the `bb-story` pageType) for what
a converter must read: per kind (the name's first word: story, talk,
speech, interview, dj, …) the title shape, the breadcrumbs, the banner,
how many paragraphs open with a bold heading ("Intro to "Song"", "After
…") and how many carry on the one above, the heading's words and quotes,
"Compiled by", every other kind of markup in #page-content, the links (to
an event page?), whether an event page of the same name is in the mirror,
and the tags. No network.

    python3 scripts/probe-bb-story-pages.py [mirror_dir]

Writes debug/bb-story-probe.json (per page, for the mockup and the
fixture choice) and prints the summary.
"""
import collections
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIRROR = sys.argv[1] if len(sys.argv) > 1 else '/home/vzell/git/scripts/BruceParser/bb/latest'
EVENT_DIRS = ['gig', 'nogig', 'recording', 'rehearsal', 'interview']


def text(fragment):
    """The visible text of an HTML fragment, whitespace collapsed."""
    t = re.sub(r'<br\s*/?>', ' ', fragment)
    t = html.unescape(re.sub(r'<[^>]+>', '', t))
    return re.sub(r'\s+', ' ', t).strip()


def content_of(page):
    """#page-content's inner HTML (up to the tags line)."""
    m = re.search(r'<div id="page-content">(.*?)<div class="page-tags">', page, re.S)
    return m.group(1) if m else ''


def event_slugs():
    """Every event page's name in the mirror, by its slug after the category."""
    out = {}
    for d in EVENT_DIRS:
        p = os.path.join(MIRROR, d)
        if not os.path.isdir(p):
            continue
        for f in os.listdir(p):
            m = re.match(rf'^{d}_(.+)\.html$', f)
            if m:
                out.setdefault(m.group(1), []).append(d)
    return out


def main():
    """Reads every story page; prints the summary."""
    sdir = os.path.join(MIRROR, 'story')
    files = sorted(f for f in os.listdir(sdir) if f.endswith('.html'))
    events = event_slugs()
    by_kind = collections.defaultdict(list)
    heads = collections.Counter()
    quotes = collections.Counter()
    others = collections.Counter()
    pages = []
    for f in files:
        name = f[len('story_'):-len('.html')]
        kind = name.split('-')[0]
        with open(os.path.join(sdir, f), encoding='utf-8', errors='replace') as fh:
            page = fh.read()
        title = text((re.search(r'<div id="page-title">(.*?)</div>', page, re.S) or [None, ''])[1])
        crumbs = re.search(r'<div id="breadcrumbs">(.*?)</div>', page, re.S)
        crumb_links = re.findall(r'<a href="([^"]+)">([^<]*)</a>', crumbs.group(1)) if crumbs else []
        c = content_of(page)
        paras = re.findall(r'<p>(.*?)</p>', c, re.S)
        moments, carry, momentless = 0, 0, 0
        for p in paras:
            t = text(p)
            if not t or t.startswith('Compiled by'):
                continue
            s = re.match(r'\s*<strong>(.*?)</strong>', p, re.S)
            if s:
                h = text(s.group(1))
                moments += 1
                q = re.match(r'^(.*?)\s*["“”´`\']+(.+?)["“”´`\']+\s*$', h)
                heads[(q.group(1) if q else h)[:40]] += 1
                quotes[re.sub(r'[^"“”´`\']', '', h)[:4] or '(none)'] += 1
            elif moments:
                carry += 1
            else:
                momentless += 1
        compiled = text((re.search(r'Compiled by\s*:?\s*([^<]*)', c) or [None, ''])[1])
        tags = re.findall(r'href="/system:page-tags/tag/([^"#]+)', page.split('<div class="page-tags">')[-1])
        for tag in re.findall(r'<(ul|ol|blockquote|iframe|h[1-6]|img|div class="[^"]*"|table|hr|em|a href="/[a-z]+:)', c):
            others[tag] += 1
        links = re.findall(r'<a href="(/[a-z]+:[^"]+)"', c)
        slug = re.sub(r'^[a-z]+-', '', name)
        rec = {
            'file': f, 'name': name, 'kind': kind, 'title': title, 'crumbs': crumb_links,
            'moments': moments, 'carry': carry, 'momentless': momentless, 'compiled': bool(compiled),
            'banner': re.findall(r'<img[^>]*title="([^"]*)"', c)[:2], 'links': links[:6],
            'event': events.get(slug, []), 'tags': tags, 'bytes': len(page),
        }
        pages.append(rec)
        by_kind[kind].append(rec)
    print(f'{len(files)} story pages in {sdir}')
    for kind, recs in sorted(by_kind.items(), key=lambda kv: -len(kv[1])):
        n = len(recs)
        print(f'\n== {kind}: {n}')
        print(f'   moments: total {sum(r["moments"] for r in recs)}, pages with none {sum(1 for r in recs if not r["moments"])}, '
              f'carry-on paras {sum(r["carry"] for r in recs)}, paras before any heading {sum(r["momentless"] for r in recs)}')
        print(f'   compiled by: {sum(r["compiled"] for r in recs)}; breadcrumbs with links: {sum(1 for r in recs if r["crumbs"])}; '
              f'event page in mirror: {sum(1 for r in recs if r["event"])} ({collections.Counter(e for r in recs for e in r["event"]).most_common()})')
        print(f'   banners: {collections.Counter(b for r in recs for b in r["banner"]).most_common(4)}')
        print(f'   titles: {[r["title"] for r in recs[:3]]}')
        print(f'   links in content: {collections.Counter(l.split(":")[0] for r in recs for l in r["links"]).most_common(6)}')
        print(f'   tags (most common): {collections.Counter(t for r in recs for t in r["tags"]).most_common(8)}')
        nomo = [r['name'] for r in recs if not r['moments']][:4]
        if nomo:
            print(f'   no moments, e.g.: {nomo}')
    print(f'\nheadings (before the quote): {heads.most_common(25)}')
    print(f'quote marks: {quotes.most_common(10)}')
    print(f'other markup: {others.most_common(25)}')
    with open(os.path.join(ROOT, 'debug', 'bb-story-probe.json'), 'w', encoding='utf-8') as fh:
        json.dump(pages, fh, ensure_ascii=False, indent=0)
    return 0


if __name__ == '__main__':
    sys.exit(main())
