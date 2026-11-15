#!/usr/bin/env python3
"""Probe: how many rows the batch 2 Brucebase findings would flag.

Track A batch 2 (org/bbp-parity.org): bb-list-title, bb-list-anchor (the year
listings against their year pages), bb-venue-mismatch (an event page's title
against its venue page's title) and bb-setlist-songs / bb-setlist-spelling
(a year page's setlist against the event page's). Reads BruceParser's mirror,
applies the rules the userscript is to ship, and compares the flagged shows
with BruceParser's own reports (the oracle) in <mirror>/REPORTING/.

The setlist readers here are this probe's own, simple ones (paragraphs in
capitals on the year page, the Setlist tab's lists on the event page): they
size the finding and are compared with the report. The shipped readers are
checked against the mirror by scripts/check-bb-batch2-findings.js.

Read-only. No network.

Usage:
    python3 scripts/probe-bb-batch2-findings.py [--mirror DIR] [--json FILE] [--list ID] [--show EVENT]

    --mirror DIR  the mirror (default ~/git/scripts/BruceParser/bb/latest)
    --json FILE   write every flagged row as JSON
    --rows FILE   write EVERY listing entry and every event with a venue page, with
                  its inputs and result, as JSON: the input of
                  scripts/check-bb-batch2-findings.js
    --list ID     print every row flagged with this finding id
    --show EVENT  print both setlists of one event ("gig:1978-09-20-…") and their difference
"""
import argparse
import html
import importlib.util
import json
import os
import re
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('batch1', os.path.join(HERE, 'probe-bb-batch1-findings.py'))
b1 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(b1)

VARIANTS = b1.VARIANTS_BBP + b1.VARIANTS_BP_ONLY
LIST_RE = re.compile(r'<li>\s*<a href="/(\d{4}(?:-\d\d)?)#([A-Za-z0-9]+)"[^>]*>(.*?)</a>', re.S)
VENUE_RE = re.compile(r'<a href="(/venue:[^"]+)"[^>]*>\s*Venue\s*</a>')
TAB_NAV_RE = re.compile(r'<ul class="yui-nav">(.*?)</ul>', re.S)
SUP_RE = re.compile(r'<sup\b.*?</sup>', re.S)
BLOCK_RE = re.compile(r'<(p|blockquote|div|table|ul|ol|hr|h\d)\b', re.S)


def read(path):
    """A mirror file's text, '' when it is missing."""
    if not os.path.exists(path):
        return ''
    with open(path, encoding='utf-8', errors='replace') as fh:
        return fh.read()


def event_file(mirror, href):
    """The mirror's file of an event or venue link ("/gig:1985-…")."""
    m = re.match(r'^/([a-z]+):(.+)$', href)
    return os.path.join(mirror, m.group(1), f'{m.group(1)}_{m.group(2)}.html') if m else ''


def page_title(page):
    """A page's title as written, ends trimmed."""
    t = b1.TITLE_RE.search(page)
    return b1.text_of(t.group(1)) if t else ''


# ── The venue check ──────────────────────────────────────────────────────────

def venue_part(title):
    """The venue part of an event page's title: what follows the date."""
    m = re.match(r'^\d{4}-\d\d-\d\d[a-z]?\s*(?:-\s*)?(.*)$', title, re.S)
    return m.group(1).strip() if m else ''


def venue_check(part, venue):
    """'' (equal), 'variant', 'detail' (accepted) or 'mismatch'.

    BBP's findVenueDetailExtra(): a trailing "(Early)"… is a show of the day,
    and the parts between the venue's name and its city are a description the
    venue page never has. Both at once are accepted too (BBP checks each
    alone). Case-sensitive, "(The)" not moved, as BBP. Whitespace counts as
    one blank: a venue page titled with two blanks ("United Methodist Church
    Of Red Bank,  Red Bank, NJ", two events) is not another name.
    """
    part = ' '.join(part.split())
    venue = ' '.join(venue.split())
    if part == venue:
        return ''
    bare = part
    kind = ''
    sm = re.search(r'\s*\((?:%s)\)\s*$' % '|'.join(VARIANTS), part, re.I)
    if sm:
        bare = part[:sm.start()].strip()
        kind = 'variant'
        if bare == venue:
            return kind
    parts = [p.strip() for p in bare.split(',') if p.strip()]
    if len(parts) >= 4 and f'{parts[0]}, {parts[-2]}, {parts[-1]}' == venue:
        return 'detail'
    return 'mismatch'


