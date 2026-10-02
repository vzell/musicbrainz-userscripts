#!/usr/bin/env python3
"""Builds the two fixtures of tests/fixtures/uvd-recording-comments.spec.js.

1. tests/fixtures/artist-recordings-comments.html — an artist "Recordings"
   page (Name, Length, Artist, Release groups, Rating), one row per case
   _parseRecordingComment() distinguishes (org/recordings-UVD.org). Comment
   shapes are real ones from debug/Recording-Bruce-initial.html
   ("live, 2004‐10‐02: Gund Arena, Cleveland, OH, USA", a bare "live",
   "rehearsal, 1978‐05‐19: …", "alternate take") plus one per form and near
   miss the snapshot lacks: "live, 2002", "live, Los Angeles, CA, USA"
   (both from https://musicbrainz.org/doc/Style/Recording#Live_recordings),
   "; intro", "/23", a plain "-", a capital "Live", a missing ", " and
   ": ", an impossible date, a date with no type.

2. tests/fixtures/release-tracks-comment-dates.html — the committed
   tests/fixtures/release-tracks-live-date-flags.html (a real live release,
   every track "recording of" a work "on 1999-04-11"), with a recording
   comment injected after nine tracks' recording link, and one track's
   "(on 1999-04-11)" removed, so "Recording date" vs comment date covers:
   equal, different, less precise, comment without a date, recording without
   a date, an impossible date and a near miss.

Usage: python3 scripts/build-recording-comments-fixture.py
"""

import html
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent.parent
FIX = HERE / 'tests' / 'fixtures'

# (title, comment or None)
RECORDINGS = [
    ('“Vote for Change” Finale', 'live, 2004‐10‐02: Gund Arena, Cleveland, OH, USA'),
    ('Thunder Road', 'live, 2008‐12‐17, early show: Mellon Arena, Pittsburgh, PA, USA'),
    ('Born to Run', 'live, 1975-08-13: The Bottom Line, New York City, NY, USA'),
    ('Spirit in the Night', 'live, 1975‐08-15: The Bottom Line, New York City, NY, USA'),
    ('Dancing in the Dark', 'live, 2025‐05: dock10 Studios, Manchester, England, UK'),
    ('Prove It All Night', 'live, 1978‐07‐07: The Roxy, West Hollywood, USA'),
    ('Rosalita', 'live, 1975‐13‐05: The Main Point, Bryn Mawr, PA, USA'),
    ('Kitty’s Back', 'live, 05.02.1975: The Main Point, Bryn Mawr, PA, USA'),
    ('Jungleland', 'live 2004‐10‐02: Gund Arena, Cleveland, OH, USA'),
    ('Badlands', 'Live, 2004‐10‐03: Gund Arena, Cleveland, OH, USA'),
    ('The River', 'live'),
    ('Atlantic City', 'live, 2002'),
    ('Johnny 99', 'live, Los Angeles, CA, USA'),
    ('Racing in the Street', 'live, early show'),
    ('Promised Land', 'soundcheck, 2016‐08‐30: MetLife Stadium, East Rutherford, NJ, USA; intro'),
    ('Something in the Night', 'rehearsal, 1978‐05‐19: Paramount Theatre, Asbury Park, NJ, USA'),
    ('Santa Claus Is Comin’ to Town', 'live, 2001‐12‐22/23: Convention Hall, Asbury Park, NJ, USA'),
    ('Darlington County', '2004‐10‐02: Gund Arena, Cleveland, OH, USA'),
    ('Fire', 'alternate take'),
    ('Because the Night', None),
    ('Lucky Town', 'live, 2004‐10‐02, Gund Arena, Cleveland, OH, USA'),
    ('Cover Me', 'live, 1985‐07‐07: Roskilde Festival, Roskilde, Denmark'),
]

# release-tracks: track title -> (comment, drop the "(on …)" date?)
TRACKS = {
    'Rendezvous': ('live, 1999‐04‐11: Palau Sant Jordi, Barcelona, Catalonia, Spain', False),
    'The Promised Land': ('live, 1999‐04‐12: Palau Sant Jordi, Barcelona, Catalonia, Spain', False),
    'Two Hearts': ('live, 1999‐04: Palau Sant Jordi, Barcelona, Catalonia, Spain', False),
    'Prove It All Night': ('live', False),
    'Darkness on the Edge of Town': ('live, 1999-04-11: Palau Sant Jordi, Barcelona, Spain', False),
    'Mansion on the Hill': ('live, 1999‐04‐11: Palau Sant Jordi, Barcelona, Catalonia, Spain; acoustic', False),
    'The River': ('live, 1999‐13‐11: Palau Sant Jordi, Barcelona, Catalonia, Spain', False),
    'Youngstown': ('live 1999‐04‐11: Palau Sant Jordi, Barcelona, Catalonia, Spain', False),
    'Badlands': ('live, 1999‐04‐11: Palau Sant Jordi, Barcelona, Catalonia, Spain', True),
}


