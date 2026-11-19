#!/usr/bin/env python3
"""Probe: a Brucebase show's content tags against what its page holds.

Track A batch 3b, the content family (org/springsteen-marriage.org, question
1). Reads every event page of BruceParser's mirror through
scripts/probe-bb-batch3-findings.py's own reader (BruceBaseParser's
computeExpectedTags(), content part) and the rows that script's --rows wrote
(the tags of all of a show's pages), and prints for each content tag:

- expected and carried, expected and missing (BBP's rule), carried by the
  page itself and not expected (BBP's "spurious"), carried with no rule;
- for news and memorabilia: what the News/Memorabilia tab holds (the image
  file names by kind: ticket, pass, setlist, poster, …; text without
  images), against whether the show carries the tag.

Read-only. No network.

Usage:
    python3 scripts/probe-bb-content-tags.py ROWS.json [--mirror DIR] [--list TAG] [--kinds K,K]

    --list TAG   print the shows where BBP expects TAG and it is missing, and those where it is spurious
    --kinds      the event kinds (default: all five)
    --json FILE  write the rule's findings of EVERY row as JSON {name: {missing, spurious}}
                 (the input of scripts/check-bb-batch3b-findings.js --family content)
    --list-rule  print every show the rule flags
"""
import argparse
import importlib.util
import json
import os
import re
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('b3', os.path.join(HERE, 'probe-bb-batch3-findings.py'))
b3 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b3)

CONTENT = ['bootleg', 'livedl', 'news', 'memorabilia', 'ticket', 'setlist', 'handwritten', 'printed',
           'soundcheck', 'storyteller', 'eyewitness', 'rescheduled']
# What an image of the News/Memorabilia tab shows, by its file name (first match wins).
IMG_KINDS = [('ticket', r'ticket'), ('pass', r'/(?:files:)?pass|backstage|-pass'), ('setlist', r'setlist'),
             ('poster', r'poster|flyer|handbill|advert|\bad\b|-ad[-.]'), ('press', r'news|article|paper|review|clipping|press'),
             ('program', r'program|tourbook'), ('photo', r'photo|pic')]


def img_kinds(news):
    """The kinds of the tab's images, by file name; 'other' for the rest."""
    out = Counter()
    for i in news.find_all('img'):
        src = (i.attrs.get('src') or '').lower()
        kind = next((k for k, rx in IMG_KINDS if re.search(rx, src)), 'other')
        out[kind] += 1
    return out


RULE_TAGS = ('ticket', 'setlist', 'handwritten', 'printed', 'storyteller', 'eyewitness')


