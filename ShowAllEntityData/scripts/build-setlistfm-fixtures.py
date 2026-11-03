#!/usr/bin/env python3
"""Builds the setlist.fm page fixtures for the setlist.fm window specs.

org/setlistfm.org "venue additions", Part B (2026-11-02): the setlist.fm
window reads set times (and a venue's facts) from setlist.fm's own pages,
which the API does not have. The inputs are pages vzell saved from the
browser into `debug/`:

    debug/setlistfm-venue.html           Los Angeles Sports Arena, page 1 (2026-10-29)
    debug/setlistfm-artist.html          Bruce Springsteen's setlists, page 1 (2026-10-29)
    debug/setlistfm-setlist.html         the setlist 4bf0375a, no set times entered (2026-10-29)
    debug/setlistfm-venue-set-times.html the setlist 37589df, with set times (2026-11-02)
    debug/setlistfm-tour-journey.html    the search artist:(Journey) tour:(Final Frontier Tour) (2026-11-02)
    debug/setlistfm-artist-serch.html    the search artist=2bd6dcce&tour=3daa95b (2026-11-02)

The first two list the same setlists, in the same order, as the API answers
tests/fixtures/ext-sfm-venue-setlists-p1.json and
ext-sfm-artist-setlists-p1.json (their first 10, captured the same day), so a
spec checks set times by setlist id against real data.

Each fixture keeps only what `_extSfmSiteParse()` reads: the venue's info box
(`.venueInfo`), every `.setlistPreview` block, and a setlist page's first
"Set Times" box (`.setTimesTimeline`), inside a bare `<html><body>`. Scripts
and their attributes are dropped, runs of whitespace squeezed, no trailing
spaces. Re-run after re-saving a snapshot:

    python3 scripts/build-setlistfm-fixtures.py
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (snapshot, fixture, what to keep, how many .setlistPreview blocks it must hold)
TARGETS = [
    ('debug/setlistfm-venue.html', 'tests/fixtures/sfm-site-venue-3d6c967-p1.html', ('venueInfo', 'setlistPreview'), 10),
    ('debug/setlistfm-artist.html', 'tests/fixtures/sfm-site-artist-2bd6dcce-p1.html', ('setlistPreview',), 10),
    ('debug/setlistfm-setlist.html', 'tests/fixtures/sfm-site-setlist-4bf0375a.html', ('setTimesTimeline',), 0),
    ('debug/setlistfm-venue-set-times.html', 'tests/fixtures/sfm-site-setlist-37589df.html', ('setTimesTimeline',), 0),
    ('debug/setlistfm-tour-journey.html', 'tests/fixtures/sfm-site-tour-journey-p1.html', ('setlistPreview',), 10),
]

# Part C (the sfm-venue / sfm-artist pageTypes): whole pages as the browser
# sees them, in a skeleton of setlist.fm's own (`div.body` > `.container` >
# `.row.main` > `.mainColumn`), with the venue box or the artist heading, the
# Upcoming Shows box (it must stay out of the table), the list and its pager.
# (snapshot, fixture, its heading block's class, the pager's last page here, or 0 to drop it)
PAGE_TARGETS = [
    ('debug/setlistfm-venue-initial-1.html', 'tests/fixtures/sfm-page-venue-73d20e81-p1.html', 'venueInfo', 2),
    ('debug/setlistfm-venue-initial.html', 'tests/fixtures/sfm-page-venue-73d20e81-p2.html', 'venueInfo', 2),
    ('debug/setlistfm-venue-one-page.html', 'tests/fixtures/sfm-page-venue-53d30b75.html', 'venueInfo', 0),
    ('debug/setlistfm-artist.html', 'tests/fixtures/sfm-page-artist-2bd6dcce-p1.html', 'transparentBox border', 0),
    # A search for an artist's tour (2026-11-03): no <h1>, its filter form names it.
    ('debug/setlistfm-artist-serch.html', 'tests/fixtures/sfm-page-search-2bd6dcce-3daa95b.html', 'searchFilter', 0),
]

DIV_TAG_RE = re.compile(r'<(/?)div\b[^>]*>', re.I)


def class_div_starts(html, cls):
    """Offsets of every `<div>` whose class list holds every class of `cls`.

    Args:
        html: The page.
        cls: One class name, or several separated by spaces (all required).

    Returns:
        A list of start offsets, in document order.
    """
    want = cls.split()
    out = []
    for m in re.finditer(r'<div\b[^>]*\bclass="([^"]*)"[^>]*>', html, re.I):
        have = m.group(1).split()
        if all(w in have for w in want):
            out.append(m.start())
    return out


def div_end(html, start):
    """The offset just past the `</div>` that closes the `<div>` at `start`.

    Args:
        html: The page.
        start: Offset of a `<div` start tag.

    Returns:
        The end offset.
    """
    depth = 0
    for m in DIV_TAG_RE.finditer(html, start):
        depth += -1 if m.group(1) else 1
        if depth == 0:
            return m.end()
    sys.exit(f'unbalanced <div> at offset {start}')


def squeeze(fragment):
    """Drops scripts and squeezes whitespace.

    Args:
        fragment: An HTML fragment.

    Returns:
        The fragment, scripts gone, whitespace runs collapsed, one tag run per line.
    """
    fragment = re.sub(r'<script\b.*?</script>', '', fragment, flags=re.S | re.I)
    fragment = re.sub(r'\s+', ' ', fragment)
    return re.sub(r'>\s*<', '>\n<', fragment).strip()


def build(snapshot, out, keep, previews):
    """Writes one fixture.

    Args:
        snapshot: Repo-relative snapshot path.
        out: Repo-relative fixture path.
        keep: Class names whose divs are kept (`setTimesTimeline`: the first only).
        previews: How many `.setlistPreview` blocks the snapshot must hold.

    Returns:
        A one-line summary.
    """
    with open(os.path.join(ROOT, snapshot), encoding='utf-8') as fh:
        html = fh.read().lstrip('﻿')
    parts = []
    for cls in keep:
        starts = class_div_starts(html, cls)
        if cls == 'setTimesTimeline':
            starts = starts[:1]
        if cls == 'setlistPreview' and len(starts) != previews:
            sys.exit(f'{snapshot}: {len(starts)} .setlistPreview, expected {previews} -- has the page changed shape?')
        if not starts:
            sys.exit(f'{snapshot}: no div.{cls}')
        parts += [squeeze(html[s:div_end(html, s)]) for s in starts]
    note = f'<!-- Generated by scripts/build-setlistfm-fixtures.py from {snapshot}: only what _extSfmSiteParse() reads; do not edit by hand. -->'
    body = '\n'.join(parts)
    with open(os.path.join(ROOT, out), 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(f'{note}\n<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>setlist.fm</title></head><body>\n{body}\n</body></html>\n')
    return f'{snapshot} -> {out}: {len(parts)} block(s), {len(body)} chars'


def block(html, cls, snapshot):
    """The first `<div>` holding the classes `cls`, squeezed.

    Args:
        html: The page.
        cls: Class names (all required).
        snapshot: For the error message.

    Returns:
        The block's HTML.
    """
    starts = class_div_starts(html, cls)
    if not starts:
        sys.exit(f'{snapshot}: no div.{cls.replace(" ", ".")}')
    return squeeze(html[starts[0]:div_end(html, starts[0])])


def build_page(snapshot, out, heading_cls, last_page):
    """Writes one live-page fixture of a venue's or an artist's setlists.

    Args:
        snapshot: Repo-relative snapshot path.
        out: Repo-relative fixture path.
        heading_cls: The classes of the block that holds the page's `<h1>`.
        last_page: The pager's last page in the fixture (its links past it
            are dropped, so a spec fetches that many pages), or 0 for no pager.

    Returns:
        A one-line summary.
    """
    with open(os.path.join(ROOT, snapshot), encoding='utf-8') as fh:
        html = fh.read().lstrip('﻿')
    previews = [squeeze(html[s:div_end(html, s)]) for s in class_div_starts(html, 'setlistPreview')]
    if not previews:
        sys.exit(f'{snapshot}: no .setlistPreview')
    parts = [block(html, heading_cls, snapshot)]
    if class_div_starts(html, 'upcomingSetlistsList'):
        parts.append(block(html, 'upcomingSetlistsList', snapshot))
    parts.append('<div class="transparentBox visiblePrint"><div class="row contentBox visiblePrint mergeTop">\n' +
                 '\n'.join(previews) + '\n</div></div>')
    note = f'Generated by scripts/build-setlistfm-fixtures.py from {snapshot}: setlist.fm\'s page skeleton, its heading box, Upcoming Shows, the list'
    if last_page:
        pager = block(html, 'listPager-lg', snapshot)
        # Keep the links to pages 1..last_page; drop the rest and the "...".
        pager = re.sub(r'<li>(?:(?!</li>).)*?page=(\d+)"(?:(?!</li>).)*?</li>',
                       lambda m: m.group(0) if int(m.group(1)) <= last_page else '', pager, flags=re.S)
        pager = pager.replace('<li>\n<span>...</span>\n</li>', '')
        parts.append(pager)
        note += f' and its pager, cut to {last_page} pages'
    note += '; do not edit by hand.'
    body = '\n'.join(parts)
    with open(os.path.join(ROOT, out), 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(f'<!-- {note} -->\n<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>setlist.fm</title></head><body>\n'
                 '<div class="body">\n<div class="header"><div class="container">setlist.fm</div></div>\n'
                 '<div class="container"><div class="row main"><div class="mainColumn col-xs-12 col-md-8">\n'
                 f'{body}\n</div><div class="rightColumn col-xs-12 col-md-4"></div></div></div>\n</div>\n</body></html>\n')
    return f'{snapshot} -> {out}: {len(previews)} setlists{f", pager to {last_page}" if last_page else ""}'


def main():
    """Builds every fixture in TARGETS and PAGE_TARGETS."""
    for target in TARGETS:
        print(build(*target))
    for target in PAGE_TARGETS:
        print(build_page(*target))


if __name__ == '__main__':
    main()