# ── The setlists ─────────────────────────────────────────────────────────────

def clean_song(raw):
    """BBP's cleanSongName(): a bracket holding a lowercase letter is a note."""
    return re.sub(r'\s+', ' ', re.sub(r'\([^()]*[a-z][^()]*\)', '', raw)).strip()


def song_key(raw, year=False):
    """The compared form of one song token, '' for a token that is no song.

    As written (the case stays: "82ND Street?" against "82ND STREET?" is a
    spelling difference). Only a YEAR token can be prose ("power failure
    interruption"): two lowercase letters in a row; an event page's song is
    a list entry and is always taken.
    """
    t = clean_song(raw)
    if re.search(r',\s.*\band/or\b', t):
        t = re.sub(r'\s*,\s*(?:and/or\s+)?|\s+and/or\s+', ' - ', t)
    if not t or (year and re.search(r'[a-z]{2}', t)):
        return ''
    return t


def is_capitals(text):
    """Nearly all letters are capitals (the userscript's _bbIsCapitals())."""
    lower = len(re.findall(r'[a-zß-ÿ]', text))
    upper = len(re.findall(r'[A-ZÀ-Þ]', text))
    return upper > 0 and lower / (lower + upper) < 0.15


def year_setlist(region):
    """The songs of a year entry: its leading paragraphs written in capitals."""
    songs = []
    for m in re.finditer(r'<(p|blockquote)>(.*?)</\1>', region, re.S):
        body = SUP_RE.sub('', m.group(2))
        text = re.sub(r'\s+', ' ', b1.text_of(body))
        if not text:
            continue
        lm = re.match(r'^([^:/]{1,60}?[^:/\d]):\s+', text)
        if lm and re.search(r'[a-z]', lm.group(1)):
            text = text[lm.end():]
        segs = re.split(r'\s/\s', text)
        caps = [s for s in segs if is_capitals(re.sub(r'\([^()]*\)', '', s))]
        if len(caps) * 2 < len(segs) or not caps:
            break
        songs += [k for k in (song_key(s, True) for s in segs) if k]
    return songs


def detail_setlist(page):
    """The songs of an event page's Setlist tab (lists, or bare song paragraphs)."""
    nav = TAB_NAV_RE.search(page)
    if not nav:
        return None
    tabs = [b1.text_of(t) for t in re.findall(r'<em>(.*?)</em>', nav.group(1), re.S)]
    if 'Setlist' not in tabs:
        return None
    i = tabs.index('Setlist')
    start = page.find(f'<div id="wiki-tab-0-{i}"')
    if start < 0:
        return None
    end = page.find(f'<div id="wiki-tab-0-{i + 1}"', start)
    panel = page[start:end if end > 0 else len(page)]
    songs = []
    for li in re.findall(r'<li>(.*?)</li>', panel, re.S):
        links = re.findall(r'<a href="/song:[^"]*"[^>]*>(.*?)</a>', li, re.S)
        raw = ' - '.join(b1.text_of(x) for x in links) if links else b1.text_of(re.sub(r'<span\b.*?</span>', '', li, flags=re.S))
        k = song_key(raw)
        if k:
            songs.append(k)
    if not songs:
        for p in re.findall(r'<p>\s*(<a href="/song:[^"]*"[^>]*>.*?</a>)\s*</p>', panel, re.S):
            k = song_key(b1.text_of(p))
            if k:
                songs.append(k)
    return songs


