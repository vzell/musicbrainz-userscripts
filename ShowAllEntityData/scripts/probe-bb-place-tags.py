#!/usr/bin/env python3
"""Probe: how the wiki tags the places in a Brucebase show's title.

Track A batch 3b, the place family (org/springsteen-marriage.org, question
4: which parts of the title must have a tag). Reads the rows that
scripts/probe-bb-batch3-findings.py --rows writes (every event with the tags
of all its pages) and the feed's tables (BruceParser's
brucebase/tag-tables.json), splits each title "DATE Venue, [detail,] City,
ST|Country" as BruceBaseParser does, and counts for each part how many shows
carry its tag, by kind of page:

- venue      the venue's slug ("Hammersmith Odeon" -> hammersmithodeon)
- city       the city's slug
- usstate    a US state or Canadian province: "newjersey(nj)"
- country    "usa"/"canada" after a state, else the country's slug as written
             ("The Netherlands" -> thenetherlands)
- region     each of the country's regions in the table (unitedkingdom, europe, …)
- austate    an Australian title's state ("Sydney, New South Wales, Australia")

Read-only. No network.

Usage:
    python3 scripts/probe-bb-place-tags.py ROWS.json TAG_TABLES.json [--miss PART] [--kinds K,K]

    --miss PART  print the shows whose tag of that part is missing (with the tag)
    --kinds      the event kinds to count (default gig,nogig)
    --json FILE  write the rule's findings of EVERY row as JSON {name: {missing, spurious}}
                 (the input of scripts/check-bb-batch3b-findings.js --family place)
    --list-rule  print every show the rule flags
"""
import argparse
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict

FOLD = {'ø': 'o', 'Ø': 'O', 'æ': 'ae', 'Æ': 'AE', 'œ': 'oe', 'Œ': 'OE', 'ß': 'ss', 'ð': 'd', 'Ð': 'D',
        'þ': 'th', 'Þ': 'Th', 'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D'}


def slug(s):
    """Lower case a-z0-9 only, accents folded (BruceBaseParser's location slug, without its "the" rule)."""
    s = ''.join(FOLD.get(c, c) for c in s)
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r'\s*\((?:The|A)\)\s*$', '', s)
    return re.sub(r'[^a-z0-9]', '', s.lower())


def parts_of(title, tables):
    """The title's place parts: {venue, detail, city, usstate, country, regions, austate}, or None."""
    m = re.match(r'^\d{4}-\d{2}-\d{2}\s+(.+)$', title.strip())
    if not m:
        return None
    rest = re.sub(r'\s*\((?:Early|Late|Afternoon|Evening)\)\s*$', '', m.group(1), flags=re.I)
    p = [x.strip() for x in rest.split(',') if x.strip()]
    if len(p) < 3:
        return None
    out = {'venue': p[0]}
    last = p[-1]
    states = dict(tables['usStates'], **tables['caProvinces'])
    if re.fullmatch(r'[A-Z]{2}', last) and last in states:
        out['city'] = p[-2]
        out['usstate'] = f"{slug(states[last])}({last.lower()})"
        out['country'] = 'usa' if last in tables['usStates'] else 'canada'
    elif last == 'Australia' and len(p) >= 4:
        out['city'] = p[-3]
        out['austate'] = slug(p[-2])
        out['country'] = 'australia'
    else:
        out['city'] = p[-2]
        out['country'] = slug(last)
        out['regions'] = tables['countryRegions'].get(last, [])
    return out


def rule_expected(title, tables):
    """The place family's expected tags as decided (vzell, 2026-11-19), as the userscript must compute them.

    [(part, name, [accepted tags, the first named when missing])]: the city,
    a US state or Canadian province, the country, and the country's regions
    that tagTables.expectedRegions lists; a name in tagTables.placeTags takes
    its tags from there. A trailing "(…)" of the last part ("NJ (First)",
    "NJ (Early)") is not part of the place. The venue is left for the feed's
    venue map. None for a title without at least venue, city and last part.
    """
    m = re.match(r'^\d{4}-\d{2}-\d{2}\s+(.+)$', title.strip())
    if not m:
        return None
    p = [x.strip() for x in m.group(1).split(',') if x.strip()]
    if len(p) < 3:
        return None
    p[-1] = re.sub(r'\s*\([^)]*\)\s*$', '', p[-1]).strip()
    last = p[-1]
    us, ca = tables['usStates'], tables['caProvinces']
    place = tables.get('placeTags') or {}
    want = set(tables.get('expectedRegions') or [])

    def tags_of(name):
        return place.get(name) or [slug(name)]

    out = []
    if re.fullmatch(r'[A-Z]{2}', last) and (last in us or last in ca):
        full = us.get(last) or ca[last]
        out.append(('city', p[-2], tags_of(p[-2])))
        out.append(('state', full, [f'{slug(full)}({last.lower()})']))
        out.append(('country', 'USA' if last in us else 'Canada', ['usa' if last in us else 'canada']))
    else:
        city = p[-3] if last == 'Australia' and len(p) >= 4 else p[-2]
        out.append(('city', city, tags_of(city)))
        out.append(('country', last, tags_of(last)))
        for reg in tables['countryRegions'].get(last, []):
            if reg in want:
                out.append(('region', reg, [reg]))
    return [(part, name, [t for t in tags if t]) for part, name, tags in out if any(tags)]


