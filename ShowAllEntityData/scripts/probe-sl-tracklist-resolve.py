#!/usr/bin/env python3
"""Offline probe: how many tracklist titles of saved springsteenlyrics.com
item pages resolve to an SL song page, and to a MusicBrainz work?

No network. Reads the index JSON (scripts/probe-sl-song-index.py), the
MusicBrainz match JSON (scripts/probe-mb-bruce-works-sl.py) and every item
page given (tests/fixtures/detail-sl-*.html, debug/sl-*-detail.html). For
each tracklist line ("A1- TITLE", "01- TITLE #2 [partial]", "A1 Title - V1")
it strips the take, version and bracket notes as `_slSplitTrackTitle()`
does, then resolves the title:

  rule     drop a leading/trailing "(...)", NFD, keep [a-z0-9] -> a base slug
           that exists in the index
  index    the index has the title verbatim (normalised) under another slug
           (the exception list)
  miss     neither

For a bootleg (a "Date:" field) it also reports whether the index has the
song's version of that show (`<slug>_YYYY-MM-DD`).

Usage:
    python3 scripts/probe-sl-tracklist-resolve.py index.json mb.json page.html...
"""

import html
import json
import re
import sys
import unicodedata

TRACK_RE = re.compile(r'^\s*([A-Z]?\d{1,3})(?:-\s+|\.\s+|\s+)(.+?)\s*$')
MONTHS = {m: i + 1 for i, m in enumerate(
    ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'])}


def norm(t):
    """NFD, accents away, lower case, [a-z0-9] only."""
    t = unicodedata.normalize('NFD', t)
    return re.sub(r'[^a-z0-9]', '', ''.join(c for c in t if unicodedata.category(c) != 'Mn').lower())


def rule(t):
    """The slug rule: drop a trailing, then a leading parenthetical."""
    t = re.sub(r'\s*\([^()]*\)\s*$', '', t)
    t = re.sub(r'^\s*\([^()]*\)\s*', '', t)
    return norm(t)


def clean(title):
    """Takes, versions and bracket notes off, as _slSplitTrackTitle()."""
    t = re.sub(r'\s*\[[^\]]+\]', '', title)
    t = re.sub(r'\s+-\s+V\d+\b.*$', '', t)
    t = re.sub(r'\s+#\d+$', '', t)
    t = re.sub(r'\s*\(\d{1,3}:\d{2}(?:[.:]\d{1,3})?\)$', '', t)
    return t.strip()


def iso_date(text):
    """'07 Jul 1978' -> '1978-07-07', else ''."""
    m = re.search(r'(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})', text or '')
    if not m or m.group(2).lower() not in MONTHS:
        return ''
    return f'{m.group(3)}-{MONTHS[m.group(2).lower()]:02d}-{int(m.group(1)):02d}'


def main():
    """Resolves every tracklist line and prints per-page and total counts."""
    idx = json.load(open(sys.argv[1], encoding='utf-8'))['lines']
    mb = {r['slug']: r for r in json.load(open(sys.argv[2], encoding='utf-8'))['rows']}
    slugs = {ln['slug'] for ln in idx}
    by_title = {}
    for ln in idx:
        if '_' not in ln['slug']:
            by_title.setdefault(norm(ln['title']), ln['slug'])
    total = {'rule': 0, 'index': 0, 'miss': 0, 'dated': 0, 'mb': 0}
    for path in sys.argv[3:]:
        src = open(path, encoding='utf-8', errors='replace').read()
        m = re.search(r'<div class="divide30"></div>(?:<h3[^>]*>Tracks?l?i?s?t</h3>)?\s*<span class="monospaced">(.*?)</span>', src, re.S)
        if not m:
            continue
        date = iso_date(html.unescape(re.sub(r'<[^>]+>', ' ', (re.search(r'<em>Date:</em></span>([^<]*)', src) or [None, ''])[1])))
        lines = [html.unescape(re.sub(r'<[^>]+>', '', l)) for l in re.split(r'<br\s*/?>', m.group(1))]
        res = []
        for line in lines:
            t = TRACK_RE.match(line)
            if not t:
                continue
            title = clean(t.group(2))
            title = re.sub(r'^[^:]{2,60}:\s+', '', title) if ':' in title else title
            s = rule(title)
            how = 'rule' if s in slugs else ('index' if norm(title) in by_title else 'miss')
            slug = s if how == 'rule' else by_title.get(norm(title), '')
            dated = bool(date and slug and f'{slug}_{date}' in slugs)
            work = slug in mb and mb[slug]['how'] in ('annot', 'title')
            total[how] += 1
            total['dated'] += dated
            total['mb'] += work
            res.append(f'{t.group(1)} {title[:40]!r} {how}{" +" + date if dated else ""}{" MB:" + mb[slug]["how"] if work else ""}')
        print(f'\n{path} (date {date or "-"}): {len(res)} tracks')
        for r in res:
            print('   ', r)
    print('\nTOTAL', total)


if __name__ == '__main__':
    main()