def edit_distance(a, b):
    """Levenshtein distance."""
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def setlist_diff(year, detail):
    """LCS items: ('match'|'year-only'|'detail-only'|'char-diff', year song, detail song)."""
    n, m = len(year), len(detail)
    lcs = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            lcs[i][j] = lcs[i + 1][j + 1] + 1 if year[i] == detail[j] else max(lcs[i + 1][j], lcs[i][j + 1])
    items = []
    i = j = 0
    while i < n and j < m:
        if year[i] == detail[j]:
            items.append(('match', year[i], detail[j]))
            i += 1
            j += 1
        elif lcs[i + 1][j] >= lcs[i][j + 1]:
            items.append(('year-only', year[i], None))
            i += 1
        else:
            items.append(('detail-only', None, detail[j]))
            j += 1
    items += [('year-only', s, None) for s in year[i:]] + [('detail-only', None, s) for s in detail[j:]]
    out = []
    k = 0
    while k < len(items):
        a = items[k]
        b = items[k + 1] if k + 1 < len(items) else None
        if b and {a[0], b[0]} == {'year-only', 'detail-only'}:
            ys = a[1] or b[1]
            ds = a[2] or b[2]
            if edit_distance(ys.upper(), ds.upper()) <= 0.3 * max(len(ys), len(ds)):
                out.append(('char-diff', ys, ds))
                k += 2
                continue
        out.append(a)
        k += 1
    return out


def setlist_check(year, detail):
    """'' (equal), 'songs' or 'spelling'."""
    kinds = {it[0] for it in setlist_diff(year, detail)}
    if kinds & {'year-only', 'detail-only'}:
        return 'songs'
    return 'spelling' if 'char-diff' in kinds else ''


