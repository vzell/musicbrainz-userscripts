#!/usr/bin/env python3
"""Builds the springsteenlyrics.com list-page fixtures for the `sl-*` fixture specs.

Inputs are saved, logged-out snapshots of real springsteenlyrics.com list
pages in `debug/`:

    debug/sl-collections-initial.html   collection.php?cmd=list&category=album&f_format=12i  (2026-10-04)
    debug/sl-bootlegs-initial.html      bootlegs.php?cmd=list&category=aud_live1967          (2026-10-04)
    debug/sl-collection-initial.html    collection.php  (the entry page, `pg=` pagination)  (2026-10-05)
    debug/sl-sampler-raw.html           collection.php?cmd=list&category=sampler            (2026-10-05, curl)
    debug/sl-memorabilia-raw.html       collection.php?cmd=list&category=memorabilia        (2026-10-05, curl)
    debug/sl-bootleg.html               bootlegs.php  (the bootleg landing page, no cards)  (2026-10-05)
    debug/sl-brucelegs.html             brucelegs.php?cmd=list  (CD and vinyl bootlegs)     (2026-10-06)

The last three render the "Filter by original year of release" block, whose
stray `</div>` closes `.project-detail` before the list -- the shape the
`.project-detail`-scoped card lookup missed (DEBUG-NOTES.md, 2026-10-05). On
memorabilia (like book) a second one also closes the floated `.col-sm-12`
around it, which is what Sticky Page Headers has to descend into.

The first three hold 100 item cards (`div.blog-post`) on page 1 of a longer
listing. A fixture route serves one file per page-parameter value, so each of
them is split into TWO pages of 50 cards -- every card the snapshot has,
real markup, in the real order -- and only the pagination widget and its
"Showing items X-Y of N" line are rewritten to say two pages. Two is enough to
prove a fetched page is converted too (page 2 is the one the userscript
fetches; page 1 is the live document), which is the property the specs pin.
The page-1 widget keeps a "»" link, because on the real site that link is what
carries the last page number (see DEBUG-NOTES.md, 2026-10-04). The sampler
(99 items) and memorabilia (29) snapshots are whole categories with no
pagination widget at all, and are kept as ONE page each, widget-less, as the
site serves them.

Everything that would reach the network on its own is removed, so a spec stays
network-free: `<script>` blocks, `<link>` tags (stylesheets, icons, fonts) and
inline `background-image: url(...)` declarations (the album-icon filter
buttons). So is what a removed script had written into the DOM before the
snapshot was saved: jquery.sticky's inline `height: 80px` on the navbar's
`sticky-wrapper`. Without the site's stylesheet the navbar renders as a tall
unstyled list that spills out of those 80px over the content below, and once
Sticky Page Headers pins the wrapper (z-index 106) that spill covers the
toolbar and swallows its clicks -- a fixture artifact, not a site behaviour
(the curl-captured sampler page has no wrapper at all). Item thumbnails (`<img src>`) are left alone -- they are part of what
the userscript reads -- and the specs abort image requests instead.

Re-run after re-capturing either snapshot:

    python3 scripts/build-sl-fixtures.py
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (snapshot, fixture stem, href base the pagination links use, page parameter, split in two)
TARGETS = [
    ('debug/sl-collections-initial.html', 'tests/fixtures/sl-collection',
     'collection.php?cmd=list&amp;category=album&amp;f_format=12i', 'page', True),
    ('debug/sl-bootlegs-initial.html', 'tests/fixtures/sl-bootlegs',
     'bootlegs.php?cmd=list&amp;category=aud_live1967', 'page', True),
    ('debug/sl-collection-initial.html', 'tests/fixtures/sl-collection-intro',
     'collection.php?cmd=intro&amp;category=all', 'pg', True),
    ('debug/sl-sampler-raw.html', 'tests/fixtures/sl-sampler',
     'collection.php?cmd=list&amp;category=sampler', 'page', False),
    ('debug/sl-memorabilia-raw.html', 'tests/fixtures/sl-memorabilia',
     'collection.php?cmd=list&amp;category=memorabilia', 'page', False),
    ('debug/sl-brucelegs.html', 'tests/fixtures/sl-brucelegs',
     'brucelegs.php?cmd=list', 'page', True),
]

# Pages without item cards, sanitised the same way and written whole:
# (snapshot, fixture stem).
PLAIN_TARGETS = [
    ('debug/sl-bootleg.html', 'tests/fixtures/sl-bootlegs-intro'),
]

CARD_OPEN = '<div class="blog-post">'
SPACER = '<div class="divide30"></div>'
SCRIPT_RE = re.compile(r'<script\b[^>]*>.*?</script>', re.S | re.I)
LINK_RE = re.compile(r'<link\b[^>]*>', re.I)
BG_IMAGE_RE = re.compile(r'background-image:\s*url\([^)]*\);?', re.I)
STICKY_WRAPPER_STYLE_RE = re.compile(r'(<div id="[^"]*sticky-wrapper" class="sticky-wrapper") style="[^"]*"')
DOCTYPE_RE = re.compile(r'^\s*<!DOCTYPE[^>]*>\s*', re.I)
PAGINATION_RE = re.compile(r'Showing items [^<]*<br>\s*<ul class="pagination">.*?</ul>', re.S)


def pagination(href_base, page_param, current, total_pages, first, last, total_items):
    """Returns a "Showing items" line plus a `ul.pagination` shaped like the site's own.

    Args:
        href_base: The list URL without the page parameter, `&amp;`-escaped as the site writes it.
        page_param: The page parameter's name (`page`; `pg` on the collection entry page).
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
        items.append(f'<li><a href="{href_base}&amp;{page_param}=1">«</a></li>')
    for p in range(1, total_pages + 1):
        cls = ' class="active"' if p == current else ''
        items.append(f'<li{cls}><a href="{href_base}&amp;{page_param}={p}">{p}</a></li>')
    if current < total_pages:
        items.append(f'<li><a href="{href_base}&amp;{page_param}={total_pages}">»</a></li>')
    lis = '\n\t\t\t\t\t\t'.join(items)
    return (f'Showing items {first}-{last} of {total_items}<br>\n'
            f'\t\t\t\t\t<ul class="pagination">\n\t\t\t\t\t\t{lis}\n\t\t\t\t\t</ul>')


