#!/usr/bin/env python3
"""Inspect the dependent-name probe's output: name lengths near the 60-character cut,
and the breadcrumbs of a sample of pages that were not judged.

Companion of probe-bb-dependent-names.py (Track A idea 4). Read-only, no network.

Usage:
    python3 scripts/inspect-bb-dependent-names.py --json FILE [--mirror DIR] [--kind onstage] [--sample 5]
"""
import argparse
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('dn', os.path.join(HERE, 'probe-bb-dependent-names.py'))
dn = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dn)


def main(argv):
    """Print each flagged page with its lengths, then sample breadcrumbs of one kind."""
    ap = argparse.ArgumentParser()
    ap.add_argument('--json', required=True)
    ap.add_argument('--mirror', default=os.path.expanduser('~/git/scripts/BruceParser/bb/latest'))
    ap.add_argument('--kind', default='onstage')
    ap.add_argument('--sample', type=int, default=5)
    args = ap.parse_args(argv)
    with open(args.json, encoding='utf-8') as fh:
        flagged = json.load(fh)
    print('page len / parent len / expected len')
    for n, v in sorted(flagged.items()):
        print(f'{len(n):3} {len(v["event"]):3} {len(v["expected"]):3}  {n}  <-  {v["event"]}')
    mirror = dn.b3.Mirror(os.path.realpath(args.mirror))
    d = os.path.join(mirror.root, args.kind)
    files = sorted(f for f in os.listdir(d) if f.endswith('.html'))[: args.sample]
    print(f'\n{args.kind}: breadcrumbs of {len(files)} pages')
    for fn in files:
        name = f'{args.kind}:{fn[len(args.kind) + 1:-5]}'
        doc = dn.b3.parse(mirror.read(name))
        crumbs = dn.b3.by_id(doc, 'breadcrumbs')
        hrefs = [a.attrs.get('href') for a in crumbs.find_all('a')] if crumbs is not None else None
        print(f'  {name}: {hrefs}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
