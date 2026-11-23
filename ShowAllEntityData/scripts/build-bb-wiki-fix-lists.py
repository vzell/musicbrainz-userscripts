#!/usr/bin/env python3
"""Build the wiki-fix lists for Danny from one BruceParser run's reports.

Usage:
    python3 scripts/build-bb-wiki-fix-lists.py RUN_DIR [--part email|full]

RUN_DIR is a BruceParser run directory (bb/<date>, 0.39.0 or later). Reads
REPORTING/DIFFERENCES-titles-between-YEAR-and-YEAR-LIST-pages.org (0.39.0),
NO-PARENT-detail-pages.org (0.38.0), MISSING-tags.txt,
MISSING-first-character-tag-in-title.txt and MISMATCH-images-files-tag.org
(0.37.0) and prints plain text:
  --part email  the items for the e-mail draft in org/bbp-parity.org (short
                groups in full, long groups as a count, examples and the
                volkerzell.de page that lists them);
  --part full   every page of every group (the draft's appendix).
Written 2026-11-23 for the audit of the five flat reports; nothing is
fetched, the run's files are the only input.
"""
import argparse
import os
import re
import sys

BASE = 'https://brucebase.wikidot.com/'
REPORT_PAGE = 'https://volkerzell.de/bruce/brucebase-report.html'
ORG_LINK = re.compile(r'\[\[([^]]+)\]\[([^]]*)\]\]')


def read(path):
    """Return the file's lines without line ends ([] when it is missing)."""
    if not os.path.exists(path):
        sys.exit(f'missing: {path}')
    with open(path, encoding='utf-8') as f:
        return [line.rstrip('\n') for line in f]


def cells(line):
    """Split an org table row into its stripped cells."""
    return [c.strip() for c in line.strip().strip('|').split('|')]


def year_list(rep):
    """Group the rows of the YEAR vs YEAR-LIST report."""
    groups = {'title': [], 'link': [], 'add': [], 'lacks': [], 'twice': []}
    for line in read(os.path.join(rep, 'DIFFERENCES-titles-between-YEAR-and-YEAR-LIST-pages.org')):
        if not line.startswith('|'):
            continue
        left, right = (cells(line) + ['', ''])[:2]
        lm, rm = ORG_LINK.search(left), ORG_LINK.search(right)
        if lm and lm.group(2).startswith('anchor used'):
            groups['twice'].append(f'YEAR page {lm.group(1)}: {lm.group(2)}')
        elif not lm and rm:
            groups['twice'].append(f'list page {rm.group(1)}: {rm.group(2)}')
        elif lm and lm.group(2) == 'MISSING':
            groups['lacks'].append(f'{rm.group(1)}: "{rm.group(2)}" links to {lm.group(1)}, an anchor the year page does not have')
        elif rm and rm.group(2).startswith('MISSING (linked as '):
            key = rm.group(2)[len('MISSING (linked as '):-1]
            groups['link'].append(f'{rm.group(1)}: "{lm.group(2)}" links to /{key}; the year page has it as {lm.group(1)}')
        elif rm and rm.group(2) == 'MISSING':
            groups['add'].append(f'{rm.group(1)}: "{lm.group(2)}" is not listed ({lm.group(1)})')
        else:
            groups['title'].append((lm.group(1), lm.group(2), rm.group(2)))
    return groups


def no_parent(rep):
    """The NO-PARENT rows: (category, url)."""
    out = []
    for line in read(os.path.join(rep, 'NO-PARENT-detail-pages.org')):
        if line.startswith('|'):
            c = cells(line)
            out.append((c[0], c[1]))
    return out


def no_tags(rep):
    """The pages of MISSING-tags.txt."""
    return [m.group(1) for line in read(os.path.join(rep, 'MISSING-tags.txt'))
            for m in [re.search(r'(https://\S+)\s+doesn.t have ANY tag', line)] if m]


def first_letter(rep):
    """The ERROR rows of the first-letter report: (url, missing tag)."""
    return [(m.group(1), m.group(2)) for line in read(os.path.join(rep, 'MISSING-first-character-tag-in-title.txt'))
            for m in [re.search(r'^ERROR --- (https://\S+)\s+is missing single first character tag ==> (\S+)', line)] if m]


def images(rep):
    """The image report rows: own files without the tag, the tag without own files."""
    own_untagged, tagged_none = [], []
    for line in read(os.path.join(rep, 'MISMATCH-images-files-tag.org')):
        if not line.startswith('|'):
            continue
        c = cells(line)
        m = ORG_LINK.search(c[1])
        url, tagged, own = m.group(1), c[4] == 'yes', int(c[5] or 0)
        (tagged_none if tagged else own_untagged).append((c[0], url, own, c[2] == 'yes'))
    return own_untagged, tagged_none


