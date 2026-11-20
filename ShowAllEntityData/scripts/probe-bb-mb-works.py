#!/usr/bin/env python3
"""Probe: MusicBrainz works against their Brucebase link (Track A idea 5, check 2).

  python3 scripts/probe-bb-mb-works.py [--xml FILE] [--run DIR] [--out FILE] [--list]

Read-only. Inputs:
  - BruceParser's search/work_linked_to_artist.xml (search.sh -e work, the
    step search-work since BruceParser 0.25.0): the artist's works with
    their URL relationships and aliases;
  - the Brucebase mirror of a run (bb/<date>): every page as
    <category>/<category>_<rest>.html, and song.txt (page>title>tags).

Every work with a brucebase.wikidot.com link is classified, the first kind
that applies (one mark per work):
  no-target   a link whose page is not in the mirror, or whose #anchor is
              on no id/name of its page (a renamed page, a gone anchor);
  shared      a song: page that two or more works link (no anchor);
  title       a song: link whose work title is not the song's title once
              both are compared loosely: case, quotes, dashes, the
              ellipsis, blanks, the wiki's "( - Artist - )" credit after a
              cover's title; the work's aliases count as its title too.
A no-target link gets candidates, the likely one first: for a page that is
not in the mirror, the pages of its category that carry its anchor and
share the longest start with its name (likely: the shortest of them, a
renamed page); for an anchor, its page's anchors (four characters or more)
that start like it, or it like them (likely when only one).

--feed FILE compares the feed's "mbWorks" (BruceParser's feed.sh 1.8,
mb-works.awk) with these marks entry by entry: kind, link, missing, title,
the other works, the candidates. Exit code 1 when anything differs.
A link to a stats:<album>-studio-sessions#<song> anchor is checked for its
page and anchor only: those anchors name session songs, often by an earlier
title (Candy's Room -> #thefastsong), on purpose.

Counts, every marked work and the excused ones go to OUT; a summary is
printed. No network.
"""
import argparse
import collections
import html
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

BP = os.path.expanduser('~/git/scripts/BruceParser')
SITE_RE = re.compile(r'^https?://brucebase\.wikidot\.com/')


def page_file(run_dir, name):
    """The mirror file of a wiki page name: 'song:born-to-run' -> song/song_born-to-run.html."""
    cat, _, rest = name.partition(':')
    return os.path.join(run_dir, cat, f'{cat}_{rest}.html')


def works(xml_path):
    """Yield {mbid, title, dis, aliases, links} for every work of the browse:
    the work-list's own works, not the works nested in their relationships."""
    depth = 0
    for ev, el in ET.iterparse(xml_path, events=('start', 'end')):
        if el.tag != 'work':
            continue
        if ev == 'start':
            depth += 1
            continue
        depth -= 1
        if depth:
            continue
        w = {'mbid': el.get('id'), 'title': el.findtext('title') or '', 'dis': el.findtext('disambiguation') or '',
             'aliases': [a.text or '' for a in el.findall('alias-list/alias')], 'links': []}
        for rl in el.findall('relation-list'):
            if rl.get('target-type') != 'url':
                continue
            for r in rl.findall('relation'):
                t = r.findtext('target') or ''
                if SITE_RE.match(t):
                    w['links'].append(SITE_RE.sub('', t))
        yield w
        el.clear()


def loose(s):
    """The loose title: case, quotes, dashes, ellipsis, blanks, and a trailing '( - Artist - )'."""
    s = html.unescape(s or '')
    s = re.sub(r'\s*\(\s*-\s+.*?\s+-\s*\)\s*$', '', s)
    s = re.sub('[‐-―−]', '-', s)
    s = re.sub('[‘’ʼ`´]', "'", s).replace('“', '"').replace('”', '"')
    s = s.replace('…', '...')
    return re.sub(r'\s+', ' ', s).strip().lower()


