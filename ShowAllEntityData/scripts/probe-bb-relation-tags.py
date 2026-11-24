#!/usr/bin/env python3
"""Probe: a Brucebase relation page's own tag, as the shows that list it carry it (batch 4b).

vzell, 2026-11-24 (org/bbp-parity.org, "Batch 4b"): a relation page's own
name tag is checked against "a BruceParser map of the tag each person's shows
actually use, so stage names pass" (=duckdunn= for Donald Dunn). This probe
derives that map from the mirror the way BruceParser's tag-maps.awk is to
derive it, and measures it, before tag-maps.awk is changed:

- a show: every gig, nogig, rehearsal, recording and interview page (a "-N"
  page without a tab bar is no show of its own), its tags with those of its
  On stage page and "-N" pages (probe-bb-batch3-findings.py tag_pages(), as
  SAED's _bbTagPagesStart() reads them);
- its relations: every /relation: link of its On Stage tab;
- a relation's tag: of the tags the linking shows carry (no kind, date,
  letter, number, tour, release, playlist or the cast tab's generic tags),
  the one with the best F1 (precision: the share of all shows carrying it
  that link the page; recall: the share of the linking shows that carry
  it), when at least MIN_SHOWS shows link the page and its recall is at
  least MIN_RECALL (1 show and 0.5, as decided; =relation-tags.awk= derives the same).

Prints the map's size, the relation pages whose own tags lack their mapped
tag (the candidate findings), and with --json the map ({page: [tag]}).
Read-only, no network.

Usage:
    python3 scripts/probe-bb-relation-tags.py [--mirror DIR] [--json FILE] [--min-shows N] [--min-recall R]
"""
import argparse
import importlib.util
import json
import os
import re
from collections import Counter, defaultdict

_HERE = os.path.dirname(os.path.abspath(__file__))
_SPEC = importlib.util.spec_from_file_location('b3', os.path.join(_HERE, 'probe-bb-batch3-findings.py'))
b3 = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(b3)

GENERIC = set('onstage offstage studio guest estreetband gig nogig rehearsal recording interview content files '
              'info help featured prem soundcheck solo xdate bootleg livedl audio video news memorabilia ticket '
              'setlist handwritten printed storyteller eyewitness rescheduled 0-9 9+ brucespringsteen'.split())
DATES = set(b3.MONTHS) | set(b3.DAYS)


def candidate(t):
    """Whether a show's tag can be a relation's own tag."""
    return (t not in GENERIC and t not in DATES and not re.fullmatch(r'[a-z]|[0-9]+', t)
            and not re.match(r'(tour|r|pl|ott|esr)_', t))


def plain_forms(title):
    """A relation title's names as relation-tags.awk's names_of() writes them.

    "Surname, Name" (two parts) is "Name Surname"; else a trailing "(The)"
    goes; "A & B" is A, B and the two run together; each name as its slug,
    without a leading "The", without Jr./Sr./II/III/IV, without a nickname.
    """
    def nslug(s):
        return re.sub(r'[^a-z0-9]', '', b3.strip_diacritics(s).lower())

    def forms(n):
        return {nslug(n), nslug(re.sub(r'^the\s+', '', n, flags=re.I)),
                nslug(re.sub(r'\s+(?:Jr\.?|Sr\.?|III|II|IV)$', '', n)),
                nslug(re.sub(r'\s*"[^"]*"\s*', ' ', n))}
    p = re.split(r',\s*', title)
    n = f'{p[1]} {p[0]}' if len(p) == 2 else re.sub(r'\s*\([Tt]he\)$', '', title)
    m = re.match(r'^(.+\S)\s*&\s*(\S.*)$', n)
    if not m:
        out = forms(n)
    else:
        out = forms(m.group(1)) | forms(m.group(2))
        out.add(nslug(re.sub(r'\s*&\s*', '', re.sub(r'^[Tt]he\s+', '', n))))
    return {f for f in out if f}


