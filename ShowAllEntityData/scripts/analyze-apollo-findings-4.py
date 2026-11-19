#!/usr/bin/env python3
"""Break down debug/probe-apollo-findings-4.json (scripts/probe-apollo-findings-4.py).

Prints, for each of the three batch 4 candidates, the hits split by the reason
the rule gave and by what MusicBrainz says, so real problems and noise can be
told apart, plus a few example releases per bucket.

Usage:
    python3 scripts/analyze-apollo-findings-4.py [debug/probe-apollo-findings-4.json]
"""
import collections
import json
import sys


def main():
    """Print the breakdown."""
    path = sys.argv[1] if len(sys.argv) > 1 else 'debug/probe-apollo-findings-4.json'
    d = json.load(open(path, encoding='utf-8'))
    print(f'{d["started"]} – {d["finished"]}, {d["requests"]} requests, {d["releases"]} releases, '
          f'guess made on {d["type_guess_made"]}, disagree {d["type_disagree"]}')

    print('\n== Type guess: disagreements by (RG primary, guess, why, explicit, has secondary)')
    b = collections.Counter()
    ex = collections.defaultdict(list)
    for x in d['type_disagreements']:
        k = (x['primary'], x['guess']['type'], x['guess']['why'], bool(x['guess'].get('explicit')), ','.join(x['secondary']) or '-')
        b[k] += 1
        if len(ex[k]) < 3:
            ex[k].append(f'{x["n"]} tr {x["minutes"]} min [{" + ".join(x["formats"])}] {x["title"]!r} https://musicbrainz.org/release/{x["id"]}')
    for k, n in b.most_common(40):
        print(f'{n:4}  {k}')
        for e in ex[k]:
            print(f'        {e}')

    print('\n== Type guess: explicit title cases only')
    for x in d['type_disagreements']:
        if x['guess'].get('explicit'):
            print(f'  {x["primary"]} <- {x["guess"]["type"]} ({x["guess"]["why"]}) {x["n"]} tr {x["minutes"]} min {x["title"]!r} https://musicbrainz.org/release/{x["id"]}')

    print('\n== VA: by RG secondary types and source')
    b = collections.Counter((','.join(x['secondary']) or '-', x['src']) for x in d['va'])
    for k, n in b.most_common():
        print(f'{n:4}  {k}')
    print('  examples without Compilation/DJ-mix:')
    for x in d['va']:
        if not ({'Compilation', 'DJ-mix'} & set(x['secondary'])):
            print(f'    {x["why"]} {x["title"]!r} https://musicbrainz.org/release/{x["id"]}')

    print('\n== Notices: verdict by source')
    b = collections.Counter((x['src'] == 'annotation-search', x['kind'], x['verdict']) for x in d['notices'])
    for k, n in sorted(b.items()):
        print(f'{n:4}  {"search" if k[0] else "browse"} {k[1]} {k[2]}')
    rel = collections.defaultdict(list)
    for x in d['notices']:
        rel[x['id']].append(x)
    print(f'  releases with a notice: {len(rel)}; with every notice unmatched: '
          f'{sum(1 for v in rel.values() if all(n["verdict"] != "match" for n in v))}')
    print('  examples none-of-kind:')
    for x in [n for n in d['notices'] if n['verdict'] == 'none-of-kind'][:25]:
        print(f'    [{x["kind"]}] {x["line"][:90]!r} -> {x["holders"]} rels={x["rels"]} https://musicbrainz.org/release/{x["id"]}')
    print('  holder lengths (chars) of none-of-kind:', collections.Counter(min(len(h) // 20 * 20, 100) for n in d['notices'] if n['verdict'] == 'none-of-kind' for h in n['holders']))


if __name__ == '__main__':
    main()
