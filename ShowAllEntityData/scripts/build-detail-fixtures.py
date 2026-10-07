#!/usr/bin/env python3
"""Builds the detail-page fixtures for the `detail-preview` fixture specs.

Input is curl captures of real detail pages in `debug/` (2026-10-07), the
pages a row of each foreign table links to:

    springsteenlyrics.com  bootlegs.php?item=4554 (in sl-bootlegs-page1),
                           6739 (three discs + a lineage line + scans),
                           1331 (an UNNUMBERED tracklist),
                           collection.php?item=8981 (in sl-collection-page1),
                           7431 (side-numbered tracks, prose notes, scans)
    jungleland.it          html/19750205.htm (ten scans),
                           "Magic In The Koln Night (2007-12-13).htm"
                           (an o-umlaut, an unknown 0000-00-00 date)
    brucespringsteen.it    DB/detrec.aspx?code=CR1AD1 (ditto marks),
                           COL4942001 (official), LP1B1 (has a photo)
    brucebase.wikidot.com  song:4th-of-july-asbury-park-sandy

Removed, so a spec stays network-free and the page cannot change under it:
every `<script>`, `<noscript>`, `<iframe>` and `<link>`, and `background=`
attributes. The work is done on BYTES: the jungleland.it pages are
windows-1252 without any declaration, which is exactly what the preview's
decoder has to cope with, so they must stay so.

Song LYRICS are blanked, so the repository does not carry copies of them:
every word of a song page's lyrics block (springsteenlyrics.com: between the
first two `<hr>` of `.project-detail`; Brucebase: the "Lyrics" tab's panel)
becomes "la". Tags, line breaks, punctuation, digits and entities stay, so
the parser sees the same shape: the same lines, verses and stage notes. The
specs assert that shape, never lyric text.

Re-run after re-capturing a snapshot:

    python3 scripts/build-detail-fixtures.py
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (snapshot in debug/, fixture in tests/fixtures/, a byte string the page must
# contain, which lyrics block to blank: None, 'sl-song' or 'bb-song')
TARGETS = [
    ('detail-sl-bootlegs-4554.html', 'detail-sl-bootlegs-4554.html', b'class="blog-post"', None),
    ('detail-sl-bootlegs-6739.html', 'detail-sl-bootlegs-6739.html', b'Disc 3:', None),
    ('detail-sl-bootlegs-1331.html', 'detail-sl-bootlegs-1331.html', b'LAND OF HOPE AND DREAMS', None),
    ('detail-sl-collection-8981.html', 'detail-sl-collection-8981.html', b'class="blog-post"', None),
    ('detail-sl-collection-7431.html', 'detail-sl-collection-7431.html', b'A1- LONELY NIGHT', None),
    ('detail-jl-19750205.htm', 'detail-jl-19750205.html', b'Uploader:', None),
    ('detail-jl-koln.htm', 'detail-jl-koln.html', b'K\xf6ln', None),
    ('detail-bs-CR1AD1.html', 'detail-bs-CR1AD1.html', b'Title  :', None),
    ('detail-bs-COL4942001.html', 'detail-bs-COL4942001.html', b'Catalogue number:', None),
    ('detail-bs-LP1B1.html', 'detail-bs-LP1B1.html', b'blegs\\images\\LP1B1.jpg', None),
    ('detail-bb-song-4th-of-july.html', 'detail-bb-4th-of-july.html', b'Performed live <strong>', 'bb-song'),
]

STRIP_RES = [
    re.compile(rb'<script\b.*?</script\s*>', re.S | re.I),
    re.compile(rb'<noscript\b.*?</noscript\s*>', re.S | re.I),
    re.compile(rb'<iframe\b.*?</iframe\s*>', re.S | re.I),
    re.compile(rb'<link\b[^>]*>', re.I),
]
BACKGROUND_RE = re.compile(rb'\sbackground="[^"]*"', re.I)

# A text run between two tags, and within it an entity (kept) or a word (blanked).
TEXT_RUN_RE = re.compile(r'>([^<]+)<')
WORD_OR_ENTITY_RE = re.compile(r'(&#?\w+;)|[^\W\d_]+')


def blank_words(html):
    """Replaces every word of every text run in `html` with "la".

    Entities (`&#039;`, `&amp;`) are kept whole, so the markup stays valid;
    digits, punctuation and whitespace are kept, so lines keep their shape.
    """
    return TEXT_RUN_RE.sub(
        lambda m: '>' + WORD_OR_ENTITY_RE.sub(lambda w: w.group(1) or 'la', m.group(1)) + '<', html)


def blank_lyrics(text, kind):
    """Blanks the lyrics block of a song page; returns (text, blanked?).

    'sl-song': springsteenlyrics.com, between the first two `<hr>` after
    `class="project-detail"` (the lyrics `<p>`; left as it is when it is the
    "Lyrics not available" alert).
    'bb-song': Brucebase, the panel of the tabview's "Lyrics" tab, paired by
    position as the parser pairs them.
    """
    if kind == 'sl-song':
        start = text.find('class="project-detail"')
        a = text.find('<hr>', start)
        b = text.find('<hr>', a + 4)
        if start < 0 or a < 0 or b < 0:
            return text, False
        # A song without lyrics has the site's "Lyrics not available" alert
        # there instead: nothing to blank, and the parser reads that text.
        if 'alert-warning' in text[a:b]:
            return text, True
        return text[:a] + blank_words(text[a:b]) + text[b:], True
    if kind == 'bb-song':
        nav = re.search(r'<ul class="yui-nav">(.*?)</ul>', text, re.S)
        if not nav:
            return text, False
        labels = [re.sub(r'<[^>]+>', '', li).strip() for li in re.findall(r'<li[^>]*>(.*?)</li>', nav.group(1), re.S)]
        if 'Lyrics' not in labels:
            return text, False
        start = text.find(f'<div id="wiki-tab-0-{labels.index("Lyrics")}"')
        nxt = text.find('<div id="wiki-tab-0-', start + 1)
        if start < 0:
            return text, False
        end = nxt if nxt > 0 else text.find('</div>', start)
        return text[:start] + blank_words(text[start:end]) + text[end:], True
    return text, True


def main():
    """Reads every snapshot, sanitises it, checks its marker, writes the fixture."""
    failed = False
    for snap, out, marker, lyrics in TARGETS:
        src = os.path.join(ROOT, 'debug', snap)
        if not os.path.exists(src):
            print(f'debug/{snap}: missing -- capture it first (see the docstring)')
            failed = True
            continue
        with open(src, 'rb') as fh:
            data = fh.read()
        for rx in STRIP_RES:
            data = rx.sub(b'', data)
        data = BACKGROUND_RE.sub(b'', data)
        if marker not in data:
            print(f'debug/{snap}: marker {marker!r} not found -- has the page changed shape?')
            failed = True
            continue
        if lyrics:
            text, ok = blank_lyrics(data.decode('utf-8'), lyrics)
            if not ok:
                print(f'debug/{snap}: no lyrics block found to blank -- has the page changed shape?')
                failed = True
                continue
            data = text.encode('utf-8')
        note = (f'<!-- Generated by scripts/build-detail-fixtures.py from debug/{snap}: scripts, '
                'noscripts, iframes, links and background images removed'
                f'{", lyrics blanked" if lyrics else ""}; do not edit by hand. -->\n').encode('ascii')
        with open(os.path.join(ROOT, 'tests', 'fixtures', out), 'wb') as fh:
            fh.write(note + data)
        print(f'debug/{snap} -> tests/fixtures/{out} ({len(data)} bytes)')
    if failed:
        sys.exit(1)


if __name__ == '__main__':
    main()