def main():
    """Classify every work with a Brucebase link; print and write the result."""
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--xml', default=os.path.join(BP, 'search', 'work_linked_to_artist.xml'))
    ap.add_argument('--run', default=os.path.join(BP, 'bb', 'latest'))
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'debug', 'probe-bb-mb-works.json'))
    ap.add_argument('--list', action='store_true', help='print every marked and excused work')
    ap.add_argument('--feed', help='a feed 1.8 whose mbWorks to compare with the marks')
    args = ap.parse_args()
    run = os.path.realpath(args.run)

    titles = {}
    for line in open(os.path.join(run, 'song.txt'), encoding='utf-8', errors='replace'):
        p = line.rstrip('\n').split('>')
        if len(p) >= 2:
            titles[p[0]] = p[1]

    page_ids = {}

    def ids_of(name):
        """The id and name attributes of a mirror page, or None when it is not in the mirror."""
        if name not in page_ids:
            f = page_file(run, name)
            page_ids[name] = set(re.findall(r'\b(?:id|name)="([^"]+)"', open(f, encoding='utf-8', errors='replace').read())) if os.path.exists(f) else None
        return page_ids[name]

    cat_ids = {}

    def pages_with(cat, anchor):
        """The mirror's pages of a category that carry an anchor, sorted."""
        if cat not in cat_ids:
            cat_ids[cat] = {}
            d = os.path.join(run, cat)
            for fn in sorted(os.listdir(d)) if os.path.isdir(d) else []:
                if fn.startswith(cat + '_') and fn.endswith('.html'):
                    src = open(os.path.join(d, fn), encoding='utf-8', errors='replace').read()
                    cat_ids[cat][f'{cat}:{fn[len(cat) + 1:-5]}'] = set(re.findall(r'\b(?:id|name)="([^"]+)"', src))
        return sorted(n for n, ids in cat_ids[cat].items() if anchor in ids)

    def lcp(a, b):
        """The length of the common start of two strings."""
        n = 0
        while n < min(len(a), len(b)) and a[n] == b[n]:
            n += 1
        return n

    def page_candidates(page, anchor):
        """Candidates of a missing page: the anchor's pages of the closest family, the shortest likely."""
        if not anchor:
            return []
        found = pages_with(page.split(':')[0], anchor)
        if not found:
            return []
        best = max(lcp(f, page) for f in found)
        family = [f for f in found if lcp(f, page) == best]
        likely = min(family, key=len)
        return [{'link': f'{likely}#{anchor}', 'likely': True}] + [{'link': f'{f}#{anchor}'} for f in family if f != likely]

    def anchor_candidates(page, anchor):
        """Candidates of a missing anchor: its page's anchors that start like it or it like them."""
        hits = sorted(a for a in ids_of(page) if len(a) >= 4 and len(anchor) >= 4 and a != anchor
                      and (a.startswith(anchor) or anchor.startswith(a)))
        return [{'link': f'{page}#{a}', **({'likely': True} if len(hits) == 1 else {})} for a in hits]

    all_works = list(works(args.xml))
    linked = [w for w in all_works if w['links']]
    by_song = collections.defaultdict(list)
    for w in linked:
        for l in w['links']:
            if l.startswith('song:') and '#' not in l:
                by_song[l.rstrip('/')].append(w)

    c = collections.Counter()
    marks = {}
    excused = collections.defaultdict(list)
    for w in linked:
        c['works with a Brucebase link'] += 1
        kind = None
        for l in w['links']:
            page, _, anchor = l.rstrip('/').partition('#')
            c['links'] += 1
            c['links to ' + page.split(':')[0]] += 1
            ids = ids_of(page)
            if ids is None:
                kind = kind or {'kind': 'no-target', 'link': l.rstrip('/'), 'missing': 'page', 'candidates': page_candidates(page, anchor)}
            elif anchor and anchor not in ids and f'u-{anchor}' not in ids:
                kind = kind or {'kind': 'no-target', 'link': l.rstrip('/'), 'missing': 'anchor', 'candidates': anchor_candidates(page, anchor)}
        if not kind:
            for l in w['links']:
                page = l.rstrip('/')
                if page.startswith('song:') and '#' not in page and len(by_song[page]) > 1:
                    kind = {'kind': 'shared', 'link': page, 'title': titles.get(page, ''),
                            'others': [{'mbid': o['mbid'], 'title': o['title']} for o in by_song[page] if o is not w]}
                    break
        if not kind:
            for l in w['links']:
                page = l.rstrip('/')
                if not page.startswith('song:') or '#' in page or page not in titles:
                    continue
                bt = titles[page]
                if loose(w['title']) == loose(bt):
                    if w['title'] != bt:
                        excused['title: case, typography or the cover credit'].append(f"{w['title']} || {bt}")
                    continue
                if any(loose(a) == loose(bt) for a in w['aliases']):
                    excused['title: an alias'].append(f"{w['title']} || {bt}")
                    continue
                kind = {'kind': 'title', 'link': page, 'title': bt}
                break
        if kind:
            kind['work'] = w['title']
            if w['dis']:
                kind['dis'] = w['dis']
            marks[w['mbid']] = kind
            c['marked ' + kind['kind'] + (f" ({kind['missing']})" if kind.get('missing') else '')] += 1
    c['works'] = len(all_works)

    out = {'xml': args.xml, 'run': run, 'counts': dict(sorted(c.items())), 'marks': marks,
           'excused': {k: v for k, v in excused.items()}}
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    json.dump(out, open(args.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps(out['counts'], indent=1, ensure_ascii=False))
    print({k: len(v) for k, v in excused.items()})
    if args.list:
        for mbid, m in sorted(marks.items(), key=lambda kv: (kv[1]['kind'], kv[1]['work'])):
            print(f"  {m['kind']:9} {m['work']}{' [' + m['dis'] + ']' if m.get('dis') else ''} -> {m['link']}"
                  f"{' (' + m['missing'] + ')' if m.get('missing') else ''}{' || BB ' + m['title'] if m.get('title') else ''}"
                  f"{' | others: ' + ', '.join(o['title'] for o in m['others']) if m.get('others') else ''}  {mbid}")
        for k, v in excused.items():
            print(f'  excused, {k}: {len(v)}; e.g. ' + ' / '.join(v[:4]))
    if args.feed:
        feed = json.load(open(args.feed, encoding='utf-8'))
        theirs = feed.get('mbWorks') or {}
        diffs = []
        for mbid in sorted(set(marks) | set(theirs)):
            mine, got = dict(marks.get(mbid) or {}), dict(theirs.get(mbid) or {})
            for d in (mine, got):
                if not d.get('candidates'):
                    d.pop('candidates', None)
                if not d.get('title'):
                    d.pop('title', None)
            if mine != got:
                diffs.append({'mbid': mbid, 'probe': mine, 'feed': got})
        print(f"feed {feed.get('run', {}).get('feed')}: mbWorks {len(theirs)}, the probe {len(marks)}, differing {len(diffs)}")
        for d in diffs[:10]:
            print('   ', json.dumps(d, ensure_ascii=False))
        return 1 if diffs else 0
    return 0


if __name__ == '__main__':
    sys.exit(main())
