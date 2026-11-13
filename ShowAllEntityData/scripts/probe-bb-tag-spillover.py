#!/usr/bin/env python3
"""Probe the Brucebase mirror for tags that spill onto a second page.

Wikidot limits the tags one page can carry. Brucebase parks the overflow of a
gig, rehearsal or interview page on its /onstage:<slug> page (a Redirect
module back to the event), and BruceParser's efc.sh notes a second form:
category pages ending -2, -3, ... that redirect to the main page.

This probe answers, over the WHOLE mirror (every page, no sample):

1. The limit: the largest tag count and the largest total tag length (the
   tags joined by one space, as Wikidot's tag field stores them) on any page,
   and the top of both distributions.
2. Onstage pages: their redirect target, and the tags they carry that the
   target page lacks ("spilled"), per target kind; whether the target has an
   "On Stage" tab.
3. Redirecting -N siblings: same comparison.

Usage:
    python3 scripts/probe-bb-tag-spillover.py [MIRROR_DIR] [--json OUT]

MIRROR_DIR defaults to ~/git/scripts/BruceParser/bb/latest. Pages sit in
per-kind folders as <kind>/<kind>_<slug>.html (category "kind:slug").
"""

import json
import os
import re
import sys
from collections import Counter, defaultdict

TAGS_BLOCK_RE = re.compile(r'<div class="page-tags">(.*?)</div>', re.S)
TAG_RE = re.compile(r'<a href="/system:page-tags/tag/[^"#]*#pages">([^<]*)</a>')
REDIRECT_RE = re.compile(r'Redirect module that redirects the browser directly to the &quot;([^&]+)&quot; page')
ONSTAGE_TAB_RE = re.compile(r'<em>On ?[Ss]tage</em>')
SIBLING_RE = re.compile(r'-[1-9]$')


def page_tags(html):
    """Return the page's tags in page order ([] when there is no tag block)."""
    m = TAGS_BLOCK_RE.search(html)
    if not m:
        return []
    return [t.strip() for t in TAG_RE.findall(m.group(1)) if t.strip()]


def file_for(mirror, ref):
    """Mirror file path of a page reference "kind:slug" (None if malformed)."""
    if ':' not in ref:
        return None
    kind, slug = ref.split(':', 1)
    return os.path.join(mirror, kind, f'{kind}_{slug}.html')


def read(path):
    """Read a mirror file as text (None when missing)."""
    try:
        with open(path, encoding='utf-8', errors='replace') as fh:
            return fh.read()
    except OSError:
        return None


