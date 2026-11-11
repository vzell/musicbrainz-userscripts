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

And for bb-song / bb-ott (Phase 3):

- song "The Promise": Credits (two releases, a note under a person),
  Performances with the breakdown by tour, Multiples, Released on Album,
  Released as Live Download, On The Tracks, Lyrics, Media, Links;
- song "We Gotta Get Out Of This Place": Performances, Snippets, Live
  downloads, no credits;
- On The Tracks page "Do You Want Me To Say Alright": nine takes, one
  "uncirculating".

And for bb-venue / bb-relation (Phase 4):

- venue Roxy Theatre: Performances, Appearances, Gallery, Streetview;
- Patti Scialfa, pages 1-3 (fetched from the live site together on
  2026-11-11T15:26+01:00, a scratch curl kept in debug/bb-mirror/pick/
  as relation_patti-scialfa_live-pN.html, so the three pages agree): three
  columns of shows, two of them paged (2 and 3 pages), Recording, Bands,
  News;
- Anders Goman: one performance; Malurt: a band with Members.

And for bb-retail / bb-bootleg (Phase 5; main pages copied to
debug/bb-mirror/retail-main/ and playlist-main/, the subpages left out):

- release "Born To Run": one edition, the facts and their footnotes,
  Personnel (Bruce, then the band), History, Media, Related Releases, On
  The Tracks (63 takes, "V2 - take 14"), Performance, Lyrics' links;
- release "Live/1975-85": one edition in four tables (discs), Recording
  'Live' Dates by disc with footnotes;
- release "The Promise (Boxset)": two editions, the video one's tables cut
  into parts by one-cell heading rows (the Blu-ray films);
- playlist "Songs Of Love": the playlist layout (Recording 'Live' Dates);
- bootlegs: "The River Outtakes" (facts, "Disc 1: (43:31)", one note under
  both discs), "Criminals And Artists" (sides marked "//"), "Definitive
  Remastered Darkness Outtakes" (numbered lines, "Disc 1"), "The Born To Run
  Outtakes" (two lines of its own, no facts).

A song's lyrics are blanked word by word ("la"), as
scripts/build-detail-fixtures.py does (its `blank_lyrics()`, imported).

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
    ('song/song_the-promise.html', 'bb-song-the-promise.html'),
    ('song/song_we-gotta-get-out-of-this-place.html', 'bb-song-we-gotta-get-out-of-this-place.html'),
    ('ott/ott_do-you-want-me-to-say-alright.html', 'bb-ott-do-you-want-me-to-say-alright.html'),
    ('pick/venue_roxy-theatre-west-hollywood-ca.html', 'bb-venue-roxy-theatre.html'),
    ('pick/relation_patti-scialfa_live-p1.html', 'bb-relation-patti-scialfa-p1.html'),
    ('pick/relation_patti-scialfa_live-p2.html', 'bb-relation-patti-scialfa-p2.html'),
    ('pick/relation_patti-scialfa_live-p3.html', 'bb-relation-patti-scialfa-p3.html'),
    ('relation/relation_anders-goman.html', 'bb-relation-anders-goman.html'),
    ('relation/relation_malurt.html', 'bb-relation-malurt.html'),
    ('retail-main/retail_born-to-run.html', 'bb-retail-born-to-run.html'),
    ('retail-main/retail_live-1975-85.html', 'bb-retail-live-1975-85.html'),
    ('retail-main/retail_the-promise-boxset.html', 'bb-retail-the-promise-boxset.html'),
    ('playlist-main/playlist_songs-of-love.html', 'bb-playlist-songs-of-love.html'),
    ('bootleg/bootleg_river-outtakes-wrr.html', 'bb-bootleg-river-outtakes-wrr.html'),
    ('bootleg/bootleg_criminals-and-artists.html', 'bb-bootleg-criminals-and-artists.html'),
    ('bootleg/bootleg_definitive-remastered-darkness-outtakes-gfr.html', 'bb-bootleg-definitive-remastered-darkness-outtakes-gfr.html'),
    ('bootleg/bootleg_born-to-run-outtakes.html', 'bb-bootleg-born-to-run-outtakes.html'),
]


def _blank_lyrics():
    """scripts/build-detail-fixtures.py's `blank_lyrics()` (a hyphenated module name)."""
    import importlib.util
    spec = importlib.util.spec_from_file_location('build_detail_fixtures', os.path.join(HERE, 'build-detail-fixtures.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.blank_lyrics


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
        if 'id="page-content"' not in html or ('yui-navset' not in html and not out.startswith('bb-ott-')):
            sys.exit(f'{src}: no #page-content or tabview')
        if out.startswith('bb-song-'):
            html, blanked = _blank_lyrics()(html, 'bb-song')
            if not blanked and '>Lyrics</em>' in html:
                sys.exit(f'{src}: a Lyrics tab, but its lyrics were not blanked')
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
