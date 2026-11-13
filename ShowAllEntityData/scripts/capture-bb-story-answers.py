#!/usr/bin/env python3
"""Captures the ListPages answers the bb-story spec replays (org/brucebase.org
Phase 12), signed out, 1 s apart, into tests/fixtures/bb-story/ — the event
lookup `_bbStoryEventLookup()` makes, with the userscript's own template
(`_BB_LP_TEMPLATE`, read from the userscript):

    lookup-1978-07-07-roxy-theatre-west-hollywood-ca.json   name=<slug>*: one gig
    lookup-1971-05-15-union-nj.json                         name=<slug>*: nothing
    lookup-1971-05-15.json                                  name=<date>*: that day's events

Page titles only: ListPages is never asked who made or edited a page.

    python3 scripts/capture-bb-story-answers.py
"""
import importlib.util
import json
import os
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'tests', 'fixtures', 'bb-story')


def _load(name, file):
    """A hyphenated script as a module."""
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, file))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    """Captures the three answers."""
    cap = _load('cap', 'capture-bb-tag-answers.py')
    tpl = cap.template()
    os.makedirs(OUT, exist_ok=True)
    print(f'capture started {time.strftime("%Y-%m-%dT%H:%M:%S%z")}')
    for key, pattern in [('1978-07-07-roxy-theatre-west-hollywood-ca', '1978-07-07-roxy-theatre-west-hollywood-ca*'),
                         ('1971-05-15-union-nj', '1971-05-15-union-nj*'), ('1971-05-15', '1971-05-15*')]:
        js = cap.post({'category': 'gig nogig recording rehearsal interview', 'name': pattern, 'perPage': 5,
                       'order': 'fullname', 'separate': 'false', 'module_body': tpl, 'p': 1})
        with open(os.path.join(OUT, f'lookup-{key}.json'), 'w', encoding='utf-8', newline='\n') as f:
            json.dump({'status': js['status'], 'body': js['body']}, f, ensure_ascii=False)
        print(f'{key}: {js["body"].count(chr(0x2403))} item(s)')


if __name__ == '__main__':
    main()
