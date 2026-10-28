#!/usr/bin/env python3
"""Builds tests/fixtures/detail-bb-gig-2026-10-03.html for youtube-embeds.spec.js.

Input: debug/bb-event-youtube.html, vzell's browser snapshot (2026-10-25) of
brucebase.wikidot.com/gig:2026-10-03-merriweather-post-pavilion-columbia-md —
only its `#main-content` element, which holds what `_dpParseBbPage()` reads
(`#page-title`, `#page-content`). Its Media tab is one YouTube playlist
iframe (`embed/videoseries?si=…&list=PLTejJhB5zqTA`), its Recording tab a
prose link to a video that is "no longer available" (MLnTqKksftM).
org/youtube.org Step 4.

Unlike scripts/build-detail-fixtures.py, the YouTube iframes are KEPT (they
are what the spec is about); every other iframe, every <script>, <noscript>
and <link> is removed, and the snapshot is wrapped in a minimal document so
the preview's DOMParser sees a page. The iframe never loads in a spec: the
page is parsed by the preview, never shown.

    python3 scripts/build-bb-youtube-gig-fixture.py
"""

import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'debug', 'bb-event-youtube.html')
OUT = os.path.join(ROOT, 'tests', 'fixtures', 'detail-bb-gig-2026-10-03.html')


def strip(html):
    """Removes scripts, noscripts, links and every non-YouTube iframe."""
    html = re.sub(r'<script\b.*?</script>', '', html, flags=re.S | re.I)
    html = re.sub(r'<noscript\b.*?</noscript>', '', html, flags=re.S | re.I)
    html = re.sub(r'<link\b[^>]*>', '', html, flags=re.I)

    def iframe(m):
        return m.group(0) if re.search(r'youtube(?:-nocookie)?\.com/embed/', m.group(0), re.I) else ''

    return re.sub(r'<iframe\b.*?</iframe>', iframe, html, flags=re.S | re.I)


def main():
    """Reads the snapshot, cleans and wraps it, writes the fixture."""
    if not os.path.exists(SRC):
        sys.exit(f'missing {SRC} (a local, gitignored snapshot)')
    with open(SRC, encoding='utf-8-sig') as fh:
        body = strip(fh.read())
    if 'id="page-content"' not in body or 'videoseries' not in body:
        sys.exit('snapshot lacks #page-content or the Media playlist')
    doc = ('<!DOCTYPE html>\n<html><head><meta charset="utf-8">'
           '<title>2026-10-03 Merriweather Post Pavilion, Columbia, MD - Brucebase Wiki</title></head>'
           '<body><div id="container-wrap"><div id="container"><div id="content-wrap">\n'
           + body.strip() + '\n</div></div></div></body></html>\n')
    with open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(doc)
    print(f'wrote {os.path.relpath(OUT, ROOT)} ({len(doc)} bytes, '
          f'{len(re.findall(r"<iframe", doc))} iframe(s))')


if __name__ == '__main__':
    main()