def comment_span(text):
    """MusicBrainz's own comment markup, parentheses outside the <bdi>."""
    return f' <span class="comment">(<bdi>{html.escape(text, quote=False)}</bdi>)</span>'


def build_recordings():
    """Writes the artist-recordings fixture."""
    rows = []
    for i, (title, comment) in enumerate(RECORDINGS, 1):
        mbid = f'cccccccc-0000-4000-8000-{i:012d}'
        com = comment_span(comment) if comment else ''
        rows.append(
            '                <tr>\n'
            f'                    <td class="title wrap-anywhere"><a href="/recording/{mbid}"><bdi>{html.escape(title, quote=False)}</bdi></a>{com}</td>\n'
            f'                    <td>{3 + i % 4}:{(i * 7) % 60:02d}</td>\n'
            '                    <td><a href="/artist/70248960-cb53-4ea4-943a-edb18f7d336f"><bdi>Bruce Springsteen</bdi></a></td>\n'
            '                    <td></td>\n'
            '                    <td></td>\n'
            '                </tr>\n')
    out = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Bruce Springsteen - Recordings - MusicBrainz</title>
</head>
<body>
    <!-- Generated by scripts/build-recording-comments-fixture.py; edit that, not this. -->
    <div id="content">
        <div class="artistheader">
            <h1><bdi>Bruce Springsteen</bdi></h1>
        </div>
        <div class="tabs">
            <ul><li class="sel"><a href="/artist/70248960-cb53-4ea4-943a-edb18f7d336f/recordings">Recordings</a></li></ul>
        </div>
        <h2>Recordings</h2>
        <table class="tbl">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Length</th>
                    <th>Artist</th>
                    <th>Release groups</th>
                    <th>Rating</th>
                </tr>
            </thead>
            <tbody>
{''.join(rows)}            </tbody>
        </table>
    </div>
</body>
</html>
'''
    dst = FIX / 'artist-recordings-comments.html'
    dst.write_text(out, encoding='utf-8')
    print(f'wrote {dst.relative_to(HERE)} ({len(RECORDINGS)} rows)')


def build_release():
    """Writes the release-tracks fixture from the committed live release."""
    src = FIX / 'release-tracks-live-date-flags.html'
    page = src.read_text(encoding='utf-8')
    done = set()

    def patch_row(m):
        row = m.group(0)
        t = re.search(r'(<td class="title wrap-anywhere"><a href="/recording/[0-9a-f-]{36}"><bdi>)([^<]*)(</bdi></a>)', row)
        if not t or t.group(2) not in TRACKS or t.group(2) in done:
            return row
        comment, drop_date = TRACKS[t.group(2)]
        done.add(t.group(2))
        row = row[:t.end()] + comment_span(comment) + row[t.end():]
        if drop_date:
            # Only the "recording of" relationship's date feeds "Recording
            # date"; the row carries other "(on …)" dates (recorded at, …)
            # before it.
            at = row.find('recording of:</dt>')
            head, tail = row[:at], row[at:]
            tail, n = re.subn(r' <!-- -->\(on 1999-04-11\)', '', tail, count=1)
            if at < 0 or n != 1:
                sys.exit(f'no "recording of … (on 1999-04-11)" in the {t.group(2)} row')
            row = head + tail
        return row

    out = re.sub(r'<tr class="(?:odd|even)".*?</tr>', patch_row, page)
    missing = set(TRACKS) - done
    if missing:
        sys.exit(f'tracks not found: {sorted(missing)}')
    dst = FIX / 'release-tracks-comment-dates.html'
    dst.write_text(out, encoding='utf-8')
    print(f'wrote {dst.relative_to(HERE)} ({len(done)} comments injected)')


def main():
    """Builds both fixtures."""
    build_recordings()
    build_release()


if __name__ == '__main__':
    main()
