#!/usr/bin/env python3
"""Probe: a show's dependent page named differently from the show its breadcrumbs name.

Track A idea 4 (org/springsteen-marriage.org; vzell, 2026-11-20: the feed kind
"dependent-name" instead of BruceParser's URL-shortening report, a WARNING).
Reads every gignote, gallery, eye, media and recnote page of BruceParser's
mirror (news: is named by the article's date, story: has its own prefixes,
onstage: has no breadcrumbs: all three left out), takes the LAST link of its
breadcrumbs as its parent, and judges a parent that is a show page (gig,
nogig, rehearsal, recording, interview, nobruce):

- the page's slug, with a leading "dl-" dropped (the wiki's convention for the
  note of a download: recnote:dl-2020-04-08-siriusxm-studio-... under
  interview:2020-04-08-siriusxm-studio-...; 47 recnote pages, 1 media page);
- expected name: the page's own prefix + ":" + the parent's slug, cut to 60
  characters, a trailing "-" dropped;
- equal when the name is that; or a "-N" suffix of the page stripped gives it
  (two pages of one date); or a cut explains the difference: the page's slug
  is a prefix of the parent's and the page's name is cut (>= 55 characters),
  or the parent's slug is a prefix of the page's and the parent's name is cut
  (>= 55). Wikidot's cut names in the mirror end at 56 to 60 characters
  (media:1996-05-08-palacio-de-congresos-y-exposiciones-madri, 58), not at 60
  exactly, so the limit is 55.

BruceParser's dependent-names.awk applies the same rule to the run's pages;
its feed kind must equal this probe's --json.

Read-only. No network.

Usage:
    python3 scripts/probe-bb-dependent-names.py [--mirror DIR] [--json FILE] [--list] [--excused]
"""
import argparse
import importlib.util
import json
import os
import re
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('b3', os.path.join(HERE, 'probe-bb-batch3-findings.py'))
b3 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b3)

KINDS = ('gignote', 'gallery', 'eye', 'media', 'recnote')
SHOWS = re.compile(r'^(gig|nogig|rehearsal|recording|interview|nobruce):')
LIMIT = 60
CUT = 55


def parent_of(doc):
    """The last link of the page's breadcrumbs, as a page name; '' without one."""
    crumbs = b3.by_id(doc, 'breadcrumbs')
    if crumbs is None:
        return ''
    links = [a.attrs.get('href') or '' for a in crumbs.find_all('a')]
    links = [h for h in links if h.startswith('/')]
    return links[-1][1:] if links else ''


def judge(name, parent):
    """(expected, excuse): expected is None when the name fits its show; excuse names the rule that let it."""
    kind, slug = name.split(':', 1)
    pslug = parent.split(':', 1)[1]
    expected = (kind + ':' + pslug)[:LIMIT].rstrip('-')
    excuse = ''
    if slug.startswith('dl-'):
        slug = slug[3:]
        excuse = 'dl '
    own = kind + ':' + slug
    if own == expected:
        return None, excuse + 'equal'
    if re.sub(r'-\d$', '', own) == expected:
        return None, excuse + '-N'
    if len(name) >= CUT and pslug.startswith(slug):
        return None, excuse + 'page cut'
    if len(parent) >= CUT and slug.startswith(pslug):
        return None, excuse + 'parent cut'
    return expected, ''


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--mirror', default=os.path.expanduser('~/git/scripts/BruceParser/bb/latest'))
    ap.add_argument('--json')
    ap.add_argument('--list', action='store_true')
    ap.add_argument('--excused', action='store_true', help='list the pages an excuse let through')
    args = ap.parse_args(argv)
    mirror = b3.Mirror(os.path.realpath(args.mirror))
    counts = Counter()
    flagged = {}
    excused = []
    for kind in KINDS:
        d = os.path.join(mirror.root, kind)
        if not os.path.isdir(d):
            continue
        for fn in sorted(os.listdir(d)):
            if not (fn.startswith(kind + '_') and fn.endswith('.html')):
                continue
            name = f'{kind}:{fn[len(kind) + 1:-5]}'
            counts[(kind, 'pages')] += 1
            parent = parent_of(b3.parse(mirror.read(name)))
            if not SHOWS.match(parent):
                counts[(kind, 'not judged')] += 1
                continue
            expected, excuse = judge(name, parent)
            if excuse and excuse != 'equal':
                excused.append((excuse, name, parent))
            if expected:
                counts[(kind, 'flagged')] += 1
                flagged[name] = {'event': parent, 'expected': expected}
    print(f'mirror {mirror.root}')
    for kind in KINDS:
        print(f'  {kind:8} pages {counts[(kind, "pages")]:5}  not judged {counts[(kind, "not judged")]:4}  '
              f'flagged {counts[(kind, "flagged")]:4}')
    print(f'flagged: {len(flagged)} pages')
    if args.list:
        for n, v in flagged.items():
            print(f'  {n}  <-  {v["event"]}  (expected {v["expected"]})')
    print(f'excused: {len(excused)} pages ' + str(dict(Counter(e[0] for e in excused))))
    if args.excused:
        for e in excused:
            print(f'  [{e[0]}] {e[1]}  <-  {e[2]}')
    if args.json:
        with open(args.json, 'w', encoding='utf-8') as fh:
            json.dump(flagged, fh, ensure_ascii=False, sort_keys=True, indent=1)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
