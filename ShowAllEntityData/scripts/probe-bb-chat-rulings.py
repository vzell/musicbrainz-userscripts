#!/usr/bin/env python3
"""Measure a few of Danny's chat rulings (org/brucebase-chat.org) on the Brucebase mirror.

Usage:
    python3 scripts/probe-bb-chat-rulings.py [--mirror DIR]

Read-only over BruceParser's page lists of one run (default
~/git/scripts/BruceParser/bb/latest): story.txt and all.txt, lines
"<page>><title>><space-separated tags>". No network. Prints, per ruling:
  1. storyteller story pages: by decade, how many carry a month tag and a day
     tag besides their year (efc.sh drops every storyteller story page from the
     date-parts report as "the wiki gives it a year tag only"; Danny,
     2024-09-20: they "will be corrected when the corresponding gig-pages get
     an overhaul", i.e. a backlog, not a convention);
  2. redirect-only pages (onstage:, offstage:, a show's "-N" page) that carry
     date tags (Danny, 2024-09-20: "onstage, offstage, and pages ending with -2,
     -3 etc. they do not get tags for yyyy, mmmm, and dd");
  3. relation pages with "&" in the title and their letter tags (Danny,
     2024-09-20: "Where there is a & in the relation title … They get tag &.").
Written 2026-11-24 for org/brucebase-chat.org.
"""
import argparse
import collections
import os
import re

MONTHS = {'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
          'september', 'october', 'november', 'december'}
DAY = re.compile(r'^(0?[1-9]|[12][0-9]|3[01])$')
YEAR = re.compile(r'^(19|20)[0-9]{2}$')


def rows(path):
    """Yield (page, title, tags set) from a BruceParser page list."""
    with open(path, encoding='utf-8', errors='replace') as f:
        for line in f:
            parts = line.rstrip('\n').split('>')
            if len(parts) < 3:
                continue
            yield parts[0], parts[1], set(parts[2].split())


def main():
    """Print the three measurements."""
    ap = argparse.ArgumentParser()
    ap.add_argument('--mirror', default=os.path.expanduser('~/git/scripts/BruceParser/bb/latest'))
    args = ap.parse_args()
    run = os.path.realpath(args.mirror)
    print('mirror:', run)

    print('\n1. storyteller story pages: month+day tags by decade')
    by = collections.defaultdict(lambda: [0, 0])
    for page, _title, tags in rows(os.path.join(run, 'story.txt')):
        if 'storyteller' not in tags:
            continue
        m = re.search(r'-((?:19|20)[0-9])[0-9]-[0-9]{2}-[0-9]{2}', page)
        if not m:
            continue
        dec = m.group(1) + '0s'
        by[dec][0] += 1
        if tags & MONTHS and any(DAY.match(t) for t in tags):
            by[dec][1] += 1
    for dec in sorted(by):
        total, full = by[dec]
        print('   {}  {:5d} pages, {:5d} with month and day tags'.format(dec, total, full))

    print('\n2. redirect-only pages carrying date tags')
    allp = list(rows(os.path.join(run, 'all.txt')))
    names = {p for p, _t, _g in allp}
    hits = collections.Counter()
    examples = collections.defaultdict(list)
    for page, _title, tags in allp:
        kind = page.split(':', 1)[0]
        base = re.sub(r'-[1-9]$', '', page)
        if kind in ('onstage', 'offstage'):
            key = kind
        elif base != page and base in names and kind not in ('onstage', 'offstage'):
            key = kind + ' -N'
        else:
            continue
        dated = [t for t in tags if t in MONTHS or YEAR.match(t)]
        if dated:
            hits[key] += 1
            if len(examples[key]) < 3:
                examples[key].append('{} [{}]'.format(page, ','.join(sorted(dated))))
    for key in sorted(hits):
        print('   {:12s} {:4d}  e.g. {}'.format(key, hits[key], '; '.join(examples[key])))
    if not hits:
        print('   none')

    print('\n3. relation pages with "&" in the title')
    amp = [(p, t, g) for p, t, g in allp if p.startswith('relation:') and '&' in t]
    with_amp = [x for x in amp if '&' in x[2]]
    print('   {} pages, {} tagged "&"'.format(len(amp), len(with_amp)))
    for p, t, g in amp[:12]:
        letters = sorted(x for x in g if len(x) == 1)
        print('   {}  "{}"  letters: {}'.format(p, t, ','.join(letters) or '-'))

    premieres(run)


def premieres(run):
    """4. Shows with bold (premiere) songs on the Setlist tab and no count tag, tour openers apart.

    Jacob, 2026-07-10: "i believe it was decided not to include premiere tags
    on the first show of a tour … because it screwed up the stats". Batch 3's
    rule (SAED, BruceBaseParser) expects the count on every show with bold songs.
    The count is read as probe-bb-batch3-findings.py reads it; a tour opener is
    the first dated gig of one of its tour_* tags (tour_no left out).
    """
    import importlib.util
    here = os.path.dirname(os.path.abspath(__file__))
    spec = importlib.util.spec_from_file_location('b3', os.path.join(here, 'probe-bb-batch3-findings.py'))
    b3 = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(b3)
    mirror = b3.Mirror(run)
    shows = []
    for name in mirror.events():
        if not name.startswith('gig:'):
            continue
        m = re.match(r'gig:((?:19|20)[0-9]{2}-[0-9]{2}-[0-9]{2})', name)
        markup = mirror.read(name)
        if not m or markup is None:
            continue
        tags = set(b3.page_tags(markup))
        doc = b3.parse(markup)
        cont = b3.setlist_container(doc)
        prem = sum(1 for a in b3.song_links(cont) if a.inside('strong')) if cont is not None else 0
        tours = {t for t in tags if t.startswith('tour_') and t != 'tour_no'}
        shows.append((m.group(1), name, tags, prem, tours))
    first = {}
    for date, _n, _t, _p, tours in shows:
        for t in tours:
            if date[5:] != '00-00' and (t not in first or date < first[t]):
                first[t] = date
    openers = {n for d, n, _t, _p, tours in shows if any(first.get(t) == d for t in tours)}
    print('\n4. shows with bold songs (premieres) on the Setlist tab')
    with_bold = [s for s in shows if s[3] > 0]
    missing = [s for s in with_bold if 'prem' not in s[2]]
    print('   {} gigs read, {} with bold songs, {} of them without the "prem" tag'.format(
        len(shows), len(with_bold), len(missing)))
    print('   of those {}: {} are a tour opener'.format(len(missing), sum(1 for s in missing if s[1] in openers)))
    tagged_openers = [s for s in with_bold if s[1] in openers and 'prem' in s[2]]
    print('   tour openers with bold songs that DO carry "prem": {}'.format(len(tagged_openers)))
    for s in tagged_openers[:8]:
        print('     {} prem={} {}'.format(s[1], s[3], ','.join(sorted(s[4]))))
    print('   the missing ones that are a tour opener:')
    for s in [s for s in missing if s[1] in openers]:
        print('     {} bold={} tours={}'.format(s[1], s[3], ','.join(sorted(s[4])) or '-'))
    print('   the missing ones that are no tour opener:')
    for s in [s for s in missing if s[1] not in openers][:40]:
        print('     {} bold={} tours={}'.format(s[1], s[3], ','.join(sorted(s[4])) or '-'))


if __name__ == '__main__':
    main()
