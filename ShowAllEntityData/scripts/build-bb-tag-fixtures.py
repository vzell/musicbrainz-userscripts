#!/usr/bin/env python3
"""Builds the Brucebase tag page fixtures (org/brucebase.org Phase 11) from
the pages scripts/probe-bb-tag-pages.py saved in debug/ (2026-11-12):

  bb-page-tags.html               system:page-tags; the cloud cut to KEEP_TAGS
                                  (the ten biggest, a tag of every family, the
                                  ones the specs name) — 11,571 tags are 1.7 MB
  bb-tag-storyteller.html         system:page-tags/tag/storyteller; the same
                                  cut of the cloud, the list cut to its first
                                  30 entries plus the first interview, story,
                                  content page and page of no category
  bb-pages-and-tags-p1.html       manage:pages-and-tags, page 1 of 35 (whole)
  bb-pages-and-tags-p2.html       its /p/2
  bb-pages-and-tags-p35.html      its /p/35 (the last, 86 rows)

Scripts, noscripts and theme @imports are removed
(scripts/build-bb-event-fixtures.py's `strip()`). The pages name no wiki
member (no `printuser` on any of them; checked here). The AJAX answers the
specs replay are scripts/capture-bb-tag-answers.py's.

    python3 scripts/build-bb-tag-fixtures.py
"""
import importlib.util
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DBG = os.path.join(ROOT, 'debug')
OUT = os.path.join(ROOT, 'tests', 'fixtures')
KEEP_TAGS = {
    'content', 'info', 'news', 'files', 'usa', 'bootleg', 'brucespringsteen', 'gignote', 'gig', 'onstage',
    'storyteller', 'badlands', 'thepromise', 'patti.scialfa', 'garrytallent', '1978', 'april', 'friday',
    'tour_rivertour', 'newjersey(nj)', 'lbl_crystalcat', 'r_btr', 'blauvelt', 'featured', 'a', '&',
}
EXTRA_KINDS = {'story', 'content', 'interview', '_default'}


def _strip():
    """scripts/build-bb-event-fixtures.py's `strip()` (a hyphenated module name)."""
    spec = importlib.util.spec_from_file_location('build_bb_event_fixtures', os.path.join(HERE, 'build-bb-event-fixtures.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.strip


def cut_cloud(html):
    """The cloud with only KEEP_TAGS' links (by their text)."""
    def keep(m):
        text = re.sub(r'<[^>]+>', '', m.group(0))
        text = text.replace('&amp;', '&').strip()
        return m.group(0) if text in KEEP_TAGS else ''
    return re.sub(r'<a class="tag" href="/system:page-tags/tag/[^"]*"\s*style="[^"]*"\s*>[^<]*</a>\s*', keep, html)


def cut_list(html):
    """The tagged list: its first 30 entries and the EXTRA_ITEMS kinds."""
    items = list(re.finditer(r'<div class="pages-list-item">\s*<div class="title">.*?</div>\s*</div>\s*', html, re.S))
    if not items:
        sys.exit('no pages-list-item in the tag page')
    keep, seen = [], set()
    for i, m in enumerate(items):
        href = re.search(r'href="/([^"]*)"', m.group(0)).group(1)
        kind = href.split(':')[0] if ':' in href else '_default'
        if i < 30 or (kind in EXTRA_KINDS and kind not in seen):
            if i >= 30:
                seen.add(kind)
            keep.append(m.group(0))
    start, end = items[0].start(), items[-1].end()
    return html[:start] + ''.join(keep) + html[end:], len(keep)


def write(name, html, what):
    """Writes one fixture with its provenance note."""
    if 'printuser' in html:
        sys.exit(f'{name}: names a wiki member (printuser)')
    note = ('<!-- Built by scripts/build-bb-tag-fixtures.py from debug/ snapshots of 2026-11-12 '
            '(scripts/probe-bb-tag-pages.py); scripts, noscripts and theme @imports removed; do not edit by hand. -->\n')
    html = re.sub(r'(<!DOCTYPE[^>]*>\s*)', lambda m: m.group(1) + note, html, count=1, flags=re.I)
    path = os.path.join(OUT, name)
    with open(path, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(html)
    print(f'wrote {os.path.relpath(path, ROOT)} ({len(html):,} bytes, {what})')


def read(name):
    """One debug snapshot, stripped."""
    path = os.path.join(DBG, name)
    if not os.path.exists(path):
        sys.exit(f'{path} missing: run scripts/probe-bb-tag-pages.py first')
    with open(path, encoding='utf-8', errors='replace') as fh:
        return _strip()(fh.read())


def main():
    """Writes the five fixtures."""
    cloud = cut_cloud(read('bb-page-tags-raw.html'))
    write('bb-page-tags.html', cloud, f'{cloud.count("class=\"tag\"")} tags')
    tag, n = cut_list(cut_cloud(read('bb-tag-storyteller-raw.html')))
    write('bb-tag-storyteller.html', tag, f'{n} entries')
    for p in (1, 2, 35):
        html = read(f'bb-pages-and-tags-p{p}-raw.html')
        write(f'bb-pages-and-tags-p{p}.html', html, f'{html.count("<tr>") - 2} rows')
    return 0


if __name__ == '__main__':
    sys.exit(main())
