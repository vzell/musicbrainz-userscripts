#!/usr/bin/env python3
"""Print title, tag count, tag characters, On Stage tab and tags of mirror pages.

Usage: python3 scripts/bb-page-tags-dump.py <kind:slug> [<kind:slug> ...]
Mirror: ~/git/scripts/BruceParser/bb/latest (BB_MIRROR overrides).
"""

import os
import re
import sys

TAGS_BLOCK_RE = re.compile(r'<div class="page-tags">(.*?)</div>', re.S)
TAG_RE = re.compile(r'<a href="/system:page-tags/tag/[^"#]*#pages">([^<]*)</a>')
TITLE_RE = re.compile(r'<div id="page-title">\s*(.*?)\s*</div>', re.S)
TAB_RE = re.compile(r'<em>On ?[Ss]tage</em>')


def main(argv):
    """Dump each named page."""
    mirror = os.environ.get('BB_MIRROR', os.path.expanduser('~/git/scripts/BruceParser/bb/latest'))
    for ref in argv:
        kind, slug = ref.split(':', 1)
        path = os.path.join(mirror, kind, f'{kind}_{slug}.html')
        if not os.path.exists(path):
            print(ref, 'MISSING')
            continue
        with open(path, encoding='utf-8', errors='replace') as fh:
            html = fh.read()
        m = TAGS_BLOCK_RE.search(html)
        tags = TAG_RE.findall(m.group(1)) if m else []
        t = TITLE_RE.search(html)
        title = re.sub(r'<[^>]+>', '', t.group(1)).strip() if t else ''
        print(f'{ref} | {title} | {len(tags)} tags | {len(" ".join(tags))} chars | onstage tab {bool(TAB_RE.search(html))}')
        print('  ' + ' '.join(tags))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
