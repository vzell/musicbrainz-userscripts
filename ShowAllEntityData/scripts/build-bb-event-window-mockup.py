#!/usr/bin/env python3
"""Builds the Phase 16 batch 1 mockup (org/brucebase.org: the event windows' gaps G1-G3).

Reads debug/bb-event-window-mockup.json (scripts/extract-bb-event-window-mockup.js:
five real event pages, the window's record today and the parts batch 1 would
add) into scripts/bb-event-window-mockup.template.html and writes
debug/bb-event-window-mockup.html, the page published as the mockup.

usage: python3 scripts/build-bb-event-window-mockup.py
"""

import html
import json
import os
import socket
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'debug', 'bb-event-window-mockup.json')
TEMPLATE = os.path.join(ROOT, 'scripts', 'bb-event-window-mockup.template.html')
OUT = os.path.join(ROOT, 'debug', 'bb-event-window-mockup.html')
LABELS = [
    'Gig · Los Angeles 1984-10-29',
    'Recording · 914 Sound 1972-06-27',
    'Interview · WMMR 1974-04-07',
    'Interview · SiriusXM 2020-04-24',
    'Gig · Red Bank 1974-08-14',
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
           'by the shipped window parser · scripts/extract-bb-event-window-mockup.js')
    views = ''.join(f'<button type="button" class="chip" data-view="{i}" aria-pressed="{"true" if i == 0 else "false"}">'
                    f'{html.escape(label)}</button>' for i, label in enumerate(LABELS))
    page = open(TEMPLATE, encoding='utf-8').read()
    for key, value in (('__VIEWS__', views), ('__DATA__', js(data)), ('__ENV__', js(env)), ('__VIEWLABELS__', js(LABELS))):
        if page.count(key) != 1:
            print(f'{key} must be in the template once', file=sys.stderr)
            return 1
        page = page.replace(key, value)
    open(OUT, 'w', encoding='utf-8').write(page)
    print(f'{OUT}: {len(page):,} bytes')
    return 0


if __name__ == '__main__':
    sys.exit(main())
