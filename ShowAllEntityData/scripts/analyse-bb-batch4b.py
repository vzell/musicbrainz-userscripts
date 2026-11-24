#!/usr/bin/env python3
"""Break down BruceBaseParser's left-out page tag families by cause (batch 4b).

Usage:
    python3 scripts/analyse-bb-batch4b.py ROWS.json [--examples N]

ROWS.json is scripts/probe-bb-page-tags.py --rows output. Read-only, no
network. Prints, for the three families batch 4 left out (vzell,
2026-11-18) and batch 4b takes up (vzell, 2026-11-24):
  - venue place: the missing candidates by label (Venue, Venue detail, City,
    State, Country, Region), the most frequent, with examples;
  - relation names: missing name tags by source (the person's own name, a
    Bands-tab entry, a Members-tab entry) and the letter rule's misses;
  - retail: the date tags missing/spurious, pages whose "Commercially
    Released:" line names several dates or none, and the letter's misses.
"""
import argparse
import json
from collections import Counter, defaultdict


def main():
    """Print the breakdown."""
    ap = argparse.ArgumentParser()
    ap.add_argument('rows')
    ap.add_argument('--examples', type=int, default=6)
    args = ap.parse_args()
    with open(args.rows, encoding='utf-8') as f:
        rows = json.load(f)
    n = args.examples

    print('== venue place (BruceBaseParser reading, siblings included)')
    venues = [r for r in rows if r['kind'] == 'venue']
    by_label = defaultdict(Counter)
    ex = defaultdict(list)
    pages_by_label = Counter()
    for r in venues:
        missing = set(r['saed']['missing'].get('place', []))
        labels_hit = set()
        for label, cand in r['place']:
            if cand in missing:
                key = label.split(':')[0]
                by_label[key][cand] += 1
                labels_hit.add(key)
                if len(ex[key]) < n:
                    ex[key].append(f'{r["name"]} "{r["title"]}" wants {cand}; has {" ".join(sorted(r["tags"]))[:160]}')
        for k in labels_hit:
            pages_by_label[k] += 1
    for key in sorted(by_label, key=lambda k: -pages_by_label[k]):
        print(f'  {key:13s} pages {pages_by_label[key]:4d}  ' + ', '.join(f'{t} {c}' for t, c in by_label[key].most_common(10)))
        for e in ex[key]:
            print(f'      {e}')

    print('\n== relation names')
    rels = [r for r in rows if r['kind'] == 'relation' and not r['ship']['skip']]
    src = defaultdict(Counter)
    srcp = Counter()
    exr = defaultdict(list)
    for r in rels:
        miss = set(r['saed']['missing'].get('name', []))
        hit = set()
        for t in miss:
            why = r['expected'].get(t, ['', ''])[1]
            key = 'own name' if '" + "' in why else ('Bands tab' if 'Bands tab' in why else ('Members tab' if 'Members tab' in why else why))
            src[key][t] += 1
            hit.add(key)
            if len(exr[key]) < n:
                exr[key].append(f'{r["name"]} "{r["title"]}" wants {t} ({why}); has {" ".join(sorted(r["tags"]))[:140]}')
        for k in hit:
            srcp[k] += 1
    for key in sorted(src, key=lambda k: -srcp[k]):
        print(f'  {key:12s} pages {srcp[key]:4d} tags {sum(src[key].values()):4d}  ' + ', '.join(f'{t} {c}' for t, c in src[key].most_common(10)))
        for e in exr[key]:
            print(f'      {e}')
    lm = [r for r in rels if r['saed']['missing'].get('letter')]
    print(f'  letter (BBP: the surname / band name) missing on {len(lm)}; the shipped letter rule misses '
          f'{sum(1 for r in rels if r["ship"]["missing"].get("letter"))}')
    for r in lm[:n]:
        print(f'      {r["name"]} "{r["title"]}" BBP wants {r["saed"]["missing"]["letter"]}, shipped letter {r["facts"]["letter"]!r}; has {" ".join(sorted(t for t in r["tags"] if len(t) <= 3))}')
    tabs = Counter(('B' if r['facts']['bands'] else '-') + ('M' if r['facts']['members'] else '-') for r in rels)
    print(f'  tabs (B = Bands, M = Members): {dict(tabs)}')

    print('\n== retail dates and letter (main pages)')
    ret = [r for r in rows if r['kind'] == 'retail' and not r['ship']['skip']]
    ndates = Counter(len(r['dates']) for r in ret)
    print(f'  pages {len(ret)}; dates parsed per page: {dict(sorted(ndates.items()))}')
    dm = [r for r in ret if r['saed']['missing'].get('date')]
    ds = [r for r in ret if r['saed']['spurious'].get('date')]
    print(f'  date missing on {len(dm)}, spurious on {len(ds)}')
    for r in (dm + [x for x in ds if x not in dm])[:2 * n]:
        print(f'      {r["name"]} dates {r["dates"]} miss {r["saed"]["missing"].get("date")} spur {r["saed"]["spurious"].get("date")}; '
              f'has {" ".join(sorted(t for t in r["tags"] if t.isdigit() or t in MONTHS))}')
    nod = [r for r in ret if not r['dates']]
    print(f'  no date parsed: {len(nod)}; with any date tag among them: '
          f'{sum(1 for r in nod if any(t.isdigit() or t in MONTHS for t in r["tags"]))}')
    for r in nod[:n]:
        print(f'      {r["name"]} "{r["title"]}" date tags: {" ".join(sorted(t for t in r["tags"] if t.isdigit() or t in MONTHS))}')
    lm = [r for r in ret if r['saed']['missing'].get('letter')]
    print(f'  letter missing (BBP: first a-z of the title) on {len(lm)}: '
          + ', '.join(f'{r["name"].split(":")[1]}={r["saed"]["missing"]["letter"]}' for r in lm[:20]))
    lt = Counter()
    for r in ret:
        lt[len([t for t in r['tags'] if len(t) == 1 and t.isalpha()])] += 1
    print(f'  single-letter tags per page: {dict(sorted(lt.items()))}')


MONTHS = {'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
          'september', 'october', 'november', 'december'}

if __name__ == '__main__':
    main()