def rule_findings(r):
    """The content family's findings of one row, as the userscript must compute them."""
    content = (r.get('facts') or {}).get('content')
    if not content:
        return {'missing': [], 'spurious': []}
    own = set(r['tags'])
    tags = set(own)
    for _, more in r.get('pages') or []:
        tags.update(more)
    missing = [t for t in RULE_TAGS if content.get(t) and t not in tags]
    seen = []
    for t in r['tags']:
        if t in ('storyteller', 'eyewitness') and not content.get(t) and t not in seen:
            seen.append(t)
    return {'missing': missing, 'spurious': seen}


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('rows')
    ap.add_argument('--mirror', default=os.path.expanduser('~/git/scripts/BruceParser/bb/latest'))
    ap.add_argument('--list')
    ap.add_argument('--kinds', default='gig,nogig,rehearsal,recording,interview')
    ap.add_argument('--json')
    ap.add_argument('--list-rule', action='store_true')
    args = ap.parse_args(argv)
    rows = json.load(open(args.rows, encoding='utf-8'))
    mirror = b3.Mirror(os.path.realpath(args.mirror))
    kinds = args.kinds.split(',')
    stats = defaultdict(Counter)
    lists = defaultdict(lambda: {'missing': [], 'spurious': []})
    shape = Counter()
    for r in rows:
        if r['kind'] not in kinds:
            continue
        own = set(r['tags'])
        tags = set(own)
        for _, more in r.get('pages') or []:
            tags.update(more)
        exp = {t for t, fam in r['expected'].items() if t in CONTENT}
        for t in CONTENT:
            s = stats[t]
            if t in exp:
                s['expected'] += 1
                if t in tags:
                    s['exp+carried'] += 1
                else:
                    s['exp+missing'] += 1
                    lists[t]['missing'].append(r['name'])
            elif t in own:
                s['spurious'] += 1
                lists[t]['spurious'].append(r['name'])
            if t in tags:
                s['carried'] += 1
        # The News/Memorabilia tab: what it holds, and the two tags.
        doc = b3.parse(mirror.read(r['name']))
        tabs = b3.tab_map(doc)
        label = 'News/Memorabilia' if 'News/Memorabilia' in tabs else 'News' if 'News' in tabs else None
        if label:
            el = b3.tab_el(doc, tabs, label)
            filled = el is not None and not b3.SORRY_RE.match(b3.strip(el.text()))
            ik = img_kinds(el) if el is not None else Counter()
            if not filled:
                what = 'empty ("Sorry, no …")'
            elif not ik:
                what = 'text only'
            else:
                keys = sorted(ik)
                what = 'only ' + '+'.join(keys) if len(keys) <= 2 else 'mixed (3+ kinds)'
            shape[(label, what, 'news' in tags, 'memorabilia' in tags, 'ticket' in tags)] += 1
    print(f'mirror {mirror.root}; kinds {",".join(kinds)}')
    print(f'\n{"tag":12} {"carried":>8} {"expected":>9} {"exp+carried":>12} {"exp+missing":>12} {"spurious":>9}')
    for t in CONTENT:
        s = stats[t]
        print(f'{t:12} {s["carried"]:8} {s["expected"]:9} {s["exp+carried"]:12} {s["exp+missing"]:12} {s["spurious"]:9}')
    print('\nthe news tab: label, what it holds -> shows by (news, memorabilia, ticket) carried')
    groups = defaultdict(Counter)
    for (label, what, n, m, tk), c in shape.items():
        groups[(label, what)][f'news={"y" if n else "n"} mem={"y" if m else "n"} ticket={"y" if tk else "n"}'] += c
    for (label, what), cnt in sorted(groups.items(), key=lambda kv: -sum(kv[1].values())):
        print(f'  {label:17} {what:32} {sum(cnt.values()):5}   ' + ', '.join(f'{k} {v}' for k, v in cnt.most_common()))
    # The rule as decided (vzell, 2026-11-19): the six tags whose rule the
    # wiki follows, from the facts the batch 3 probe reads (content_facts():
    # the setlist images, the Storyteller and Eyewitness tabs, a ticket
    # image; a pass no longer counts). Only storyteller and eyewitness are
    # ever "not expected": a ticket or setlist picture can sit on a news:
    # page the tab lists, or in a Flickr gallery, not in the page. Every
    # kind of event.
    every = {r['name']: rule_findings(r) for r in rows}
    flagged = {n: f for n, f in every.items() if f['missing'] or f['spurious']}
    miss_n = Counter(t for f in flagged.values() for t in f['missing'])
    spur_n = Counter(t for f in flagged.values() for t in f['spurious'])
    print(f'\nthe rule (six tags; only storyteller and eyewitness ever not expected): {len(flagged)} shows, '
          f'{sum(1 for f in flagged.values() if f["missing"])} with a missing tag ({", ".join(f"{t} {n}" for t, n in miss_n.most_common())}), '
          f'{sum(1 for f in flagged.values() if f["spurious"])} with one not expected ({", ".join(f"{t} {n}" for t, n in spur_n.most_common())})')
    if args.list_rule:
        for n, f in flagged.items():
            print(f'  {n}  missing {f["missing"]}  spurious {f["spurious"]}')
    if args.json:
        with open(args.json, 'w', encoding='utf-8') as fh:
            json.dump(every, fh, ensure_ascii=False)
    if args.list:
        print(f'\n--list {args.list}')
        for kind in ('missing', 'spurious'):
            print(f'  {kind}: {len(lists[args.list][kind])}')
            for n in lists[args.list][kind][:25]:
                print(f'    {n}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
