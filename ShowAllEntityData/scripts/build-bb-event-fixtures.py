#!/usr/bin/env python3
"""Build the bb-event fixtures (tests/fixtures/bb-event-*.html).

Input: the local sample of the BruceParser mirror, debug/bb-mirror/<cat>/
(scripts/sample-bb-mirror.py; the Roxy gig in debug/bb-mirror/pick/), pages
as the server sent them (curl, 2026-10-18). One page per kind of event, each
picked for a shape the bb-event pageType reads (org/brucebase.org, Plan
2026-11-11, Phase 2):

- gig 1978-07-07 Roxy Theatre: setlist with segues and premieres (no set
  labels), a band in On Stage, Performances and Appearances, a Recording tab
  with official releases, bootlegs and their labels and a live download,
  Storyteller, Eyewitness, News/Memorabilia, two YouTube playlists;
- gig 2005-06-20 Paris: "Soundcheck" and "Show" set labels;
- recording 1979-04-09 Power Station: an "In Studio" tab;
- rehearsal 2009-01-29a Tampa;
- interview 2021-04-28 SiriusXM: In Studio, Playlist, "From My Home To
  Yours";
- nogig 2013-04-16 Richard Rodgers Theatre: no setlist, an Appearances list.

Every <script>, <noscript>, theme @import and non-YouTube <iframe> is
removed (as scripts/build-bb-fixtures.py and build-bb-youtube-gig-fixture.py
do); the YouTube iframes stay, the preview reads them. A page not on the
machine is skipped and its fixture kept.

    python3 scripts/build-bb-event-fixtures.py
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'debug', 'bb-mirror')
OUT = os.path.join(ROOT, 'tests', 'fixtures')

PAGES = [
    ('pick/gig_1978-07-07-roxy-theatre-west-hollywood-ca.html', 'bb-event-gig-1978-07-07.html'),
    ('gig/gig_2005-06-20-palais-omnisports-paris-france.html', 'bb-event-gig-2005-06-20.html'),
    ('recording/recording_1979-04-09-power-station-new-york-city-ny.html', 'bb-event-recording-1979-04-09.html'),
    ('rehearsal/rehearsal_2009-01-29a-raymond-james-stadium-tampa-fl.html', 'bb-event-rehearsal-2009-01-29a.html'),
    ('interview/interview_2021-04-28-siriusxm-studio-new-york-city-ny.html', 'bb-event-interview-2021-04-28.html'),
    ('nogig/nogig_2013-04-16-richard-rodgers-theatre-new-york-city-ny.html', 'bb-event-nogig-2013-04-16.html'),
]

IMPORT_RE = re.compile(r'^[ \t]*@import url\([^)]*\);[ \t]*\n', re.M)


def strip(html):
    """Remove scripts, noscripts, theme imports and every non-YouTube iframe."""
    html = re.sub(r'<script\b.*?</script>', '', html, flags=re.S | re.I)
    html = re.sub(r'<noscript\b.*?</noscript>', '', html, flags=re.S | re.I)
    html = IMPORT_RE.sub('', html)

    def iframe(m):
        """Keep a YouTube player, drop any other frame."""
        return m.group(0) if re.search(r'youtube(?:-nocookie)?\.com/embed/', m.group(0), re.I) else ''

    return re.sub(r'<iframe\b.*?</iframe>', iframe, html, flags=re.S | re.I)


def main():
    """Write each fixture whose source page is on the machine."""
    wrote = 0
    for src, out in PAGES:
        path = os.path.join(SRC, src)
        if not os.path.exists(path):
            print(f'skip {out}: {os.path.relpath(path, ROOT)} not on this machine (run scripts/sample-bb-mirror.py)')
            continue
        with open(path, encoding='utf-8', errors='replace') as fh:
            html = strip(fh.read())
        if 'id="page-content"' not in html or 'yui-navset' not in html:
            sys.exit(f'{src}: no #page-content or tabview')
        note = ('<!-- Built by scripts/build-bb-event-fixtures.py from the BruceParser mirror (2026-10-18); '
                'scripts, noscripts, theme @imports and non-YouTube iframes removed; do not edit by hand. -->\n')
        html = re.sub(r'(<!DOCTYPE[^>]*>\s*)', lambda m: m.group(1) + note, html, count=1, flags=re.I)
        target = os.path.join(OUT, out)
        with open(target, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(html)
        wrote += 1
        print(f'wrote {os.path.relpath(target, ROOT)} ({len(html)} bytes)')
    print(f'{wrote} of {len(PAGES)} fixtures written')
    return 0


if __name__ == '__main__':
    sys.exit(main())
