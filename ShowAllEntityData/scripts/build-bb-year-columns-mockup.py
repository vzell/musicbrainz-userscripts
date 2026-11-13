#!/usr/bin/env python3
"""Builds the Phase 14 mockup (org/brucebase.org: the year table's columns from
each event's own page) from the survey of one year's event pages
(scripts/probe-bb-year-events.js → debug/bb-year-events-<YYYY>.json) and
scripts/bb-year-columns-mockup.template.html, as debug/bb-year-columns-mockup.html.

Each row is a real event of the year with what the link previews' parser read
from its page: On stage, the tabs with content, the images by kind, the
scheduled start; the page's size (what loading it costs).

    python3 scripts/build-bb-year-columns-mockup.py [YYYY]
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
YEAR = sys.argv[1] if len(sys.argv) > 1 else '1978'
SRC = os.path.join(ROOT, 'debug', f'bb-year-events-{YEAR}.json')
TPL = os.path.join(HERE, 'bb-year-columns-mockup.template.html')
OUT = os.path.join(ROOT, 'debug', 'bb-year-columns-mockup.html')
TYPES = {'gig': 'Gig', 'nogig': 'No gig', 'rehearsal': 'Rehearsal', 'recording': 'Recording', 'interview': 'Interview'}
# Tabs every event page has when it has them at all: the year table shows
# them already (Setlist) or they are what the row is (Performances).
ALWAYS = {'On Stage', 'Setlist', 'Performances', 'Gallery'}


def row(r):
    """One mockup row from a survey record."""
    m = re.match(r'^(\d{4}-\d\d-\d\d)\s+(.*)$', r.get('title') or '')
    date, rest = (m.group(1), m.group(2)) if m else ('', r.get('title') or '')
    parts = [p.strip() for p in rest.split(',')]
    venue = parts[0] if parts else ''
    state = parts[-1] if len(parts) > 2 else ''
    city = ', '.join(parts[1:-1]) if len(parts) > 2 else (parts[1] if len(parts) > 1 else '')
    sched = (r.get('scheduled') or '').split(' · ')[0]
    return {
        'date': date, 'venue': venue, 'city': city, 'state': state, 'type': TYPES.get(r['kind'], r['kind']),
        'url': r['url'], 'kb': round(r['bytes'] / 1024),
        'stage': r.get('onStage') or '',
        'content': [t for t in (r.get('onPage') or '').split(' · ') if t and t not in ALWAYS],
        'images': r.get('kinds') or {},
        'start': '' if sched.startswith('time not known') else sched,
    }


def main():
    """Writes the mockup with its data inline."""
    survey = json.load(open(SRC, encoding='utf-8'))
    rows = sorted((row(r) for r in survey), key=lambda x: (x['date'], x['venue']))
    data = {
        'year': YEAR, 'rows': rows,
        'env': '2026-11-12T18:50+01:00 · petri · WSL2 Ubuntu 24.04.3 (Linux 6.18.58.1) · '
               'the shipped preview parser in Playwright 1.62.1 Chromium, no Tampermonkey (GM stubs)',
        'years': {'entries': 5010, 'years': 78, 'max': [277, '1973']},
    }
    tpl = open(TPL, encoding='utf-8').read()
    html = tpl.replace('/*DATA*/null', json.dumps(data, ensure_ascii=False))
    with open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(html)
    print(f'wrote {os.path.relpath(OUT, ROOT)}: {len(rows)} rows, {len(html):,} bytes')
    return 0


if __name__ == '__main__':
    sys.exit(main())
