#!/usr/bin/env python3
"""Probe: a Brucebase show's tour tags against the feed's tour table.

Track A batch 3b, the tour family (org/springsteen-marriage.org; vzell,
2026-11-19: table tours only, tour_no never expected or flagged). Reads the
rows that scripts/probe-bb-batch3-findings.py --rows writes (every event with
the tags of all its pages) and the tour table (BruceParser's
brucebase/tag-tables.json, the feed's tagTables), and counts by kind:

- a show whose date the table covers: does it carry the covering tour's tag
  (any of them, when tours overlap), all of them, none;
- a show that carries a table tour tag whose ranges miss its date;
- the overlaps: which of the covering tags the shows carry.

Read-only. No network.

Usage:
    python3 scripts/probe-bb-tour-tags.py ROWS.json TAG_TABLES.json [--list WHAT] [--kinds K,K]

    --list WHAT  print the shows of one group: missing, spurious, overlap
    --kinds      the event kinds to count (default: all five)
    --json FILE  write the rule's findings of EVERY row as JSON {name: {missing, spurious}}:
                 the input of scripts/check-bb-tour-tags.js
"""
import argparse
import json
import sys
from collections import Counter, defaultdict


def covering(tours, date):
    """The table's tour tags whose ranges include the date, in table order, once each."""
    out = []
    for t in tours:
        if any(a <= date <= b for a, b in t['ranges']) and t['tag'] not in out:
            out.append(t['tag'])
    return out


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('rows')
    ap.add_argument('tables')
    ap.add_argument('--list')
    ap.add_argument('--kinds', default='gig,nogig,rehearsal,recording,interview')
    ap.add_argument('--json')
    args = ap.parse_args(argv)
    rows = json.load(open(args.rows, encoding='utf-8'))
    tours = json.load(open(args.tables, encoding='utf-8'))['tours']
    table_tags = {t['tag'] for t in tours}
    kinds = args.kinds.split(',')

    by_kind = defaultdict(Counter)
    missing, spurious, overlap = [], [], []
    overlap_pattern = Counter()
    for r in rows:
        if r['kind'] not in kinds:
            continue
        date = r['date']
        tags = set(r['tags'])
        for _, more in r.get('pages') or []:
            tags.update(more)
        own = set(r['tags'])
        cov = covering(tours, date) if len(date) == 10 and not date.endswith('-00') and '-00-' not in date else []
        k = by_kind[r['kind']]
        k['shows'] += 1
        if cov:
            k['covered'] += 1
            have = [t for t in cov if t in tags]
            if have:
                k['has one'] += 1
            if len(have) == len(cov):
                k['has all'] += 1
            if not have:
                k['has none'] += 1
                missing.append((r['name'], cov, sorted(t for t in tags if t.startswith('tour_'))))
            if len(cov) > 1:
                k['overlap'] += 1
                overlap.append((r['name'], cov, have))
                overlap_pattern[(tuple(cov), tuple(have))] += 1
        else:
            k['not covered'] += 1
        bad = sorted(t for t in own if t in table_tags and t not in cov)
        if bad:
            k['spurious'] += 1
            spurious.append((r['name'], bad, cov))
        if 'tour_no' in tags:
            k['tour_no'] += 1
            if cov:
                k['tour_no covered'] += 1

    cols = ['shows', 'covered', 'has one', 'has all', 'has none', 'overlap', 'not covered', 'spurious', 'tour_no',
            'tour_no covered']
    print('kind       ' + ' '.join(f'{c:>15}' for c in cols))
    for kind in kinds:
        print(f'{kind:10} ' + ' '.join(f'{by_kind[kind][c]:>15}' for c in cols))
    print('\noverlaps (covering tags -> tags carried): shows')
    for (cov, have), n in overlap_pattern.most_common():
        print(f'  {", ".join(cov):30} -> {", ".join(have) or "(none)":30} {n}')
    print('\nmissing, the covering tag: ' + ', '.join(
        f'{t} {n}' for t, n in Counter(c for _, cov, _ in missing for c in cov).most_common()))
    print('spurious, the tag: ' + ', '.join(
        f'{t} {n}' for t, n in Counter(b for _, bad, _ in spurious for b in bad).most_common()))
    # The rule as decided (vzell, 2026-11-19): gigs and nogigs with a full
    # date; every covering tour's tag expected unless the show carries
    # tour_no on any of its pages; a table tour tag of the page itself that
    # no covering tour has is not expected.
    rule = []
    every = {}
    for r in rows:
        f = rule_findings(r, tours, table_tags)
        every[r['name']] = f
        if f['missing'] or f['spurious']:
            rule.append((r['name'], f['missing'], f['spurious']))
    if args.json:
        with open(args.json, 'w', encoding='utf-8') as fh:
            json.dump(every, fh, ensure_ascii=False)
    print(f'\nthe rule (gig, nogig; tour_no excuses; all covering tags): {len(rule)} shows, '
          f'{sum(1 for _, m, _ in rule if m)} with a missing tag, {sum(1 for _, _, s in rule if s)} with one not expected')
    if args.list:
        print(f'\n--list {args.list}')
        groups = {'missing': missing, 'spurious': spurious, 'overlap': overlap, 'rule': rule}
        for item in groups[args.list]:
            print('  ' + '  '.join(str(x) for x in item))
    return 0


def rule_findings(r, tours, table_tags):
    """The tour family's findings of one row, as the userscript must compute them."""
    out = {'missing': [], 'spurious': []}
    date = r['date']
    if r['kind'] not in ('gig', 'nogig') or len(date) != 10 or date[5:7] == '00' or date[8:10] == '00':
        return out
    tags = set(r['tags'])
    for _, more in r.get('pages') or []:
        tags.update(more)
    cov = covering(tours, date)
    if 'tour_no' not in tags:
        out['missing'] = [t for t in cov if t not in tags]
    seen = set()
    for t in r['tags']:
        if t in table_tags and t not in cov and t not in seen:
            seen.add(t)
            out['spurious'].append(t)
    return out


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
