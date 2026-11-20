#!/usr/bin/env python3
"""List the ℗-notice lines of saved release pages' annotations.

Reads `release.latest_annotation.text` from each page's embedded JSON payload
(the wiki source) and prints every line that starts with ℗, (P) or
"Phonographic copyright" (case-insensitive), the release-notice finding's
rule (docs/claude/findings.md). Used to pick and check its fixtures.

Usage:
    python3 scripts/list-annotation-notice-lines.py page.html [page.html ...]
"""
import json
import re
import sys

NOTICE = re.compile(r'^\s*(?:℗|\(p\)|phonographic\s+copyright)', re.I)


def release_payload(html):
    """The page's release payload, or None."""
    for m in re.finditer(r'<script type="application/json">(.*?)</script>', html, re.S):
        if '"mediums"' not in m.group(1):
            continue
        try:
            p = json.loads(m.group(1))
        except ValueError:
            continue
        if isinstance(p, dict) and p.get('release'):
            return p['release']
    return None


def main():
    """Print each file's notice lines."""
    for path in sys.argv[1:]:
        rel = release_payload(open(path, encoding='utf-8').read())
        text = ((rel or {}).get('latest_annotation') or {}).get('text') or ''
        lines = [ln for ln in re.split(r'\r?\n', text) if NOTICE.match(ln)]
        print(f'{path}: {len(text)} chars, {len(lines)} notice line(s)')
        for ln in lines:
            print('   ', repr(ln))


if __name__ == '__main__':
    main()
