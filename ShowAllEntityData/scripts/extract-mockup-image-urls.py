"""List the picture tiles a rendered page snapshot holds, for a design mockup.

Reads one or more final-rendered-page snapshots (debug/*-final.html) and prints,
per file, every `figure.mb-release-art-tile` of the script's picture sections
(the MusicBrainz Cover art section and the foreign detail head's Scans / Images /
Pictures sections) with the heading it sits under, its thumbnail, its full-size
link and its caption, as JSON:

    {"<file>": [{"section": "...", "thumb": "...", "full": "...", "caption": "..."}, ...]}

The output is the raw material for a mockup's `mockup-images` block
(org/image-handling-mockups.html), which scripts/build-mockup-artifact.py then
inlines for the published copy. Nothing is fetched.

usage:
  python3 scripts/extract-mockup-image-urls.py debug/MB-release-final.html \
      debug/SL-release-2copys-final.html [...] > out.json
  python3 scripts/extract-mockup-image-urls.py --mockup \
      mb=debug/MB-release-final.html sla=debug/SL-release-final.html [...]
"""

import html
import json
import re
import sys

TILE_RE = re.compile(r'<figure class="mb-release-art-tile[^"]*"(?P<attrs>[^>]*)>(?P<body>.*?)</figure>', re.S)
HEAD_RE = re.compile(r'<h2[^>]*class="[^"]*(?:mb-fd-h2|mb-release-art-h2)[^"]*"[^>]*>(?P<body>.*?)</h2>', re.S)
IMG_RE = re.compile(r'<img[^>]*\bsrc="(?P<src>[^"]+)"')
HREF_RE = re.compile(r'<a[^>]*\bhref="(?P<href>[^"]+)"')
CAP_RE = re.compile(r'<figcaption[^>]*>(?P<cap>.*?)</figcaption>', re.S)
TAG_RE = re.compile(r'<[^>]+>')


def text_of(fragment):
    """Return the visible text of an HTML fragment, whitespace collapsed."""
    return re.sub(r'\s+', ' ', html.unescape(TAG_RE.sub(' ', fragment))).strip()


def tiles_of(path):
    """Return the tiles of one snapshot, each with the heading above it."""
    with open(path, encoding='utf-8', errors='replace') as fh:
        doc = fh.read()
    heads = [(m.start(), text_of(m.group('body'))) for m in HEAD_RE.finditer(doc)]
    out = []
    for m in TILE_RE.finditer(doc):
        section = ''
        for pos, label in heads:
            if pos < m.start():
                section = label
            else:
                break
        body = m.group('body')
        img = IMG_RE.search(body)
        href = HREF_RE.search(body)
        cap = CAP_RE.search(body)
        out.append({
            'section': section,
            'thumb': html.unescape(img.group('src')) if img else '',
            'full': html.unescape(href.group('href')) if href else '',
            'caption': text_of(cap.group('cap')) if cap else '',
        })
    return out


def absolute(url):
    """Give a protocol-relative URL an https scheme; leave others alone."""
    return 'https:' + url if url.startswith('//') else url


def mockup_block(pairs):
    """Return a `mockup-images` dict from `prefix=path` pairs: thumbnails as
    `<prefix><n>` (1-based, page order), the full-size links as `<prefix><n>f`
    shrunk to 1000 px by the build script."""
    out = {}
    for pair in pairs:
        prefix, path = pair.split('=', 1)
        for n, t in enumerate(tiles_of(path), 1):
            if t['thumb']:
                out[f'{prefix}{n}'] = {'u': absolute(t['thumb'])}
            if t['full']:
                out[f'{prefix}{n}f'] = {'u': absolute(t['full']), 'max': 1000}
    return out


def main(argv):
    """Print the tiles of every snapshot named on the command line, or with
    `--mockup prefix=path ...` a ready `mockup-images` block."""
    if len(argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    if argv[1] == '--mockup':
        json.dump(mockup_block(argv[2:]), sys.stdout, indent=1)
    else:
        json.dump({p: tiles_of(p) for p in argv[1:]}, sys.stdout, indent=1)
    print()
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
