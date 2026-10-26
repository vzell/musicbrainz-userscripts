"""Wrap the uploaded genre page fragment (debug/genre-initial.html, roots rock,
the `<div id="page">` only, as MusicBrainz sends it, 2026-10-26) into a whole
document, tests/fixtures/rel-genre-overview.html, with the `<base>` the other
rel-*-overview fixtures carry so its relative links resolve on musicbrainz.org.

usage: python3 scripts/build-genre-overview-fixture.py [SRC] [DEST]
"""
import sys

GID = '883d75d5-1365-46ee-8cbe-d3ae2facdd93'


def main():
    """Read the fragment, wrap it and write the fixture; trailing whitespace is stripped per line."""
    src = sys.argv[1] if len(sys.argv) > 1 else 'debug/genre-initial.html'
    dest = sys.argv[2] if len(sys.argv) > 2 else 'tests/fixtures/rel-genre-overview.html'
    frag = open(src, encoding='utf-8').read()
    frag = '\n'.join(line.rstrip() for line in frag.splitlines())
    doc = ('<!DOCTYPE html>\n<html lang="en"><head>'
           f'<base href="https://musicbrainz.org/genre/{GID}"><meta charset="utf-8">'
           '<title>Genre “roots rock” - MusicBrainz</title></head><body>\n'
           + frag + '\n</body></html>\n')
    open(dest, 'w', encoding='utf-8').write(doc)
    print(f'wrote {dest} ({len(doc)} bytes)')


if __name__ == '__main__':
    main()