def main():
    """Derive the map and print the measurements."""
    ap = argparse.ArgumentParser()
    ap.add_argument('--mirror', default=os.path.expanduser('~/git/scripts/BruceParser/bb/latest'))
    ap.add_argument('--json')
    ap.add_argument('--min-shows', type=int, default=1)
    ap.add_argument('--min-recall', type=float, default=0.5)
    ap.add_argument("--no-owner", dest="owner", action="store_false",
                    help="keep a tag that names another relation page (measures the exclusion)")
    args = ap.parse_args()
    mirror = b3.Mirror(os.path.realpath(args.mirror))
    carried = {}
    all_count = Counter()
    linkers = defaultdict(set)
    for name in mirror.events():
        markup = mirror.read(name)
        if markup is None:
            continue
        if re.search(r'-\d$', name) and 'class="yui-navset' not in markup:
            continue
        doc = b3.parse(markup)
        tabs = b3.tab_map(doc)
        cast = b3.tab_el(doc, tabs, 'On Stage')
        own = [t.lower() for t in b3.page_tags(markup)]
        tags = set(own)
        for _p, more in b3.tag_pages(mirror, name, own, cast is not None):
            tags.update(t.lower() for t in more)
        carried[name] = tags
        for t in tags:
            all_count[t] += 1
        if cast is None:
            continue
        for a in cast.find_all('a', lambda a: (a.attrs.get('href') or '').startswith('/relation:')):
            href = a.attrs.get('href')[1:].split('#')[0].split('?')[0].rstrip('/')
            linkers[href].add(name)
    # Every relation page: its title's name forms (SAED's cast forms) and its own tags.
    spec = importlib.util.spec_from_file_location('pt', os.path.join(_HERE, 'probe-bb-page-tags.py'))
    pt = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(pt)
    feed_path = os.path.join(mirror.root, 'bb-feed.json')
    tables = json.load(open(feed_path, encoding='utf-8')).get('tagTables', {}) if os.path.isfile(feed_path) else {}
    rel_dir = os.path.join(mirror.root, 'relation')
    pages = {}
    for fn in sorted(os.listdir(rel_dir)):
        if not (fn.startswith('relation_') and fn.endswith('.html')):
            continue
        page = 'relation:' + fn[len('relation_'):-5]
        markup = mirror.read(page)
        doc = b3.parse(markup)
        title = pt.page_title(doc)
        p = pt.relation_person(title)
        name = f'{p[1]} {p[0]}' if p else re.sub(r'\s*\(The\)$', '', re.sub(r',\s*The$', '', title, flags=re.I))
        forms = {a for _l, alts in pt.cast_items(name, tables) for a in alts}
        pages[page] = (title, forms, {t.lower() for t in b3.page_tags(markup)}, pt.tab_labels(doc))
    # A page's names for the "names no other page" rule: its forms without the
    # dotted ones and without the feed tables' (as BruceParser's
    # relation-tags.awk, which reads no tables, writes them)
    name_owner = defaultdict(set)
    for page, (title, _f, _o, _l) in pages.items():
        for f in plain_forms(title):
            name_owner[f].add(page)
    # The map: a page's own tags that its shows carry (recall >= MIN_RECALL)
    # and that name no other relation page.
    rel_map = {}
    for page, shows in linkers.items():
        if page not in pages or len(shows) < args.min_shows:
            continue
        own = pages[page][2]
        keep = []
        for t in sorted(own):
            if not candidate(t) or (args.owner and name_owner.get(t, {page}) - {page}):
                continue
            recall = sum(1 for s in shows if t in carried[s]) / len(shows)
            if recall >= args.min_recall:
                keep.append(t)
        if keep:
            rel_map[page] = keep
    print(f'mirror {mirror.root}')
    print(f'relation pages: {len(pages)}; linked from an On Stage tab: {len(linkers)}; mapped (>= {args.min_shows} '
          f'shows, recall >= {args.min_recall}): {len(rel_map)}')
    checked = flagged_forms = 0
    flagged = []
    for page, (title, forms, own, labels) in sorted(pages.items()):
        if 'redirect' in own or not own:
            continue
        if not ('Bands' in labels or ('Members' in labels and '&' not in title)):
            continue
        checked += 1
        if forms & own:
            continue
        flagged_forms += 1
        if set(rel_map.get(page, [])) & own:
            continue
        flagged.append((page, title, sorted(forms)[:3], len(linkers.get(page, ())), sorted(own)))
    print(f'person/band pages checked: {checked}; no name form: {flagged_forms}; '
          f'and no mapped tag either: {len(flagged)}')
    for page, title, forms, n, own in flagged:
        print(f'  {page} "{title}" wants {forms} ({n} shows); has {" ".join(own)[:110]}')
    if args.json:
        with open(args.json, 'w', encoding='utf-8') as fh:
            json.dump(rel_map, fh, ensure_ascii=False, indent=0)


if __name__ == '__main__':
    main()