def by_category(rows):
    """'gallery 16, venue 36' for (category, ...) rows."""
    counts = {}
    for r in rows:
        counts[r[0]] = counts.get(r[0], 0) + 1
    return ', '.join(f'{k} {v}' for k, v in sorted(counts.items()))


def email(rep):
    """Print the e-mail items 8-12."""
    yl = year_list(rep)
    np_rows = no_parent(rep)
    story = [u for c, u in np_rows if c == 'story']
    other = [(c, u) for c, u in np_rows if c != 'story']
    nt = no_tags(rep)
    fl = first_letter(rep)
    own_untagged, tagged_none = images(rep)
    p = print
    p(f'8. Year pages vs. their list pages ({len(yl["title"])} titles differ, {len(yl["link"])} wrong links,')
    p(f'   {len(yl["add"])} entries not listed, {len(yl["lacks"])} list entry without a year-page anchor,')
    p(f'   {len(yl["twice"])} anchors/links used twice). Titles, year page first:')
    for url, year_t, list_t in yl['title']:
        p(f'   {url}')
        p(f'      year page: {year_t}')
        p(f'      list page: {list_t}')
    p('   Wrong links on the list page:')
    for s in yl['link']:
        p(f'   - {s}')
    p('   Not on the list page:')
    for s in yl['add']:
        p(f'   - {s}')
    p('   On the list page, but no anchor on the year page:')
    for s in yl['lacks']:
        p(f'   - {s}')
    p('   Used twice:')
    for s in yl['twice']:
        p(f'   - {s}')
    p('')
    p(f'9. Pages without a parent page (no link in their breadcrumbs), {len(np_rows)}:')
    dates = sorted(re.search(r'\d{4}-\d{2}-\d{2}', u).group(0) for u in story)
    p(f'   - {len(story)} storyteller stories, {dates[0]} to {dates[-1]},')
    p(f'     e.g. {story[0]}')
    p(f'   - and {len(other)} others ({by_category(other)}):')
    for c, u in other:
        p(f'     {u}')
    p('')
    p(f'10. Pages without any tag, {len(nt)}:')
    for u in nt:
        p(f'    {u}')
    p('')
    p(f'11. Pages without (or with the wrong) first-letter tag, {len(fl)}:')
    for u, t in fl:
        p(f'    {u:<88} (expected "{t}")')
    p('')
    p(f'12. The "files" tag: {len(own_untagged)} pages have pictures or files of their own but no')
    p(f'    "files" tag ({by_category(own_untagged)}), e.g.')
    for c, u, own, shows in own_untagged[:4]:
        p(f'    {u}')
    p(f'    and {len(tagged_none)} pages carry the tag without a file of their own')
    p(f'    ({by_category(tagged_none)}), e.g.')
    for c, u, own, shows in tagged_none[:4]:
        p(f'    {u}')
    p('    (Pages that only show pictures stored on other pages, like the album covers on')
    p('    the retail pages, are fine without the tag.)')
    p('')
    p(f'Items 9 and 12 in full: {REPORT_PAGE} after my next upload.')


def full(rep):
    """Print every page of every group."""
    yl = year_list(rep)
    np_rows = no_parent(rep)
    own_untagged, tagged_none = images(rep)
    p = print
    p(f'Year vs. list titles ({len(yl["title"])}):')
    for url, year_t, list_t in yl['title']:
        p(f'  {url} | {year_t} | {list_t}')
    for name in ('link', 'add', 'lacks', 'twice'):
        p(f'Year vs. list, {name} ({len(yl[name])}):')
        for s in yl[name]:
            p(f'  {s}')
    p(f'No parent ({len(np_rows)}):')
    for c, u in np_rows:
        p(f'  {u}')
    p(f'No tag ({len(no_tags(rep))}):')
    for u in no_tags(rep):
        p(f'  {u}')
    p(f'First letter ({len(first_letter(rep))}):')
    for u, t in first_letter(rep):
        p(f'  {u} ({t})')
    p(f'Own files, no "files" tag ({len(own_untagged)}):')
    for c, u, own, shows in own_untagged:
        p(f'  {u}')
    p(f'"files" tag, no own files ({len(tagged_none)}):')
    for c, u, own, shows in tagged_none:
        p(f'  {u}{"" if not shows else "  (shows pictures of other pages)"}')


def main():
    """Parse the arguments and print the chosen part."""
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('run_dir')
    ap.add_argument('--part', choices=['email', 'full'], default='email')
    args = ap.parse_args()
    rep = os.path.join(args.run_dir, 'REPORTING')
    (email if args.part == 'email' else full)(rep)


if __name__ == '__main__':
    main()
