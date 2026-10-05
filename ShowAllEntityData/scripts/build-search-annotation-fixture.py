#!/usr/bin/env python3
"""Build tests/fixtures/search-annotation-tooltip.html from the live page.

Fetches the raw (pre-userscript) annotation search page

    https://musicbrainz.org/search?query=Barcode+and+other+i&type=annotation&limit=25&method=indexed

and trims it to a single, unpaginated page of four Release rows chosen for
the artwork-tooltip spec (tests/fixtures/search-annotation-tooltip.spec.js):

  * 13bcbdc0 "If I Were the Boss"  - two paragraphs, several <br> (real)
  * 202c3b35 "Tunnel of Love"      - a wiki <h2> sub-section, which the
                                     userscript collapses by default (real)
  * ae58eef4 "Romeo and Juliet"    - HAND-SHAPED: the word "Discogs" is
                                     wrapped in the annotation's only link
  * 0d22b816 "Super Best"          - HAND-SHAPED: 80 extra paragraphs, so the
                                     tooltip must be cut to the viewport

The pagination <nav>s are removed (so the fetch stays on one page) and the
"Found N results" line is set to the row count. MusicBrainz's public
MAPBOX_ACCESS_TOKEN is replaced with "REDACTED", as in the other fixtures:
GitHub push protection rejects any commit that contains it.

Usage:  python3 scripts/build-search-annotation-fixture.py [--from FILE]
        --from reads an already-saved copy of the page instead of fetching.
"""

import re
import sys
import urllib.request
from pathlib import Path

URL = ('https://musicbrainz.org/search?query=Barcode+and+other+i'
       '&type=annotation&limit=25&method=indexed')
OUT = Path(__file__).resolve().parent.parent / 'tests' / 'fixtures' / 'search-annotation-tooltip.html'
KEEP = ['13bcbdc0', '202c3b35', 'ae58eef4', '0d22b816']


def fetch():
    """Return the page HTML, from --from FILE or the network."""
    if len(sys.argv) == 3 and sys.argv[1] == '--from':
        return Path(sys.argv[2]).read_text(encoding='utf-8')
    req = urllib.request.Request(URL, headers={'User-Agent': 'ShowAllEntityData-fixture-builder/1.0'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode('utf-8')


def shape(prefix, row):
    """Apply the documented hand-shaping to one row."""
    if prefix == 'ae58eef4':
        new = row.replace('found on Discogs is',
                          'found on <a href="https://www.discogs.com/release/1" rel="nofollow">Discogs</a> is', 1)
        assert new != row, 'Romeo and Juliet: "found on Discogs is" not found'
        return new
    if prefix == '0d22b816':
        extra = ''.join('<p><bdi>Liner note line %d of the long annotation.<br /></bdi></p>' % i
                        for i in range(1, 81))
        new = row.replace('</td></tr>', extra + '</td></tr>', 1)
        assert new != row
        return new
    return row


def main():
    """Fetch, trim, shape and write the fixture."""
    html = fetch()
    rows = re.findall(r'<tr class="(?:odd|even)" data-score="\d+">.*?</tr>', html, re.S)
    picked = []
    for prefix in KEEP:
        hits = [r for r in rows if 'href="/release/' + prefix in r]
        assert hits, 'row %s not on the page any more' % prefix
        picked.append(shape(prefix, hits[0]))
    picked = [re.sub(r'class="(?:odd|even)"', 'class="%s"' % ('odd' if i % 2 == 0 else 'even'), r, count=1)
              for i, r in enumerate(picked)]

    html, n_nav = re.subn(r'<nav><ul class="pagination">.*?</nav>', '', html, flags=re.S)
    assert n_nav == 2, 'expected two pagination navs, found %d' % n_nav
    html, n_body = re.subn(r'(<table class="tbl">.*?<tbody>).*?(</tbody>)',
                           lambda m: m.group(1) + ''.join(picked) + m.group(2), html, count=1, flags=re.S)
    assert n_body == 1
    html = re.sub(r'Found [\d,]+ results', 'Found %d results' % len(picked), html, count=1)
    html, n_tok = re.subn(r'"MAPBOX_ACCESS_TOKEN":"[^"]*"', '"MAPBOX_ACCESS_TOKEN":"REDACTED"', html)
    assert n_tok <= 1
    assert 'pk.ey' not in html, 'a Mapbox token survived the redaction'

    OUT.write_text(html, encoding='utf-8')
    print('wrote %s (%d rows, %d bytes)' % (OUT, len(picked), len(html)))


if __name__ == '__main__':
    main()
