#!/usr/bin/env python3
"""Probe: a Brucebase show's cast tags against its cast tab.

Track A batch 3b, the cast family (org/springsteen-marriage.org, question
2). Reads every event page of BruceParser's mirror through
scripts/probe-bb-batch3-findings.py's own reader (BruceBaseParser's
checkOnStageRelationTags(): the cast tab On Stage / In Studio / On Audio /
On Set, its fixed tag, "guest", a tag per listed relation) and the rows that
script's --rows wrote (the tags of all of a show's pages), and counts:

- the shows with a cast tab, by tab; how many of them have an On stage page
  at all (an On Stage tab without one: every cast tag is missing at once);
- the fixed tag (onstage, studio) and "guest": carried or missing;
- the names: carried under BruceBaseParser's candidates, under those plus
  every name's dotted form ("Vini Lopez" -> vini.lopez, the wiki writes
  many members so), missing; the most missed names.

Read-only. No network.

Usage:
    python3 scripts/probe-bb-cast-tags.py ROWS.json [--mirror DIR] [--list WHAT]

    --list WHAT  noonstage (On Stage tab, no On stage page), names (the missed names with shows), rule (flagged, not by onstage alone)
    --tables F   the feed's tag tables (default BruceParser's brucebase/tag-tables.json)
    --json FILE  write the rule's findings of EVERY row as JSON {name: {missing, spurious}}
                 (the input of scripts/check-bb-batch3b-findings.js --family cast)
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


def dotted(name):
    """A name's dotted forms: first word "." the rest, also without a nickname ("Ernest "Boom" Carter" -> ernest.carter)."""
    out = []
    for n in (name, re.sub(r'\s+', ' ', re.sub(r'\s*"[^"]*"\s*', ' ', name)).strip()):
        n = re.sub(r'^the\s+', '', n, flags=re.I)
        parts = n.split()
        if len(parts) >= 2:
            d = b3.slug(parts[0]) + '.' + b3.slug(' '.join(parts[1:]))
            if d not in out:
                out.append(d)
    return out


ONSTAGE_KINDS = ('gig', 'nogig', 'rehearsal', 'interview')


def name_items(name, tables):
    """A listed relation's items as the userscript checks them: [(label, reported tag, [accepted tags])].

    BruceBaseParser's checkRelationNameTags()/checkSingleRelationName()
    candidates (the slug; without "The"; without Jr./Sr./II/III/IV; without
    a nickname; the E Street Band's dotted form, the feed's eStreetDotted;
    the feed's relationAlias), plus every name's dotted form (vzell,
    2026-11-19). "A & B": each part, and the two run together count for both.
    """
    def one(n):
        the = re.sub(r'^the\s+', '', n, flags=re.I)
        suffix = re.sub(r'\s+(?:Jr\.?|Sr\.?|III|II|IV)$', '', n, flags=re.I).strip()
        nick = re.sub(r'\s+', ' ', re.sub(r'\s*"[^"]*"\s*', ' ', n)).strip()
        dot = (tables.get('eStreetDotted') or {}).get(n.lower().strip())
        over = (tables.get('relationAlias') or {}).get(n.lower().strip())
        alts = [b3.slug(n), b3.slug(the), b3.slug(suffix), b3.slug(nick)] + ([dot] if dot else []) + ([over] if over else []) + dotted(n)
        return dot, [a for a in dict.fromkeys(alts) if a]

    m = re.match(r'^(.+?)\s*&\s*(.+)$', name)
    if not m:
        dot, alts = one(name)
        return [(name, dot, alts)]
    combined = b3.slug(re.sub(r'\s*&\s*', '', re.sub(r'^the\s+', '', name, flags=re.I)))
    out = []
    for part in (m.group(1).strip(), m.group(2).strip()):
        dot, alts = one(part)
        out.append((part, dot, [a for a in dict.fromkeys(alts + [combined]) if a]))
    return out