def rule_findings(r, tables, venue_tags=None):
    """The place family's missing tags of one row (every kind of event).

    With the feed's venueTags: also the show's venue (its "Venue" link,
    facts.venue) -> the venue page's tag, after the title's parts.
    """
    exp = rule_expected(r['title'], tables) or []
    venue = (r.get('facts') or {}).get('venue') or ''
    if venue_tags and venue_tags.get(venue):
        exp = exp + [('venue', venue, venue_tags[venue])]
    if not exp:
        return []
    tags = set(r['tags'])
    for _, more in r.get('pages') or []:
        tags.update(more)
    return [tags_[0] for _, _, tags_ in exp if not any(t in tags for t in tags_)]


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('rows')
    ap.add_argument('tables')
    ap.add_argument('--miss')
    ap.add_argument('--kinds', default='gig,nogig')
    ap.add_argument('--json')
    ap.add_argument('--list-rule', action='store_true')
    ap.add_argument('--feed', help='a bb-feed.json: the venue is checked with ITS venueTags')
    args = ap.parse_args(argv)
    rows = json.load(open(args.rows, encoding='utf-8'))
    tables = json.load(open(args.tables, encoding='utf-8'))
    kinds = args.kinds.split(',')
    have = defaultdict(Counter)
    miss = defaultdict(list)
    region_by = defaultdict(Counter)
    unparsed = 0
    for r in rows:
        if r['kind'] not in kinds:
            continue
        tags = set(r['tags'])
        for _, more in r.get('pages') or []:
            tags.update(more)
        pp = parts_of(r['title'], tables)
        if not pp:
            unparsed += 1
            continue
        checks = [('venue', slug(pp['venue'])), ('city', slug(pp['city'])), ('country', pp['country'])]
        if 'usstate' in pp:
            checks.append(('usstate', pp['usstate']))
        if 'austate' in pp:
            checks.append(('austate', pp['austate']))
        for reg in pp.get('regions', []):
            checks.append((f'region:{reg}', reg))
            region_by[reg]['shows'] += 1
            if reg in tags:
                region_by[reg]['carry'] += 1
        for part, tag in checks:
            key = part.split(':')[0]
            have[key]['shows'] += 1
            if tag in tags:
                have[key]['carry'] += 1
            else:
                miss[key].append((r['name'], tag))
    print(f'kinds {",".join(kinds)}; titles without place parts: {unparsed}')
    print(f'{"part":10} {"shows":>7} {"carry":>7} {"missing":>8}  share')
    for part in ('venue', 'city', 'usstate', 'austate', 'country', 'region'):
        h = have[part]
        if h['shows']:
            print(f'{part:10} {h["shows"]:7} {h["carry"]:7} {h["shows"] - h["carry"]:8}  {100 * h["carry"] / h["shows"]:5.1f} %')
    print('\nregions:')
    for reg, c in sorted(region_by.items(), key=lambda kv: -kv[1]['shows']):
        print(f'  {reg:14} {c["carry"]:5} of {c["shows"]:5}')
    print('\nmissing tags, most frequent per part:')
    for part in ('venue', 'city', 'usstate', 'austate', 'country', 'region'):
        if miss[part]:
            print(f'  {part:8} ' + ', '.join(f'{t} {n}' for t, n in Counter(t for _, t in miss[part]).most_common(10)))
    if args.miss:
        print(f'\n--miss {args.miss}')
        for name, tag in miss[args.miss]:
            print(f'  {name}  {tag}')
    # The rule as decided (vzell, 2026-11-19), over every kind of event.
    venue_tags = json.load(open(args.feed, encoding='utf-8')).get('venueTags') if args.feed else None
    every = {r['name']: rule_findings(r, tables, venue_tags) for r in rows}
    flagged = {n: m for n, m in every.items() if m}
    print(f'\nthe rule (city, state, country, expectedRegions; placeTags; every kind): {len(flagged)} shows, '
          f'{sum(len(m) for m in flagged.values())} missing tags: '
          + ', '.join(f'{t} {n}' for t, n in Counter(t for m in flagged.values() for t in m).most_common(12)))
    if args.list_rule:
        for n, m in flagged.items():
            print(f'  {n}  {m}')
    if args.json:
        with open(args.json, 'w', encoding='utf-8') as fh:
            json.dump({n: {'missing': m, 'spurious': []} for n, m in every.items()}, fh, ensure_ascii=False)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
