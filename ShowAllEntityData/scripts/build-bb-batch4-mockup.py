#!/usr/bin/env python3
"""Builds the Phase 16 batch 4 mockup (org/brucebase.org: story pictures and song windows, G6-G7).

Reads debug/bb-batch4-mockup.json (scripts/extract-bb-batch4-mockup.js: five pages
read today and with batch 4) into
scripts/bb-batch4-mockup.template.html and writes debug/bb-batch4-mockup.html, the page published as the mockup.

usage: python3 scripts/build-bb-batch4-mockup.py
"""

import html
import json
import os
import socket
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'debug', 'bb-batch4-mockup.json')
TEMPLATE = os.path.join(ROOT, 'scripts', 'bb-batch4-mockup.template.html')
OUT = os.path.join(ROOT, 'debug', 'bb-batch4-mockup.html')
LABELS = [
    'Story · DJ set 2023-10-09',
    'Story · About Bob Dylan',
    "Song · I'm Bad, I'm Nationwide",
    'Song · The Promise',
    'Song · 1945',
]


def js(value):
    """JSON for a <script>, with no closing tag inside."""
    return json.dumps(value, ensure_ascii=False).replace('</', '<\\/')


def main():
    """Fills the template and writes the page."""
    data = json.load(open(DATA, encoding='utf-8'))
    if len(data) != len(LABELS):
        print(f'expected {len(LABELS)} pages, got {len(data)}', file=sys.stderr)
        return 1
    at = subprocess.run(['date', '+%FT%T%:z'], env={**os.environ, 'TZ': 'Europe/Berlin'},
                        capture_output=True, text=True, check=True).stdout.strip()
    env = (f'Data: the mirror copy of 2026-10-18 (debug/bb-mirror/), read {at} on {socket.gethostname()} '
           'by the shipping window reader · scripts/extract-bb-batch4-mockup.js')
    views = ''.join(f'<button type="button" class="chip" data-view="{i}" aria-pressed="{"true" if i == 0 else "false"}">'
                    f'{html.escape(label)}</button>' for i, label in enumerate(LABELS))
    page = open(TEMPLATE, encoding='utf-8').read()
    for key, value in (('__VIEWS__', views), ('__DATA__', js(data)), ('__ENV__', js(env))):
        if page.count(key) != 1:
            print(f'{key} must be in the template once', file=sys.stderr)
            return 1
        page = page.replace(key, value)
    open(OUT, 'w', encoding='utf-8').write(page)
    print(f'{OUT}: {len(page):,} bytes')
    return 0


if __name__ == '__main__':
    sys.exit(main())
