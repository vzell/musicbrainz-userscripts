"""Build the discogs.com initial-page list fixtures
(tests/fixtures/dg-ip-{artist,master,label}.html) from the pages vzell saved
on 2026-10-26 (debug/discogs-{artist,master,label}-initial.html, with murdos'
importer and ShowAllEntityData 9.99.1464 installed).

What the specs read of them (org/discogs.org, 2026-10-26):

- Discogs' own list table in `#app`: its first ROWS rows, as React rendered
  them. Each row's first cell is a link around an `i.discogs.com` thumbnail
  (an artist's and a label's rows link the release or master; a master's
  rows link the master with `?image=…`, the version being the title cell's
  `/release/<id>`). `_DGP_FI` gives these the image card and viewer.
- On the label page, the artist names inside their wrapper span with the
  importer's icons (`span.link_… > .mb_wrapper > a.mb_search_link,
  a[href^="/artist/"]`): Discogs binds its own artist hover card to that
  span (`_dgArtistHoverHost()`).
- Discogs' own <h1> (the viewer's title) and `#app`.

Our own markup in the saved pages (`#mb-dg-root`, `#mb-dp-peek`, the
toolbar), scripts, styles and the zoom icons' SVG are dropped.

usage: python3 scripts/build-dg-ip-fixtures.py
"""
import os
import re
import sys

ROWS = 4
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'debug', 'discogs-{}-initial.html')
DST = os.path.join(ROOT, 'tests', 'fixtures', 'dg-ip-{}.html')
TITLES = {'artist': 'Bruce Springsteen', 'master': 'Bruce Springsteen – Greetings From Asbury Park N.J.', 'label': 'Columbia'}


def list_table(html):
    """Return the first <table> whose rows carry a "Cover of" thumbnail, cut to ROWS rows.

    @param html: The saved page.
    @return: The table's HTML.
    """
    i = html.find('alt="Cover of')
    if i < 0:
        sys.exit('no thumbnail row found')
    start = html.rfind('<table', 0, i)
    end = html.find('</table>', i) + len('</table>')
    table = html[start:end]
    body_at = table.find('<tbody')
    head, rest = table[:body_at], table[body_at:]
    rows = re.findall(r'<tr\b.*?</tr>', rest, re.S)
    if len(rows) < ROWS:
        sys.exit(f'only {len(rows)} rows')
    return head + '<tbody>' + ''.join(rows[:ROWS]) + '</tbody></table>'


def clean(html):
    """Drop the zoom icons' SVG, inline styles and our own leftovers.

    @param html: Markup.
    @return: Markup.
    """
    html = re.sub(r'<svg\b.*?</svg>', '', html, flags=re.S)
    html = re.sub(r'\sstyle="[^"]*"', '', html)
    html = re.sub(r'\sdata-mb-[a-z-]+="[^"]*"', '', html)
    return html


def build(kind):
    """Write one fixture.

    @param kind: 'artist', 'master' or 'label'.
    @return: None.
    """
    with open(SRC.format(kind), encoding='utf-8') as fh:
        html = fh.read()
    table = clean(list_table(html))
    doc = ('<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8">'
           f'<title>{TITLES[kind]} | Discogs</title></head><body>\n'
           '<div id="__header_root_1"><header class="dg-fx-header"></header></div>\n'
           f'<div id="app"><div id="page"><main><h1>{TITLES[kind]}</h1>\n{table}\n</main></div></div>\n'
           '<div id="esi-footer-root"></div>\n</body></html>\n')
    with open(DST.format(kind), 'w', encoding='utf-8') as fh:
        fh.write(doc)
    print(f'{DST.format(kind)}: {len(doc)} bytes')


if __name__ == '__main__':
    for k in ('artist', 'master', 'label'):
        build(k)