# ── The run ──────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--mirror', default=os.path.expanduser('~/git/scripts/BruceParser/bb/latest'))
    ap.add_argument('--json')
    ap.add_argument('--rows')
    ap.add_argument('--list')
    ap.add_argument('--show')
    args = ap.parse_args()
    mirror = os.path.realpath(args.mirror)
    years = sorted(f[:-5] for f in os.listdir(mirror) if re.match(r'^\d{4}(-\d\d)?\.html$', f))
    flagged = defaultdict(list)
    per_year = defaultdict(Counter)
    stats = Counter()
    venue_titles = {}
    all_rows = {'list': [], 'venue': [], 'year': []}

    def flag(fid, slug, **row):
        flagged[fid].append(dict(year=slug, **row))
        per_year[fid][slug] += 1

    for slug in years:
        page = read(os.path.join(mirror, slug + '.html'))
        heads = [m for m in b1.HEAD_RE.finditer(page) if b1.DATE_RE.match(b1.text_of(m.group(2)))]
        by_anchor = {}
        year_entries = []
        for n, m in enumerate(heads):
            raw = b1.text_of(m.group(2))
            anchor = m.group(1)
            if anchor is None:
                lone = b1.LONE_ANCHOR_RE.search(page[max(0, m.start() - 200):m.start()])
                anchor = lone.group(1) if lone else ''
            by_anchor.setdefault(anchor, []).append(raw)
            year_entries.append((anchor, raw))
            link = b1.LINK_RE.search(m.group(2))
            href = html.unescape(link.group(1)) if link else ''
            stats['year entries'] += 1
            ev = read(event_file(mirror, href)) if re.match(r'^/[a-z]+:', href) else ''
            if not ev:
                stats['year entries without an event page'] += 1
                continue
            # Venue.
            title = page_title(ev)
            v = VENUE_RE.search(ev)
            if not v:
                stats['event pages without a Venue link'] += 1
            else:
                vhref = html.unescape(v.group(1))
                if vhref not in venue_titles:
                    venue_titles[vhref] = page_title(read(event_file(mirror, vhref)))
                vt = venue_titles[vhref]
                if not vt:
                    stats['venue pages not in the mirror'] += 1
                else:
                    res = venue_check(venue_part(title), vt)
                    all_rows['venue'].append({'event': href[1:], 'title': title, 'venue': vt, 'result': res})
                    stats[f'venue: {res or "equal"}'] += 1
                    if res == 'mismatch':
                        flag('bb-venue-mismatch', slug, event=href[1:], part=venue_part(title), venue=vt, venueHref=vhref)
            # Setlist.
            end = heads[n + 1].start() if n + 1 < len(heads) else len(page)
            region = page[m.end():end]
            hr = region.find('<hr')
            ys = year_setlist(region[:hr] if hr >= 0 else region)
            ds = detail_setlist(ev)
            if args.show and href[1:] == args.show:
                print('YEAR:  ', ys, '\nDETAIL:', ds)
                for it in setlist_diff(ys, ds or []):
                    if it[0] != 'match':
                        print('  ', it)
            if ds is None:
                stats['event pages without a Setlist tab'] += 1
                if ys:
                    stats['  … whose year entry has songs'] += 1
                continue
            if not ys and not ds:
                stats['setlist: none on both'] += 1
                continue
            if not ys or not ds:
                stats[f'setlist: only on the {"event" if ds else "year"} page'] += 1
                flag('bb-setlist-songs', slug, event=href[1:], why='one side empty', ySongs=len(ys), dSongs=len(ds))
                continue
            res = setlist_check(ys, ds)
            stats[f'setlist: {res or "equal"}'] += 1
            if res:
                diff = [it for it in setlist_diff(ys, ds) if it[0] != 'match']
                flag(f'bb-setlist-{res}', slug, event=href[1:], why='diff', diff=diff[:6], n=len(diff))

        # The listing of the same year.
        listing = read(os.path.join(mirror, slug + '-list.html'))
        if not listing:
            stats['years without a listing'] += 1
            continue
        # bb-year-unlisted (vzell, 2026-11-15): a year entry whose anchor no
        # line of the year's listing links. An entry without an anchor
        # cannot be linked, so it counts as unlisted too.
        linked = {lm.group(2) for lm in LIST_RE.finditer(listing) if lm.group(1) == slug}
        for anchor, raw in year_entries:
            listed = bool(anchor) and anchor in linked
            all_rows['year'].append({'year': slug, 'anchor': anchor, 'heading': raw, 'listed': listed})
            if not listed:
                flag('bb-year-unlisted', slug, anchor=anchor, heading=raw)
        for lm in LIST_RE.finditer(listing):
            href_year, anchor, label = lm.group(1), lm.group(2), b1.text_of(lm.group(3))
            d = b1.DATE_RE.match(label)
            if not d:
                continue
            stats['listing entries'] += 1
            why = []
            if not b1.slug_has_year(href_year, d.group(1)):
                why.append('year')
            if not anchor.startswith(d.group(3) + d.group(2) + d.group(1)[2:]):
                why.append('date')
            if href_year != slug:
                stats['listing links to another year page'] += 1
            elif anchor not in by_anchor:
                why.append('no such anchor')
            elif not any(' '.join(label.upper().split()) == ' '.join(h.upper().split()) for h in by_anchor[anchor]):
                # One anchor on two entries (1972's 000472b): the label may be either heading.
                flag('bb-list-title', slug, anchor=anchor, label=label, heading=by_anchor[anchor][0])
            if why:
                flag('bb-list-anchor', slug, anchor=anchor, label=label, why='+'.join(why))
            if href_year == slug:
                checks = (['list-anchor'] if why else []) + (['list-title'] if flagged['bb-list-title'] and flagged['bb-list-title'][-1].get('label') == label
                                                                 and flagged['bb-list-title'][-1].get('anchor') == anchor and flagged['bb-list-title'][-1]['year'] == slug else [])
                all_rows['list'].append({'year': slug, 'href': f'/{href_year}#{anchor}', 'label': label, 'checks': checks})

    print(f'Mirror: {mirror}')
    print(f'Year pages: {len(years)}, venue pages read: {len(venue_titles)}')
    for k, v in sorted(stats.items()):
        print(f'  {k}: {v}')
    print('\nRows flagged:')
    for fid in ('bb-list-title', 'bb-list-anchor', 'bb-year-unlisted', 'bb-venue-mismatch', 'bb-setlist-songs', 'bb-setlist-spelling'):
        top = ', '.join(f'{y} {n}' for y, n in per_year[fid].most_common(5))
        print(f'  {fid}: {len(flagged[fid])} rows in {len(per_year[fid])} years (most: {top})')
    print(f'  bb-list-anchor by reason: {dict(Counter(r["why"] for r in flagged["bb-list-anchor"]))}')
    print(f'  bb-setlist-songs by reason: {dict(Counter(r["why"] for r in flagged["bb-setlist-songs"]))}')

    rep = os.path.join(mirror, 'REPORTING')
    print('\nAgainst BruceParser\'s reports:')
    theirs = set(re.findall(r'YEAR page: https://brucebase\.wikidot\.com/([\w-]+#\w+)',
                            read(os.path.join(rep, 'DIFFERENCES-titles-between-YEAR-and-YEAR-LIST-pages.txt'))))
    ours = {f'{r["year"]}#{r["anchor"]}' for r in flagged['bb-list-title']}
    print(f'  bb-list-title: ours {len(ours)}, theirs {len(theirs)}, both {len(ours & theirs)}')
    for x in sorted(ours - theirs)[:12]:
        print(f'    only ours: {x}')
    for x in sorted(theirs - ours)[:12]:
        print(f'    only theirs: {x}')
    unlisted = {f'{r["year"]}#{r["anchor"]}' for r in flagged['bb-year-unlisted']}
    rest = theirs - ours
    print(f'  bb-year-unlisted: ours {len(unlisted)}; of theirs not in bb-list-title ({len(rest)}): {len(rest & unlisted)} are unlisted')
    for x in sorted(rest - unlisted)[:12]:
        print(f'    theirs, neither: {x}')
    for x in sorted(unlisted - theirs)[:20]:
        print(f'    unlisted, not theirs: {x}')
    theirs = set(re.findall(r'https://brucebase\.wikidot\.com/([a-z]+:[^\]\s|]+)\]\[', read(os.path.join(rep, 'DIFFERENCES-venues.org'))))
    theirs = {t for t in theirs if not t.startswith('venue:')}
    ours = {r['event'] for r in flagged['bb-venue-mismatch']}
    print(f'  bb-venue-mismatch vs DIFFERENCES-venues.org (before the accepted cases): ours {len(ours)}, theirs {len(theirs)}, both {len(ours & theirs)}')
    for x in sorted(ours - theirs)[:12]:
        print(f'    only ours: {x}')
    theirs = set()
    for line in read(os.path.join(rep, 'setlist-differences.txt')).splitlines():
        m = re.match(r'^([\w\'-]+):([a-z]+)', line.strip())
        if m:
            theirs.add(f'{m.group(2)}:{m.group(1)}')
    ours = {r['event'] for fid in ('bb-setlist-songs', 'bb-setlist-spelling') for r in flagged[fid]}
    print(f'  bb-setlist-* vs setlist-differences.txt: ours {len(ours)}, theirs {len(theirs)}, both {len(ours & theirs)}')
    print(f'    only ours: {len(ours - theirs)}, e.g. {sorted(ours - theirs)[:8]}')
    print(f'    only theirs: {len(theirs - ours)}, e.g. {sorted(theirs - ours)[:8]}')

    if args.list:
        print(f'\n{args.list}:')
        for r in flagged[args.list]:
            print('  ' + json.dumps(r, ensure_ascii=False))
    if args.rows:
        with open(args.rows, 'w', encoding='utf-8') as fh:
            json.dump(all_rows, fh, ensure_ascii=False)
    if args.json:
        with open(args.json, 'w', encoding='utf-8') as fh:
            json.dump(flagged, fh, ensure_ascii=False, indent=1)
    return 0


if __name__ == '__main__':
    sys.exit(main())
