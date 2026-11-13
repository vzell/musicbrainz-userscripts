#!/usr/bin/env python3
"""Print an event's own tags and its /onstage: page's tags (mockup sample data).

Usage: python3 scripts/bb-spill-sample.py <kind:slug> [MIRROR_DIR]
Also prints the event's /relation: and /song: link slugs and its title, which
the tag families (_bbTagFamily()) are classified by.
"""

import os
import re
import sys

TAGS_BLOCK_RE = re.compile(r'<div class="page-tags">(.*?)</div>', re.S)
TAG_RE = re.compile(r'<a href="/system:page-tags/tag/[^"#]*#pages">([^<]*)</a>')
TITLE_RE = re.compile(r'<div id="page-title">\s*(.*?)\s*</div>', re.S)


def load(mirror, ref):
    """Return the mirror page of "kind:slug" as text."""
    kind, slug = ref.split(':', 1)
    with open(os.path.join(mirror, kind, f'{kind}_{slug}.html'), encoding='utf-8', errors='replace') as fh:
        return fh.read()


def tags(html):
    """Return the page's tags."""
    m = TAGS_BLOCK_RE.search(html)
    return TAG_RE.findall(m.group(1)) if m else []


def main(argv):
    """Print the sample."""
    ref = argv[0]
    mirror = argv[1] if len(argv) > 1 else os.path.expanduser('~/git/scripts/BruceParser/bb/latest')
    ev = load(mirror, ref)
    on = load(mirror, 'onstage:' + ref.split(':', 1)[1])
    t = TITLE_RE.search(ev)
    print('TITLE', re.sub(r'<[^>]+>', '', t.group(1)).strip() if t else '')
    own = tags(ev)
    print('OWN', len(own), len(' '.join(own)), ' '.join(own))
    lower = {x.lower() for x in own}
    extra = [x for x in tags(on) if x.lower() not in lower]
    print('ONSTAGE', len(tags(on)), 'EXTRA', len(extra), ' '.join(extra))
    rel = sorted(set(re.findall(r'href="/relation:([^"]+)"', ev)))
    print('RELATIONS', ' '.join(rel))
    songs = sorted(set(re.findall(r'href="/song:([^"]+)"', ev)))
    print('SONGS', len(songs), ' '.join(songs[:80]))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