def rule_findings(r, tables):
    """The cast family's missing tags of one row, as decided (vzell, 2026-11-19)."""
    cast = (r.get('facts') or {}).get('cast')
    if not cast:
        return []
    tags = set(r['tags'])
    for _, more in r.get('pages') or []:
        tags.update(more)
    kind = r['kind']
    onstage_case = cast['tab'] == 'On Stage' and kind in ONSTAGE_KINDS
    missing = []
    if onstage_case:
        if not any(p.startswith('onstage:') for p, _ in r.get('pages') or []):
            return ['onstage'] if kind != 'interview' else []
        if kind != 'interview' and 'onstage' not in tags:
            missing.append('onstage')
    prefer = (cast['tab'] == 'On Stage' and kind in ('gig', 'rehearsal')
              and not any(n.lower() == 'the e street band' for n in cast['names']))
    for n in cast['names']:
        for label, dot, alts in name_items(n, tables):
            if not any(b3.present(a, tags) for a in alts):
                reported = dot if prefer and dot else alts[0]
                if reported not in missing:
                    missing.append(reported)
    return missing


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('rows')
    ap.add_argument('--mirror', default=os.path.expanduser('~/git/scripts/BruceParser/bb/latest'))
    ap.add_argument('--list')
    ap.add_argument('--tables', default=os.path.expanduser('~/git/scripts/BruceParser/brucebase/tag-tables.json'))
    ap.add_argument('--json')
    args = ap.parse_args(argv)
    rows = json.load(open(args.rows, encoding='utf-8'))
    mirror = b3.Mirror(os.path.realpath(args.mirror))
    tabs_n = Counter()
    fixed = defaultdict(Counter)
    guest = Counter()
    names = Counter()
    missed = Counter()
    missed_shows = defaultdict(list)
    noonstage = []
    for r in rows:
        doc = b3.parse(mirror.read(r['name']))
        tabs = b3.tab_map(doc)
        entry = next(((lab, fx) for lab, fx in b3.RELATION_TABS if lab in tabs), None)
        if entry is None:
            continue
        label, fx = entry
        tabs_n[(r['kind'], label)] += 1
        tags = set(r['tags'])
        for _, more in r.get('pages') or []:
            tags.update(more)
        has_onstage_page = any(p.startswith('onstage:') for p, _ in r.get('pages') or [])
        if label == 'On Stage' and not has_onstage_page:
            noonstage.append(r['name'])
        if fx and not (label == 'On Stage' and r['kind'] == 'interview'):
            fixed[fx]['carried' if fx in tags else 'missing'] += 1
            if fx not in tags:
                fixed[fx]['missing, no On stage page' if label == 'On Stage' and not has_onstage_page else 'missing, with one'] += 1
        rels = b3.relations(doc)
        if any(x and re.search('guest', x, re.I) for _, x in rels):
            guest['carried' if 'guest' in tags else 'missing'] += 1
        prefer = label == 'On Stage' and r['kind'] in ('gig', 'rehearsal') and not any(n.lower() == 'the e street band' for n, _ in rels)
        for n in dict.fromkeys(n for n, _ in rels):
            names['listed'] += 1
            res = b3.check_relation(n, tags, prefer)
            if all(hit for _, _, hit in res):
                names['bbp'] += 1
                continue
            if any(d in tags for d in dotted(n)):
                names['dotted'] += 1
                continue
            names['missed'] += 1
            if label == 'On Stage' and not has_onstage_page:
                names['missed, no On stage page'] += 1
            missed[n] += 1
            missed_shows[n].append(r['name'])
    print(f'mirror {mirror.root}')
    print('\nshows with a cast tab, by kind and tab:')
    for (kind, label), n in sorted(tabs_n.items(), key=lambda kv: -kv[1]):
        print(f'  {kind:10} {label:10} {n:5}')
    print(f'\nOn Stage tab without an On stage page: {len(noonstage)} shows')
    for fx, c in fixed.items():
        print(f'fixed tag {fx}: ' + ', '.join(f'{k} {v}' for k, v in c.items()))
    print('guest (a listed relation marked guest): ' + ', '.join(f'{k} {v}' for k, v in guest.items()))
    print(f'\nnames: {names["listed"]} listed (once per show); carried under BBP\'s candidates {names["bbp"]}, '
          f'only in the dotted form {names["dotted"]}, missed {names["missed"]} '
          f'({names["missed, no On stage page"]} of them on a show with no On stage page)')
    print('most missed: ' + ', '.join(f'{n} {c}' for n, c in missed.most_common(20)))
    tables = json.load(open(args.tables, encoding='utf-8'))
    every = {r['name']: rule_findings(r, tables) for r in rows}
    flagged = {n: m for n, m in every.items() if m}
    only_onstage = sum(1 for m in flagged.values() if m == ['onstage'])
    print(f'\nthe rule (onstage, a missing On stage page as "onstage" alone, every name with its dotted form): '
          f'{len(flagged)} shows ({only_onstage} with "onstage" alone), {sum(len(m) for m in flagged.values())} missing tags; '
          + ', '.join(f'{t} {n}' for t, n in Counter(t for m in flagged.values() for t in m).most_common(12)))
    if args.json:
        with open(args.json, 'w', encoding='utf-8') as fh:
            json.dump({n: {'missing': m, 'spurious': []} for n, m in every.items()}, fh, ensure_ascii=False)
    if args.list == 'rule':
        for n, m in flagged.items():
            if m != ['onstage']:
                print(f'  {n}  {m}')
    if args.list == 'noonstage':
        for n in noonstage:
            print('  ' + n)
    elif args.list == 'names':
        for n, c in missed.most_common(40):
            print(f'  {n} {c}: {", ".join(missed_shows[n][:3])}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
