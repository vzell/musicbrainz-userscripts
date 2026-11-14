#!/usr/bin/env python3
"""Probe: how many year-table rows the batch 1 Brucebase findings would flag.

Track A batch 1 (org/bbp-parity.org): bb-name-mismatch, bb-name-variant,
bb-anchor-date, bb-anchor-link, bb-anchor-postfix, bb-title-spaces. Reads
every year page of BruceParser's mirror and each entry's event page, applies
the rules the userscript is to ship, and compares the flagged shows with
BruceParser's own reports (the oracle) in <mirror>/REPORTING/.

Read-only. No network.

Usage:
    python3 scripts/probe-bb-batch1-findings.py [--mirror DIR] [--json FILE] [--rows FILE] [--list ID]

    --mirror DIR  the mirror (default ~/git/scripts/BruceParser/bb/latest)
    --json FILE   also write every flagged row as JSON (the JS checker's input)
    --rows FILE   write EVERY entry with its inputs and failed checks as JSON:
                  the input of scripts/check-bb-batch1-findings.js
    --list ID     print every row flagged with this finding id
"""
import argparse
import html
import json
import os
import re
import sys
from collections import Counter, defaultdict

VARIANTS_BBP = ("Early", "Late", "Afternoon", "Evening")
VARIANTS_BP_ONLY = ("First", "Second", "Third", "Morning", "Soundcheck")

HEAD_RE = re.compile(
    r'<p>(?:<a name="([^"]*)"></a>(?:<br\s*/?>)?\s*)?<strong>((?:(?!</?strong>).)*?)</strong></p>', re.S)
LONE_ANCHOR_RE = re.compile(r'<p><a name="([^"]*)"></a></p>\s*$')
LINK_RE = re.compile(r'<a href="([^"]+)"[^>]*>(.*?)</a>', re.S)
TAG_RE = re.compile(r'<[^>]+>')
TITLE_RE = re.compile(r'<div id="page-title">(.*?)</div>', re.S)
INFO_RE = re.compile(r'<a href="(/\d[\w-]*#[A-Za-z0-9]+)"[^>]*>([^<]*)</a>')
DATE_RE = re.compile(r'^(\d{4})-(\d\d)-(\d\d)\b')


def text_of(markup):
    """Markup as text: tags out, entities decoded, NBSP kept, ends trimmed."""
    return html.unescape(TAG_RE.sub('', markup)).strip(' \t\r\n')


def year_entries(page):
    """The entries of a year page: (raw heading, href, anchor)."""
    out = []
    for m in HEAD_RE.finditer(page):
        raw = text_of(m.group(2))
        if not DATE_RE.match(raw):
            continue
        anchor = m.group(1)
        if anchor is None:
            lone = LONE_ANCHOR_RE.search(page[max(0, m.start() - 200):m.start()])
            anchor = lone.group(1) if lone else ''
        link = LINK_RE.search(m.group(2))
        out.append((raw, html.unescape(link.group(1)) if link else '', anchor))
    return out


def norm_name(name):
    """(date, REST) of a heading or a title, as the name check compares them.

    BBP's normalizeDetailName(): the date, the rest with "X (The|Le|De)"
    moved to "The X" per comma part, upper case. The heading's " - " after
    the date is optional. Blanks are NOT collapsed.
    """
    m = re.match(r'^(\d{4}-\d\d-\d\d)[a-z]?\s+(?:-\s+)?(.*)$', name, re.S)
    if not m:
        return None, name.upper()
    parts = []
    for part in m.group(2).split(','):
        a = re.match(r'^(\s*)(.*?)\s*\((The|Le|De)\)(\s*)$', part)
        parts.append(f'{a.group(1)}{a.group(3)} {a.group(2)}{a.group(4)}' if a else part)
    return m.group(1), ','.join(parts).upper()


def name_check(heading, title):
    """'' (equal), 'variant:<Word>' or 'mismatch'."""
    hd, hr = norm_name(heading)
    td, tr = norm_name(title)
    if hd == td and hr == tr:
        return ''
    if hd == td:
        for word in VARIANTS_BBP + VARIANTS_BP_ONLY:
            if tr == f'{hr} ({word.upper()})':
                return f'variant:{word}'
    return 'mismatch'


def title_spaces(text):
    """Two blanks in a row, or a blank before a comma."""
    return bool(re.search(r'[  ]{2}|[  ],', text))


def slug_has_year(slug, year):
    """Whether a year page's slug ("1985", "1949-64") covers the year."""
    m = re.match(r'^(\d{4})(?:-(\d\d))?$', slug)
    if not m:
        return False
    first = int(m.group(1))
    last = int(m.group(1)[:2] + m.group(2)) if m.group(2) else first
    return first <= int(year) <= last


