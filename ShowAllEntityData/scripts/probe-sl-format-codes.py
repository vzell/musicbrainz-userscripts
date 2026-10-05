#!/usr/bin/env python3
"""Read-only probe: which card "Format:" texts does each springsteenlyrics.com
collection format filter (`f_format=<code>`) return?

The compact bar's Format menu filters a LOADED table by the same codes, so it
needs, per code, the card texts the server counts under it (does 12i cover
"LP"? does cd5 cover "CD + 2xDVD"?). This asks the server instead of guessing:
page 1 (up to 100 cards) of `collection.php?cmd=list&category=all&f_format=X`
for every code the entry page offers, tallying each card's Format text and the
list's own "Showing items ... of N" total. One request per ~1.2 s.

Usage:
    python3 scripts/probe-sl-format-codes.py            # prints a table
    python3 scripts/probe-sl-format-codes.py --json     # machine-readable
"""

import json
import re
import sys
import time
import urllib.error
import urllib.request

BASE = 'https://www.springsteenlyrics.com/collection.php?cmd=list&category=all&f_format='
CODES = ['7i', '10i', '12i', 'flex', 'cd3', 'cd5', 'cdr', 'mc', '8t', 'r2r', 'nt', 'md',
         'vhs', 'betamax', 'betacamsp', 'umatic', 'v8', 'ced', 'vhd', 'ld', 'vcd', 'dvd',
         'dvdr', 'bd', 'bdr', 'prt']
FORMAT_RE = re.compile(r'<em>Format:</em></span>\s*([^<]*)<br>')
TOTAL_RE = re.compile(r'Showing items\s*[\d-]+\s*of\s*(\d+)')


def fetch(url):
    """Fetches one URL as text; returns (status, body)."""
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
                      '(KHTML, like Gecko) Chrome/129.0 Safari/537.36',
        'Accept': 'text/html',
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, resp.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, ''


def main():
    """Probes every code and prints the tally."""
    result = {}
    for code in CODES:
        status, body = fetch(BASE + code)
        tally = {}
        for raw in FORMAT_RE.findall(body):
            text = re.sub(r'\s+', ' ', raw.replace('&quot;', '"')).strip()
            tally[text] = tally.get(text, 0) + 1
        total = TOTAL_RE.search(body)
        result[code] = {'status': status, 'total': int(total.group(1)) if total else len(FORMAT_RE.findall(body)),
                        'formats': dict(sorted(tally.items(), key=lambda kv: -kv[1]))}
        time.sleep(1.2)
    if '--json' in sys.argv:
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return
    for code, r in result.items():
        shown = ', '.join(f'{t} ({n})' for t, n in r['formats'].items())
        print(f'{code:10} {r["status"]} total={r["total"]:<5} {shown}')


if __name__ == '__main__':
    main()
