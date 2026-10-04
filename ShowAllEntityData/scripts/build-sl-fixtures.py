#!/usr/bin/env python3
"""Builds the springsteenlyrics.com list-page fixtures for the `sl-*` fixture specs.

Inputs are the two saved, logged-out snapshots of real springsteenlyrics.com
list pages in `debug/` (captured 2026-10-04):

    debug/sl-collections-initial.html   collection.php?cmd=list&category=album&f_format=12i
    debug/sl-bootlegs-initial.html      bootlegs.php?cmd=list&category=aud_live1967

Each holds 100 item cards (`div.blog-post`) on page 1 of a longer listing (539
and 273 items). A fixture route serves one file per `page=` value, so each
snapshot is split into TWO pages of 50 cards -- every card the snapshot has,
real markup, in the real order -- and only the pagination widget and its
"Showing items X-Y of N" line are rewritten to say two pages. Two is enough to
prove a fetched page is converted too (page 2 is the one the userscript
fetches; page 1 is the live document), which is the property the specs pin.
The page-1 widget keeps a "»" link, because on the real site that link is what
carries the last page number (see DEBUG-NOTES.md, 2026-10-04).

Everything that would reach the network on its own is removed, so a spec stays
network-free: `<script>` blocks, `<link>` tags (stylesheets, icons, fonts) and
inline `background-image: url(...)` declarations (the album-icon filter
buttons). Item thumbnails (`<img src>`) are left alone -- they are part of what
the userscript reads -- and the specs abort image requests instead.

Re-run after re-capturing either snapshot:

    python3 scripts/build-sl-fixtures.py
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (snapshot, fixture stem, href base the pagination links use)
TARGETS = [
    ('debug/sl-collections-initial.html', 'tests/fixtures/sl-collection',
     'collection.php?cmd=list&amp;category=album&amp;f_format=12i'),
    ('debug/sl-bootlegs-initial.html', 'tests/fixtures/sl-bootlegs',
     'bootlegs.php?cmd=list&amp;category=aud_live1967'),
]

CARD_OPEN = '<div class="blog-post">'
SPACER = '<div class="divide30"></div>'
SCRIPT_RE = re.compile(r'<script\b[^>]*>.*?</script>', re.S | re.I)
LINK_RE = re.compile(r'<link\b[^>]*>', re.I)
BG_IMAGE_RE = re.compile(r'background-image:\s*url\([^)]*\);?', re.I)
PAGINATION_RE = re.compile(r'Showing items [^<]*<br>\s*<ul class="pagination">.*?</ul>', re.S)


def pagination(href_base, current, total_pages, first, last, total_items):
    """Returns a "Showing items" line plus a `ul.pagination` shaped like the site's own.

    Args:
        href_base: The list URL without `page=`, `&amp;`-escaped as the site writes it.
        current: The 1-based page this widget is rendered on.
        total_pages: How many pages the listing has.
        first: The first item number shown on this page.
        last: The last item number shown on this page.
        total_items: The listing's item count.

    Returns:
        The replacement HTML for PAGINATION_RE's match.
    """
    items = []
    if current > 1:
        items.append(f'<li><a href="{href_base}&amp;page=1">«</a></li>')
    for p in range(1, total_pages + 1):
        cls = ' class="active"' if p == current else ''
        items.append(f'<li{cls}><a href="{href_base}&amp;page={p}">{p}</a></li>')
    if current < total_pages:
        items.append(f'<li><a href="{href_base}&amp;page={total_pages}">»</a></li>')
    lis = '\n\t\t\t\t\t\t'.join(items)
    return (f'Showing items {first}-{last} of {total_items}<br>\n'
            f'\t\t\t\t\t<ul class="pagination">\n\t\t\t\t\t\t{lis}\n\t\t\t\t\t</ul>')


def build(snapshot, stem, href_base):
    """Splits one snapshot into a two-page fixture pair and writes both files.

    Args:
        snapshot: Repo-relative path of the saved list page.
        stem: Repo-relative output path without the `-pageN.html` suffix.
        href_base: The list URL the pagination links point at.

    Returns:
        A one-line summary for the console.
    """
    with open(os.path.join(ROOT, snapshot), encoding='utf-8') as fh:
        html = fh.read()

    html = SCRIPT_RE.sub('', html)
    html = LINK_RE.sub('', html)
    html = BG_IMAGE_RE.sub('', html)

    start = html.index(CARD_OPEN)
    end = html.index('<hr>', html.rindex(CARD_OPEN))
    head, region, tail = html[:start], html[start:end], html[end:]
    cards = [c for c in region.split(SPACER) if CARD_OPEN in c]
    if len(cards) < 4:
        sys.exit(f'{snapshot}: found only {len(cards)} cards')
    if not PAGINATION_RE.search(tail):
        sys.exit(f'{snapshot}: no pagination widget after the cards')

    half = (len(cards) + 1) // 2
    pages = [cards[:half], cards[half:]]
    total = len(cards)
    first = 1
    for idx, page_cards in enumerate(pages, start=1):
        last = first + len(page_cards) - 1
        body = SPACER.join(page_cards) + SPACER + '\n'
        new_tail = PAGINATION_RE.sub(
            lambda _m: pagination(href_base, idx, len(pages), first, last, total), tail, count=1)
        # The snapshots were saved without a doctype (a DOM serialization
        # drops it); the live site is Bootstrap 3, which needs standards mode.
        note = (f'<!DOCTYPE html>\n<!-- Generated by scripts/build-sl-fixtures.py from {snapshot}: '
                f'page {idx} of {len(pages)}, cards {first}-{last} of {total}. Scripts, <link>s '
                f'and inline background images removed; do not edit by hand. -->\n')
        out = os.path.join(ROOT, f'{stem}-page{idx}.html')
        with open(out, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(note + head + body + new_tail)
        first = last + 1
    return f'{snapshot}: {total} cards -> {stem}-page1.html ({half}) + {stem}-page2.html ({total - half})'


def main():
    """Builds every fixture pair in TARGETS."""
    for snapshot, stem, href_base in TARGETS:
        print(build(snapshot, stem, href_base))


if __name__ == '__main__':
    main()
