#!/usr/bin/env python3
"""Phase 16 batch 4 (org/brucebase.org, G6): the pictures of every Brucebase story page.

Over the mirror's story/ folder (bb/latest/story/story_<slug>.html), per page:
the <img> sources inside #page-content (up to the side bar), grouped by kind —
the Storyteller badge (content:files/storyteller.gif), a picture in a gallery
box (what the window's Images read, `_bbPageImages()`), an "image-container"
picture (Wikidot's [[image]], outside a gallery box), anything else. Prints the
counts and up to five sample pages per kind. No network.

usage: python3 scripts/probe-bb-story-images.py [mirror-dir]
"""

import collections
import os
import re
import socket
import subprocess
import sys

MIRROR = sys.argv[1] if len(sys.argv) > 1 else '/home/vzell/git/scripts/BruceParser/bb/latest/story'
IMG_RE = re.compile(r'<img\b[^>]*\bsrc="([^"]+)"', re.I)


def content_of(html):
    """#page-content up to the page's tags or the footer."""
    a = html.find('id="page-content"')
    if a < 0:
        return ''
    ends = [i for i in (html.find('class="page-tags"', a), html.find('id="page-info-break"', a), html.find('id="footer"', a)) if i > 0]
    return html[a:min(ends) if ends else len(html)]


def kind_of(chunk, src, pos):
    """The kind of one picture by its source and what wraps it."""
    if src.endswith('/storyteller.gif'):
        return 'badge'
    before = chunk[max(0, pos - 400):pos]
    if 'gallery-item' in before or 'gallery-box' in before:
        return 'gallery'
    if 'image-container' in before:
        return 'image-container'
    return 'other'


def main():
    """Reads every page and prints the summary."""
    at = subprocess.run(['date', '+%FT%T%:z'], env={**os.environ, 'TZ': 'Europe/Berlin'},
                        capture_output=True, text=True, check=True).stdout.strip()
    files = sorted(f for f in os.listdir(MIRROR) if f.startswith('story_') and f.endswith('.html'))
    pages = collections.Counter()
    imgs = collections.Counter()
    samples = collections.defaultdict(list)
    none = 0
    for f in files:
        chunk = content_of(open(os.path.join(MIRROR, f), encoding='utf-8', errors='replace').read())
        kinds = set()
        for m in IMG_RE.finditer(chunk):
            k = kind_of(chunk, m.group(1), m.start())
            kinds.add(k)
            imgs[k] += 1
            if len(samples[k]) < 5 and f not in [s.split(' ')[0] for s in samples[k]]:
                samples[k].append(f'{f} {m.group(1)[-70:]}')
        for k in kinds:
            pages[k] += 1
        if not kinds:
            none += 1
    print(f'Env: {at} · {socket.gethostname()} · n/a (no browser) · {MIRROR}')
    print(f'{len(files)} pages, {none} with no picture')
    for k in ('badge', 'gallery', 'image-container', 'other'):
        print(f'{k}: {pages[k]} pages, {imgs[k]} pictures')
        for s in samples[k]:
            print('   ', s)
    return 0


if __name__ == '__main__':
    sys.exit(main())