def report_urls(path, lead):
    """The event paths ("gig:…") a BruceParser report names on its lead lines."""
    out = set()
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8', errors='replace') as fh:
        for line in fh:
            if line.startswith(lead):
                for u in re.findall(r'https://brucebase\.wikidot\.com/([a-z]+:[^\s|]+)', line):
                    out.add(u)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--mirror', default=os.path.expanduser('~/git/scripts/BruceParser/bb/latest'))
    ap.add_argument('--json')
    ap.add_argument('--rows')
    ap.add_argument('--list')
    args = ap.parse_args()
    mirror = os.path.realpath(args.mirror)

    years = sorted(f[:-5] for f in os.listdir(mirror) if re.match(r'^\d{4}(-\d\d)?\.html$', f))
    flagged = defaultdict(list)
    stats = Counter()
    per_year = defaultdict(Counter)
    variant_words = Counter()
    all_rows = []
    for slug in years:
        with open(os.path.join(mirror, slug + '.html'), encoding='utf-8') as fh:
            page = fh.read()
        anchors = Counter()
        entries = year_entries(page)
        for raw, href, anchor in entries:
            anchors[anchor] += 1
        for raw, href, anchor in entries:
            stats['entries'] += 1
            d = DATE_RE.match(raw)
            row = {'year': slug, 'heading': raw, 'href': href, 'anchor': anchor}
            full = dict(row, title=None, infoHref=None, checks=[])
            all_rows.append(full)

            def flag(fid, **more):
                flagged[fid].append(dict(row, **more))
                if fid[3:] not in full['checks']:
                    full['checks'].append(fid[3:])
                per_year[fid][slug] += 1

            if not anchor:
                stats['no anchor'] += 1
            else:
                want = d.group(3) + d.group(2) + d.group(1)[2:]
                if not anchor.startswith(want):
                    flag('bb-anchor-date', want=want)
                if anchors[anchor] > 1:
                    stats['anchor used twice (not a batch 1 finding)'] += 1
            if title_spaces(raw):
                flag('bb-title-spaces', where='heading')
            m = re.match(r'^/([a-z]+):(\d{4}-\d\d-\d\d)([a-z])?-(.*)$', href)
            if not href:
                stats['no link'] += 1
                continue
            if not m:
                stats['link of another shape'] += 1
                continue
            if anchor:
                a_letter = re.sub(r'\d', '', anchor)
                u_letter = m.group(3) or ''
                if a_letter != u_letter:
                    flag('bb-anchor-postfix', anchorLetter=a_letter, urlLetter=u_letter)
            path = os.path.join(mirror, m.group(1), f'{m.group(1)}_{href.split(":", 1)[1]}.html')
            if not os.path.exists(path):
                stats['event page not in the mirror'] += 1
                continue
            with open(path, encoding='utf-8', errors='replace') as fh:
                ev = fh.read()
            stats['event pages read'] += 1
            t = TITLE_RE.search(ev)
            title = text_of(t.group(1)) if t else ''
            full['title'] = title
            full['infoHref'] = ''
            if not title:
                stats['event page without a title'] += 1
            else:
                res = name_check(raw, title)
                if res == 'mismatch':
                    flag('bb-name-mismatch', title=title)
                elif res:
                    word = res.split(':')[1]
                    variant_words[word] += 1
                    flag('bb-name-variant', title=title, word=word)
                if title_spaces(title):
                    flag('bb-title-spaces', where='title', title=title)
            info = next((i for i in INFO_RE.finditer(ev) if 'info' in i.group(2).lower()), None)
            if not info:
                stats['event page without an Info & Setlist link'] += 1
            else:
                islug, ianchor = html.unescape(info.group(1))[1:].split('#')
                full['infoHref'] = html.unescape(info.group(1))
                why = []
                if anchor and ianchor != anchor:
                    why.append('anchor')
                if not slug_has_year(islug, d.group(1)):
                    why.append('year')
                if why:
                    flag('bb-anchor-link', info=f'/{islug}#{ianchor}', why='+'.join(why))

    print(f'Mirror: {mirror}')
    print(f'Year pages: {len(years)}')
    for k, v in sorted(stats.items()):
        print(f'  {k}: {v}')
    print('\nRows flagged:')
    for fid in ('bb-name-mismatch', 'bb-name-variant', 'bb-anchor-date', 'bb-anchor-link',
                'bb-anchor-postfix', 'bb-title-spaces'):
        rows = flagged[fid]
        top = ', '.join(f'{y} {n}' for y, n in per_year[fid].most_common(5))
        print(f'  {fid}: {len(rows)} rows in {len(per_year[fid])} years (most: {top})')
    print(f'  variant words: {dict(variant_words)}')
    print(f'  bb-anchor-link by reason: {dict(Counter(r["why"] for r in flagged["bb-anchor-link"]))}')
    print(f'  bb-title-spaces by place: {dict(Counter(r["where"] for r in flagged["bb-title-spaces"]))}')

    rep = os.path.join(mirror, 'REPORTING')
    print('\nAgainst BruceParser\'s reports (event paths):')
    for fid, name, lead in (
            ('bb-anchor-date', 'differences-anchor-date-year-and-title-date-detail.txt', 'Differing ANCHOR DATE'),
            ('bb-name-mismatch', 'differences-detail-title-year-title.txt', 'Differing TITLE'),
            ('bb-name-mismatch', 'differences-detail-title-year-title-cleanedup.txt', 'Differing TITLE'),
            ('bb-anchor-postfix', 'differences-date-postfix-detail-and-year.txt', 'Differing DATE POSTFIX')):
        theirs = report_urls(os.path.join(rep, name), lead)
        if theirs is None:
            print(f'  {name}: not found')
            continue
        ours = {r['href'][1:] for r in flagged[fid]}
        print(f'  {fid} vs {name}: ours {len(ours)}, theirs {len(theirs)}, both {len(ours & theirs)}')
        for label, only in (('only ours', ours - theirs), ('only theirs', theirs - ours)):
            for u in sorted(only)[:12]:
                print(f'    {label}: {u}')
            if len(only) > 12:
                print(f'    {label}: … {len(only) - 12} more')

    if args.list:
        print(f'\n{args.list}:')
        for r in flagged[args.list]:
            print('  ' + json.dumps(r, ensure_ascii=False))
    if args.rows:
        with open(args.rows, 'w', encoding='utf-8') as fh:
            json.dump(all_rows, fh, ensure_ascii=False)
        print(f'\nWrote {args.rows} ({len(all_rows)} entries)')
    if args.json:
        with open(args.json, 'w', encoding='utf-8') as fh:
            json.dump(flagged, fh, ensure_ascii=False, indent=1)
        print(f'\nWrote {args.json}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
