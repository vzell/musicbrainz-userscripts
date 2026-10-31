#!/usr/bin/env python3
"""Probe archive.org's embeddable player for the planned "Play here" in the
Internet Archive window (org/internet.archive.org, answer Q7 of 2026-10-31).

Prints, for an item and for one track of it, the status and the headers that
decide whether another site may frame the page: X-Frame-Options and the
Content-Security-Policy's frame-ancestors. Also whether the body loads a
player script. Read-only, anonymous.

Usage: python3 scripts/probe-ia-embed.py
"""

import sys
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 (https://github.com/vzell/mb-userscripts)'
ITEM = 'bs1975-12-27.aud.jk.cb.hrubesh.flac16'
URLS = [
    f'https://archive.org/embed/{ITEM}',
    f'https://archive.org/embed/{ITEM}/' + urllib.parse.quote('1-02. Tenth Avenue Freeze-Out.flac'),
    'https://archive.org/embed/1975-bruce-springsteen-widener-college-audience-cam',
    f'https://archive.org/embed/{ITEM}?playlist=1',
]


def main():
    """Asks each embed URL and prints what matters for framing."""
    for url in URLS:
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                st, h, body = r.status, r.headers, r.read(200000).decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            st, h, body = e.code, e.headers, ''
        csp = h.get('Content-Security-Policy', '') or ''
        fa = [p.strip() for p in csp.split(';') if 'frame-ancestors' in p]
        print(f'== {st} {url}')
        print(f'   content-type: {h.get("Content-Type")}')
        print(f'   x-frame-options: {h.get("X-Frame-Options")!r}')
        print(f'   csp frame-ancestors: {fa or "none"}')
        print(f'   body: {len(body)} chars, <audio {"<audio" in body}, <video {"<video" in body}, jwplayer {"jwplayer" in body.lower()}, play8 {"play8" in body.lower()}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
