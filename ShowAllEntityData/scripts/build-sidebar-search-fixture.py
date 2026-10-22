"""Build tests/fixtures/release-tracks-sidebar-search-links.html.

The source is debug/DaD-ISRC-Links-initial.html: Devils & Dust (bootleg, PROF
Records, release 6336b8db-ac72-4afa-a954-94b437b49abc), saved from the browser
with jesus2099's "mb. ALL LINKS" active, so its sidebar carries the script's
nested search lists ("Search the web", "Search in the whitelist", "Search
further") that sidebar-search-card.spec.js needs.

It was saved AFTER ShowAllEntityData had put its toolbar into the h1 (no
button pressed yet). Loaded as a fixture, the script injects its toolbar
again, and the saved copy's buttons, with no listeners, come first in the
document: a test clicking "Show all Tracks for Release" clicked a dead one.
So everything of ours is removed: the saved toolbar
(#mb-show-all-controls-container and everything in it), the status display
(#mb-status-sentinel, #mb-status-displays-container: a second copy of an id
the script looks up), and the stamps our first pass left (data-mb-rg-link on
the release-group link, .mb-vsb-head / data-mb-vsb-head on the header).
Every other script's markup stays: it is what the page looked like.

Usage: python3 scripts/build-sidebar-search-fixture.py
"""
import io
import re
import sys

SRC = 'debug/DaD-ISRC-Links-initial.html'
OUT = 'tests/fixtures/release-tracks-sidebar-search-links.html'
REMOVE_IDS = ['mb-show-all-controls-container', 'mb-status-sentinel', 'mb-status-displays-container']


def remove_element(html, el_id):
    """Removes the element with this id and its whole subtree (balanced tags of its own name)."""
    m = re.search(r'<([a-zA-Z0-9]+)\b[^>]*\bid="%s"[^>]*>' % re.escape(el_id), html)
    if not m:
        sys.exit('not found: #%s' % el_id)
    tag = m.group(1).lower()
    depth = 1
    pos = m.end()
    pat = re.compile(r'<(/?)%s\b[^>]*>' % tag, re.I)
    while depth:
        t = pat.search(html, pos)
        if not t:
            sys.exit('unbalanced: #%s' % el_id)
        depth += -1 if t.group(1) else 1
        pos = t.end()
    return html[:m.start()] + html[pos:], pos - m.start()


html = io.open(SRC, encoding='utf-8').read()
for el_id in REMOVE_IDS:
    html, n = remove_element(html, el_id)
    print('removed #%s (%d characters)' % (el_id, n))
html, n1 = re.subn(r' data-mb-rg-link="[^"]*"', '', html)
html, n2 = re.subn(r' data-mb-vsb-head="[^"]*"', '', html)
html, n3 = re.subn(r'(class="[^"]*?) mb-vsb-head"', r'\1"', html)
print('stripped stamps: %d data-mb-rg-link, %d data-mb-vsb-head, %d .mb-vsb-head' % (n1, n2, n3))
left = re.findall(r'data-label="Show all[^"]*"', html)
left += re.findall(r'id="mb-status-[a-z-]*"|mb-vsb-head|data-mb-rg-link', html)
if left:
    sys.exit('a saved toolbar button is still there: %s' % left[:3])
if html.count('jesus2099_all-links_searchLinks') < 100:
    sys.exit('the search lists are missing')
io.open(OUT, 'w', encoding='utf-8', newline='').write(html)
print('wrote %s (%d bytes)' % (OUT, len(html.encode('utf-8'))))
