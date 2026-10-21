#!/usr/bin/env python3
"""Builds the entity collections/subscribers fixtures (2026-10-22).

    python3 scripts/make-entity-list-fixtures.py

The sources are the debug/ snapshots the user saved from a real browser:
rendered-DOM saves, so they carry other userscripts' markup and, in
release-collections.html, this script's own toolbar. Copying them whole
would load a page that is already decorated. So only two things are taken
from each, verbatim:

  - the entity name (the h1's first <bdi>), put back into a plain
    <div class="<kind>header"><h1>…</h1></div>;
  - everything from the "Collections"/"Subscribers" <h2> to the end of
    div#content: the intro <p>, the <ul> and its footer row ("plus N other
    private collections" / "Plus N other anonymous users"), the subscribe <p>.

These are put into a minimal page (div#page > div#content + an empty
div#sidebar), the same shape as the hand-written report fixtures.

Every editor name (a subscriber, a collection's owner) is replaced by
editor-1, editor-2, … in page order, link and text alike, as
anonymize-user-fixtures.py does for an editor's subscribers (decided
2026-10-21). Fails if a /user/ link with a real name is left.
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEBUG = os.path.join(ROOT, 'debug')
OUT = os.path.join(ROOT, 'tests', 'fixtures')

# (source snapshot, fixture name, entity kind, h2 text)
FIXTURES = [
    ('artist-collections.html', 'entity-artist-collections.html', 'artist', 'Collections'),
    ('artist-subscribers.html', 'entity-artist-subscribers.html', 'artist', 'Subscribers'),
    ('label-subscribers.html', 'entity-label-subscribers.html', 'label', 'Subscribers'),
    ('release-collections.html', 'entity-release-collections-empty.html', 'release', 'Collections'),
]

PAGE = '''<!DOCTYPE html>
<!-- Built by scripts/make-entity-list-fixtures.py from debug/{src}: the entity
     name and div#content from the <h2>{h2}</h2> on, verbatim; editor names
     anonymized. -->
<html lang="en"><head><meta charset="utf-8"><title>{name} - MusicBrainz</title></head><body>
<div id="page"><div id="content"><div class="wrap-anywhere {kind}header"><h1><a class=""><bdi>{name}</bdi></a></h1></div>
<div class="tabs"><ul class="tabs"></ul></div>
{tail}</div><div id="sidebar"></div></div>
</body></html>
'''


def build(src, kind, h2):
    """Returns (entity name, tail markup) read from one snapshot."""
    with open(os.path.join(DEBUG, src), encoding='utf-8') as fh:
        html = fh.read()
    name = re.search(r'<h1>.*?<bdi>(.*?)</bdi>', html, re.S)
    start = html.find('<h2>%s</h2>' % h2)
    end = html.find('</div><div id="sidebar"', start)
    if not name or start < 0 or end < 0:
        sys.exit('%s: h1 name, <h2>%s</h2> or the sidebar boundary not found' % (src, h2))
    return name.group(1), html[start:end]


def anonymize(tail):
    """Replaces every /user/<name> link's name and its <bdi> text."""
    names = {}

    def sub(m):
        real = m.group(1)
        if real not in names:
            names[real] = 'editor-%d' % (len(names) + 1)
        return m.group(0).replace('/user/' + real + '"', '/user/' + names[real] + '"') \
                         .replace('<bdi>' + real + '</bdi>', '<bdi>' + names[real] + '</bdi>')

    tail = re.sub(r'<a href="/user/([^"]+)">.*?</a>', sub, tail)
    left = [n for n in re.findall(r'href="/user/([^"]+)"', tail) if not n.startswith('editor-')]
    if left:
        sys.exit('real editor names left: %s' % left)
    return tail, len(names)


def main():
    """Writes every fixture in FIXTURES to tests/fixtures/."""
    for src, out, kind, h2 in FIXTURES:
        name, tail = build(src, kind, h2)
        tail, count = anonymize(tail)
        with open(os.path.join(OUT, out), 'w', encoding='utf-8') as fh:
            fh.write(PAGE.format(src=src, h2=h2, name=name, kind=kind, tail=tail))
        print('%s: %s, %d editors anonymized' % (out, name, count))


if __name__ == '__main__':
    main()
