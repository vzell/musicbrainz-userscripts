#!/usr/bin/env python3
"""Prepares the captured editor pages for commit (2026-10-21).

    python3 scripts/anonymize-user-fixtures.py <capture-dir>

<capture-dir> holds the pages saved by
`node scripts/fetch-mb-page-fixture.js --auth <path> <capture-dir>/<name>.html`
(names below). They are copied to tests/fixtures/ with:

  - subscribers.html: every subscriber's name (link and text) replaced by
    editor-1, editor-2, ... in page order, so the fixture keeps the page's
    structure without saying who follows whose edits (decided 2026-10-21);
  - applications.html: every cell of the "Developer applications" table
    after the first blanked (the OAuth Client ID and Secret live there; the
    capture has no such table, but a later re-capture might);
  - every page: fails if a Mapbox token (pk./sk.eyJ...) is left.

The editor's own tags and ratings pages (tags, ratings) are copied unchanged.
The edit lists (rejected, open, votes, search-type) are copied unchanged:
like the committed edits-page-*.html they name other editors and quote
their notes, as musicbrainz.org shows them to every logged-in reader (the
user agreed, org/mb-edit-history.org, answer 6).
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tests', 'fixtures')

# capture name -> fixture name
FILES = {
    'rejected.html': 'edits-page-user-vzell-rejected.html',
    'open.html': 'edits-page-user-vzell-open.html',
    'votes.html': 'edits-page-user-vzell-votes.html',
    'search-type.html': 'edits-page-search-type.html',
    'subscribers.html': 'subscribers-page-vzell.html',
    'applications.html': 'applications-page-vzell.html',
    # The editor's own tags and ratings (9.99.1408): their own data, unchanged.
    'tags.html': 'user-tags-page-vzell.html',
    'ratings.html': 'user-ratings-page-vzell.html',
}

OWNER = 'vzell'


def anonymize_subscribers(html):
    """Replaces every subscriber's name in the list under h2 "Subscribers"."""
    m = re.search(r'<h2>Subscribers</h2>.*?</ul>', html, re.S)
    if not m:
        raise SystemExit('subscribers.html: no "Subscribers" list')
    block = m.group(0)
    names = []
    for n in re.findall(r'<a href="/user/([^"/?#]+)"', block):
        if n != OWNER and n not in names:
            names.append(n)
    for i, n in enumerate(names, 1):
        alias = f'editor-{i}'
        block = block.replace(f'href="/user/{n}"', f'href="/user/{alias}"')
        block = block.replace(f'<bdi>{n}</bdi>', f'<bdi>{alias}</bdi>')
    for n in names:
        if n in block:
            raise SystemExit(f'subscribers.html: a name is left after anonymizing ({len(names)} names)')
    print(f'  subscribers: {len(names)} names replaced')
    return html[:m.start()] + block + html[m.end():]


def blank_developer_apps(html):
    """Blanks every cell but the first of each Developer applications row."""
    m = re.search(r'<h2>Developer applications</h2>(.*?)(?=<h2>|$)', html, re.S)
    if not m:
        return html
    sec = m.group(1)

    def row(rm):
        cells = re.findall(r'<td[^>]*>.*?</td>', rm.group(0), re.S)
        if not cells:
            return rm.group(0)
        return '<tr>' + cells[0] + ''.join('<td></td>' for _ in cells[1:]) + '</tr>'

    new = re.sub(r'<tr[^>]*>.*?</tr>', lambda rm: row(rm) if '<td' in rm.group(0) else rm.group(0), sec, flags=re.S)
    if new != sec:
        print('  applications: developer application cells blanked')
    return html[:m.start(1)] + new + html[m.end(1):]


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    src = sys.argv[1]
    for cap, fix in FILES.items():
        with open(os.path.join(src, cap), encoding='utf-8') as f:
            html = f.read()
        if cap == 'subscribers.html':
            html = anonymize_subscribers(html)
        if cap == 'applications.html':
            html = blank_developer_apps(html)
        if re.search(r'\b[ps]k\.eyJ', html):
            raise SystemExit(f'{cap}: a Mapbox token is left')
        with open(os.path.join(OUT, fix), 'w', encoding='utf-8') as f:
            f.write(html)
        print(f'wrote tests/fixtures/{fix} ({len(html)} chars)')


if __name__ == '__main__':
    main()
