#!/usr/bin/env python3
"""How the live wiki answers its redirect-stub page kinds (org/brucebase.org, Phase 16).

The mirror holds onstage:, offstage:, multi: and soundcheck: pages as Wikidot's
Redirect module ("redirects the browser directly to …"); `_bbRedirectedUrl()`
knows that onstage:/offstage: answer 301 live. This asks one page of each kind
WITHOUT following redirects and prints the status, the Location and whether the
body is the Redirect module, 1.1 s apart. No cookies, a plain User-Agent.

usage: python3 scripts/probe-bb-redirect-kinds.py
"""

import sys
import time
import urllib.error
import urllib.request

BASE = 'https://brucebase.wikidot.com'
UA = 'ShowAllEntityData-probe/1.0 (+https://github.com/vzell/mb-userscripts)'
PAGES = [
    '/onstage:1966-04-22-keyport-roller-drome-matawan-nj',
    '/offstage:1966-04-22-keyport-roller-drome-matawan-nj',
    '/multi:1967-09-16-left-foot-freehold-nj',
    '/soundcheck:1988-03-28-joe-louis-arena-detroit-mi',
]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Keeps a 3xx as the answer."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    """Asks each page once and prints one line."""
    opener = urllib.request.build_opener(NoRedirect)
    for i, p in enumerate(PAGES):
        if i:
            time.sleep(1.1)
        t0 = time.monotonic()
        try:
            res = opener.open(urllib.request.Request(BASE + p, headers={'User-Agent': UA}), timeout=60)
            status, loc, body = res.status, res.headers.get('Location', ''), res.read().decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            status, loc, body = e.code, e.headers.get('Location', ''), e.read().decode('utf-8', 'replace')
        ms = round((time.monotonic() - t0) * 1000)
        print(f'{p}: {status} {ms} ms location={loc or "-"} redirect-module={"Redirect module" in body}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
