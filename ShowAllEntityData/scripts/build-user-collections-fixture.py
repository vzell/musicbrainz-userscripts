#!/usr/bin/env python3
"""Build tests/fixtures/user-collections-collaborative.html from a saved #page.

The source is vzell's IP of /user/ApeKattQuest%2C%20MonkeyPython/collections
(2026-10-26, uploaded as "collections-collaborative-initial.html"): the page's
`<div id="page">` as the browser held it, with this userscript's toolbar and
status line already injected into the h1. Those are removed (they are what the
script adds, so the fixture must not already carry them), and the rest is
wrapped in a minimal MusicBrainz document. The native content, two h2
sections of h3 + table.tbl pairs, is kept byte for byte.

Usage: python3 -I scripts/build-user-collections-fixture.py <source.html>
"""
import re
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'tests' / 'fixtures' / 'user-collections-collaborative.html'


def strip_injected(html):
    """Remove the userscript's own markup from the saved page.

    @param {str} html - the saved `#page` markup
    @returns {str} the native markup
    """
    # The toolbar sits inside the h1, after the editor link, up to </h1>.
    html, n1 = re.subn(r'<div id="mb-show-all-controls-container".*?</h1>', '</h1>', html, count=1, flags=re.S)
    # The status line is one div right after the h1, ending before the tabs.
    html, n2 = re.subn(r'<div id="mb-status-displays-wrapper".*?(?=<div class="tabs">)', '', html, count=1, flags=re.S)
    if n1 != 1 or n2 != 1:
        sys.exit(f'unexpected source shape (toolbar {n1}, status {n2})')
    html = html.replace(' class="mb-vsb-head" data-mb-vsb-head="0"', '')
    if 'mb-' in re.sub(r'<bdi>.*?</bdi>', '', html):
        sys.exit('userscript markup left in the page')
    return html


def main():
    """Read the source, strip it, wrap it and write the fixture."""
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    page = strip_injected(Path(sys.argv[1]).read_text(encoding='utf-8-sig').strip())
    doc = ('<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8">'
           '<title>Editor “ApeKattQuest, MonkeyPython” - Collections - MusicBrainz</title></head>\n'
           '<body>\n<div class="layout"><div id="header"></div>\n'
           + page + '\n</div>\n</body></html>\n')
    OUT.write_text(doc, encoding='utf-8')
    print(f'wrote {OUT.relative_to(OUT.parents[2])}')


if __name__ == '__main__':
    main()