def sanitise(html):
    """Removes everything that would reach the network on its own (see the module docstring).

    Args:
        html: A saved page.

    Returns:
        The page without its doctype, scripts, `<link>`s, inline background
        images and jquery.sticky's inline wrapper height.
    """
    html = DOCTYPE_RE.sub('', html, count=1)
    html = SCRIPT_RE.sub('', html)
    html = LINK_RE.sub('', html)
    html = BG_IMAGE_RE.sub('', html)
    return STICKY_WRAPPER_STYLE_RE.sub(r'\1', html)


def build_plain(snapshot, stem):
    """Writes one sanitised page with no item cards (the bootleg landing page) as a single fixture.

    Args:
        snapshot: Repo-relative path of the saved page.
        stem: Repo-relative output path without the `-page1.html` suffix.

    Returns:
        A one-line summary for the console.
    """
    with open(os.path.join(ROOT, snapshot), encoding='utf-8') as fh:
        html = sanitise(fh.read())
    if CARD_OPEN in html:
        sys.exit(f'{snapshot}: has item cards, but is meant to be a page without them')
    note = (f'<!DOCTYPE html>\n<!-- Generated by scripts/build-sl-fixtures.py from {snapshot}: '
            'a page without item cards. Scripts, <link>s and inline background images removed; '
            'do not edit by hand. -->\n')
    out = os.path.join(ROOT, f'{stem}-page1.html')
    with open(out, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(note + html)
    return f'{snapshot}: no cards -> {stem}-page1.html (one page)'


def build(snapshot, stem, href_base, page_param, split):
    """Splits one snapshot into a two-page fixture pair (or keeps it whole) and writes the files.

    Args:
        snapshot: Repo-relative path of the saved list page.
        stem: Repo-relative output path without the `-pageN.html` suffix.
        href_base: The list URL the pagination links point at.
        page_param: The page parameter's name the pagination links carry.
        split: True to split into two pages with a rewritten widget; False
            to write the whole snapshot as one widget-less page.

    Returns:
        A one-line summary for the console.
    """
    with open(os.path.join(ROOT, snapshot), encoding='utf-8') as fh:
        html = sanitise(fh.read())

    start = html.index(CARD_OPEN)
    end = html.index('<hr>', html.rindex(CARD_OPEN))
    head, region, tail = html[:start], html[start:end], html[end:]
    cards = [c for c in region.split(SPACER) if CARD_OPEN in c]
    if len(cards) < 4:
        sys.exit(f'{snapshot}: found only {len(cards)} cards')
    if split and not PAGINATION_RE.search(tail):
        sys.exit(f'{snapshot}: no pagination widget after the cards')
    if not split and PAGINATION_RE.search(tail):
        sys.exit(f'{snapshot}: has a pagination widget, but is meant to be one page')

    half = (len(cards) + 1) // 2 if split else len(cards)
    pages = [cards[:half], cards[half:]] if split else [cards]
    total = len(cards)
    first = 1
    for idx, page_cards in enumerate(pages, start=1):
        last = first + len(page_cards) - 1
        body = SPACER.join(page_cards) + SPACER + '\n'
        new_tail = PAGINATION_RE.sub(
            lambda _m: pagination(href_base, page_param, idx, len(pages), first, last, total),
            tail, count=1) if split else tail
        # Most snapshots were saved without a doctype (a DOM serialization
        # drops it; a curl capture's own is stripped above, so there is never
        # two); the live site is Bootstrap 3, which needs standards mode.
        note = (f'<!DOCTYPE html>\n<!-- Generated by scripts/build-sl-fixtures.py from {snapshot}: '
                f'page {idx} of {len(pages)}, cards {first}-{last} of {total}. Scripts, <link>s '
                f'and inline background images removed; do not edit by hand. -->\n')
        out = os.path.join(ROOT, f'{stem}-page{idx}.html')
        with open(out, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(note + head + body + new_tail)
        first = last + 1
    if not split:
        return f'{snapshot}: {total} cards -> {stem}-page1.html (one page, no widget)'
    return f'{snapshot}: {total} cards -> {stem}-page1.html ({half}) + {stem}-page2.html ({total - half})'


def main():
    """Builds every fixture pair in TARGETS and every single page in PLAIN_TARGETS."""
    for snapshot, stem, href_base, page_param, split in TARGETS:
        print(build(snapshot, stem, href_base, page_param, split))
    for snapshot, stem in PLAIN_TARGETS:
        print(build_plain(snapshot, stem))


if __name__ == '__main__':
    main()
