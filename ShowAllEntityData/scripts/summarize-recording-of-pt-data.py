"""Per page of tests/fixtures/recording-of-pt-data.json: recordings, and how many perform a work.

Sanity check for scripts/build-recording-of-pagetype-fixtures.py: a page whose
recordings perform no work cannot show the "has" state in the spec.

usage: python3 scripts/summarize-recording-of-pt-data.py
"""
import json
import os

p = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'recording-of-pt-data.json')
d = json.load(open(p, encoding='utf-8'))
for pt, page in d['pages'].items():
    recs = [d['recordings'].get(r) for r in page['recordings']]
    perf = sum(1 for r in recs if r and any(x.get('type') == 'performance' for x in r['relations']))
    missing = sum(1 for r in recs if r is None)
    print(f'{pt:24} {len(recs)} recordings, {perf} perform a work, {missing} unknown to WS/2')
for by, b in d['browse'].items():
    print(f'browse {by}: count {b["recording-count"]}, {len(b["recordings"])} on page 1')
