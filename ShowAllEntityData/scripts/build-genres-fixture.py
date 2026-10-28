"""Builds tests/fixtures/genres-list.html from a saved /genres snapshot.

Usage: python3 scripts/build-genres-fixture.py debug/genres-initial.html tests/fixtures/genres-list.html

The snapshot (vzell, 2026-10-28) is `#page`'s outerHTML AFTER the script ran,
so its h1 holds our toolbar. The fixture keeps only what MusicBrainz serves
inside `#content`: the h1's text, the intro paragraphs, the one bare `<ul>` of
`/genre/<MBID>` links (with their `span.comment`s) and any paragraph after
it, inside a minimal page, which is what the `/genres` reader
(`_mbParseGenresPage()`) reads from a fetched page.
"""
import re
import sys

LIST_START = '<ul><li><a href="/genre/'


def main():
    """Extracts the genre list and its paragraphs and writes the fixture."""
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    with open(sys.argv[1], encoding='utf-8-sig') as fh:
        html = fh.read()
    start = html.find(LIST_START)
    if start < 0 or html.find(LIST_START, start + 1) >= 0:
        print('expected exactly one genre list')
        return 1
    end = html.index('</ul>', start) + len('</ul>')
    head = html[:start]
    intro = re.findall(r'<p>(?:(?!</p>).)*</p>', head[head.rfind('</h1>') if '</h1>' in head else head.rfind('</div></div>'):])
    tail = re.match(r'(?:<p>(?:(?!</p>).)*</p>)*', html[end:]).group(0)
    items = html.count('<li>', start, end)
    page = ('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Genre list - MusicBrainz</title></head>'
            '<body><div class="fullwidth " id="page"><div id="content"><h1>Genre list</h1>'
            + ''.join(intro) + html[start:end] + tail + '</div></div></body></html>\n')
    if 'eyJ' in page:
        print('refusing: the fixture would carry a token (eyJ…)')
        return 1
    with open(sys.argv[2], 'w', encoding='utf-8') as fh:
        fh.write(page)
    print(f'{items} genres, {len(intro)} intro paragraph(s), {len(re.findall("<p>", tail))} after; wrote {sys.argv[2]}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