def main(argv):
    """Run the probe and print a report (optionally write JSON details)."""
    args = [a for a in argv if not a.startswith('--')]
    out_json = None
    if '--json' in argv:
        out_json = argv[argv.index('--json') + 1]
        args = [a for a in args if a != out_json]
    mirror = args[0] if args else os.path.expanduser('~/git/scripts/BruceParser/bb/latest')
    mirror = os.path.realpath(mirror)

    by_count = []    # (count, chars, ref)
    redirects = {}   # ref -> target ref
    tags_of = {}     # ref -> list of tags
    onstage_tab = set()
    pages = 0
    for kind in sorted(os.listdir(mirror)):
        kdir = os.path.join(mirror, kind)
        if not os.path.isdir(kdir):
            continue
        prefix = kind + '_'
        for name in os.listdir(kdir):
            if not (name.startswith(prefix) and name.endswith('.html')):
                continue
            html = read(os.path.join(kdir, name))
            if html is None:
                continue
            pages += 1
            ref = f'{kind}:{name[len(prefix):-5]}'
            tags = page_tags(html)
            tags_of[ref] = tags
            if tags:
                by_count.append((len(tags), len(' '.join(tags)), ref))
            m = REDIRECT_RE.search(html)
            if m:
                redirects[ref] = m.group(1)
            if ONSTAGE_TAB_RE.search(html):
                onstage_tab.add(ref)

    print(f'Mirror: {mirror}')
    print(f'Pages read: {pages:,}; with tags: {len(by_count):,}; redirect pages: {len(redirects):,}')

    # 1. The limit.
    print('\n== 1. Tag count and total length per page (own tags only) ==')
    top_n = sorted(by_count, reverse=True)[:15]
    print('Most tags:')
    for c, ch, ref in top_n:
        print(f'  {c:4d} tags  {ch:5d} chars  {ref}')
    top_c = sorted(by_count, key=lambda x: (x[1], x[0]), reverse=True)[:15]
    print('Longest tag string (tags joined by one space):')
    for c, ch, ref in top_c:
        print(f'  {ch:5d} chars  {c:4d} tags  {ref}')

    # 2 + 3. Second pages.
    def compare(refs):
        """Compare each redirect page's tags with its target's."""
        rows = []
        for ref in sorted(refs):
            target = redirects[ref]
            own = tags_of.get(ref, [])
            tgt = tags_of.get(target)
            row = {'page': ref, 'target': target, 'page_tags': len(own),
                   'target_in_mirror': tgt is not None,
                   'target_has_onstage_tab': target in onstage_tab}
            if tgt is not None:
                tset = {t.lower() for t in tgt}
                extra = [t for t in own if t.lower() not in tset]
                row.update({'target_tags': len(tgt), 'target_chars': len(' '.join(tgt)),
                            'spilled': extra})
            rows.append(row)
        return rows

    onstage_refs = [r for r in redirects if r.startswith('onstage:')]
    sib_refs = [r for r in redirects if SIBLING_RE.search(r.split(':', 1)[1]) and not r.startswith('onstage:')]
    results = {'mirror': mirror, 'pages': pages}
    for label, refs, key in (('2. /onstage: pages', onstage_refs, 'onstage'),
                             ('3. redirecting -N siblings', sib_refs, 'siblings')):
        rows = compare(refs)
        results[key] = rows
        print(f'\n== {label} ==')
        print(f'Redirect pages: {len(rows):,}')
        missing = sum(1 for r in rows if not r['target_in_mirror'])
        print(f'Target not in mirror: {missing:,}')
        spilling = [r for r in rows if r.get('spilled')]
        print(f'With tags the target lacks: {len(spilling):,}')
        kinds = Counter(r['target'].split(':', 1)[0] for r in spilling)
        print('  by target kind: ' + ', '.join(f'{k} {n}' for k, n in kinds.most_common()))
        tab = Counter(r['target_has_onstage_tab'] for r in spilling)
        print(f'  target has an On Stage tab: yes {tab[True]}, no {tab[False]}')
        per_cat = defaultdict(int)
        for r in spilling:
            for t in r['spilled']:
                per_cat[t] += 1
        print('  most often spilled tags: ' + ', '.join(f'{t} {n}' for t, n in
                                                        sorted(per_cat.items(), key=lambda x: -x[1])[:15]))
        counts = sorted(len(r['spilled']) for r in spilling)
        if counts:
            print(f'  spilled tags per page: min {counts[0]}, median {counts[len(counts) // 2]}, max {counts[-1]}')
            big = sorted(spilling, key=lambda r: -len(r['spilled']))[:8]
            for r in big:
                print(f"    {len(r['spilled']):4d} spilled  target {r.get('target_tags', 0):4d} tags "
                      f"{r.get('target_chars', 0):5d} chars  {r['target']}")
        # Targets near the limit: how full is the target when it spills?
        full = sorted((r.get('target_chars', 0), r.get('target_tags', 0)) for r in spilling)
        if full:
            print(f"  target size when it spills: chars min {full[0][0]}, max {full[-1][0]}; "
                  f"tags min {min(f[1] for f in full)}, max {max(f[1] for f in full)}")

    if out_json:
        with open(out_json, 'w', encoding='utf-8') as fh:
            json.dump(results, fh, indent=1)
        print(f'\nDetails: {out_json}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
