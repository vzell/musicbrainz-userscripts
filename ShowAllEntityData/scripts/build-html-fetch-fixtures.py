#!/usr/bin/env python3
"""Builds the two page-shell fixtures used by tests/fixtures/html-fetch-transient.spec.js.

That spec is about the HTML PAGINATION path (org/503-handling.org F1-F3): what
happens when `fetchHtml()` meets a 503 part-way through a multi-page fetch, when
`fetchMaxPageGeneric()` cannot read the page count, and when the
artist-releasegroups official-headers pre-fetch pass stops short.

All three need a page whose pagination widget says there is more than one page,
because `determineMaxPageFromDOM()` and `fetchMaxPageGeneric()` both read that
widget. The committed snapshots already have real ones -- artist-events says 42
pages, artist-releasegroups says 22 -- but a fixture route serves the same shell
for EVERY page, so honouring those counts would mean 42 (and 22 + 22) parses of a
quarter-megabyte document per test. That is minutes of wall clock to exercise a
retry that happens on page 2.

So the shells are taken VERBATIM from the committed snapshots and only the
pagination `<ul>` is rewritten, to `PAGES` pages. Everything the script reads --
the table shape, the headings, the button-injection anchors, the embedded JSON --
stays exactly as MusicBrainz served it. Hand-building a page shell instead would
have put this spec's outcome at the mercy of how well the hand-built markup
imitated the real thing, which is the one thing a fixture must not be.

Re-run after re-capturing either snapshot:

    python3 scripts/build-html-fetch-fixtures.py
"""

import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Three is the smallest count that still distinguishes the cases that matter: a
# failure on page 2 has both a page before it (rows that must survive) and a page
# after it (which must NOT be fetched, because the loop stops at the first
# failure -- see org/503-handling.org open question 4).
PAGES = 3

TARGETS = [
    ('tests/snapshots/artist-events/raw.html',
     'tests/fixtures/html-fetch-transient-events.html'),
    ('tests/snapshots/artist-releasegroups/raw.html',
     'tests/fixtures/html-fetch-transient-rg.html'),
]

PAGINATION_RE = re.compile(r'<ul class="pagination">.*?</ul>', re.S)

# `&amp;` and not just `&`: artist-releasegroups' links carry two query
# parameters before `page`, so MusicBrainz escapes the separators
# (`...?all=1&amp;va=0&amp;page=1`). Matching a bare `&` finds nothing there and
# the build fails with a misleading "no paginated href" -- which it did.
_SEP = r'(?:\?|&amp;|&)'
HREF_RE = re.compile(r'href="([^"]*?' + _SEP + r'page=\d+[^"]*)"')


def base_href(block):
    """Returns one pagination href with its `page=` value stripped to a format slot.

    Derived from the snapshot's own links rather than rebuilt from the URL, so
    every other query parameter MusicBrainz put there (`all`, `va`, ...) is
    carried through untouched -- those are exactly what the artist-releasegroups
    pre-fetch pass keys its two passes off.
    """
    m = HREF_RE.search(block)
    if not m:
        raise SystemExit('no paginated href found in the pagination block')
    return re.sub(r'(' + _SEP + r')page=\d+', r'\1page={page}', m.group(1))


def build_widget(href_tmpl, pages):
    """Rebuilds the widget in MusicBrainz's own shape, with no ellipsis.

    The ellipsis matters: `_hasAmbiguousEditsPagination()` treats one as "this
    listing never reveals a real last page" on unboundedPagination pageTypes, and
    that path pops a blocking confirm dialog. Neither pageType here is in that
    family, but emitting a complete gap-free widget keeps the fixture out of the
    question entirely.
    """
    items = ['<li><span>Previous</span></li>', '<li class="separator"></li>']
    for p in range(1, pages + 1):
        href = href_tmpl.format(page=p)
        if p == 1:
            items.append('<li><a class="sel" href="%s"><strong>1</strong></a></li>' % href)
        else:
            items.append('<li><a href="%s">%d</a></li>' % (href, p))
    items.append('<li class="separator"></li>')
    items.append('<li><a href="%s">Next</a></li>' % href_tmpl.format(page=2))
    return '<ul class="pagination">%s</ul>' % ''.join(items)


def main():
    for src_rel, dst_rel in TARGETS:
        src = os.path.join(ROOT, src_rel)
        dst = os.path.join(ROOT, dst_rel)
        html = io.open(src, encoding='utf-8').read()

        blocks = PAGINATION_RE.findall(html)
        if not blocks:
            raise SystemExit('%s: no pagination widget -- cannot build %s' % (src_rel, dst_rel))

        widget = build_widget(base_href(blocks[0]), PAGES)
        out = PAGINATION_RE.sub(lambda _m: widget, html)

        io.open(dst, 'w', encoding='utf-8').write(out)
        print('%s -> %s  (%d pagination widget(s) rewritten to %d pages, %d bytes)'
              % (src_rel, dst_rel, len(blocks), PAGES, len(out)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
