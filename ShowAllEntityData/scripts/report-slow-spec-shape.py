#!/usr/bin/env python3
"""Per-test breakdown of one spec file inside a Playwright JSON report.

Written to settle a contradiction rather than to be kept: `MEASUREMENTS.org`
recorded `rel-auto-retry-failed` as summing to 149.7 s inside a parallel run
"with its 7 tests spread across workers" and a longest single test of 56.4 s,
and `tests/README.org` repeats it. Measurement on the same host with the same
(byte-identical) spec file gives a sum of ~295 s in ONE worker.

`fullyParallel: false` has been in `playwright.config.js` since the harness was
created and the spec declares no per-file parallel mode, so tests inside a file
cannot spread across workers at all — which makes the shape of this breakdown,
not just its total, the thing worth printing: consecutive start offsets with no
overlap are what "one worker, serially" looks like.

    python3 scripts/report-slow-spec-shape.py <report.json> [--spec NAME]
"""

import argparse
import datetime as dt
import json
import os
import sys


def iter_results(node, out):
    for suite in node.get('suites', []) or []:
        iter_results(suite, out)
    for spec in node.get('specs', []) or []:
        for test in spec.get('tests', []) or []:
            for res in test.get('results', []):
                if res.get('startTime'):
                    out.append((node.get('file') or spec.get('file', ''),
                                spec.get('title', ''), res))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('report')
    ap.add_argument('--spec', default='rel-auto-retry-failed')
    args = ap.parse_args()

    with open(args.report, encoding='utf-8') as fh:
        data = json.load(fh)
    rows = []
    for suite in data.get('suites', []):
        iter_results(suite, rows)
    if not rows:
        sys.exit('no test results in that report')

    t0 = min(dt.datetime.fromisoformat(r[2]['startTime'].replace('Z', '+00:00'))
             for r in rows)
    mine = []
    for file_, title, res in rows:
        if args.spec not in file_:
            continue
        start = dt.datetime.fromisoformat(res['startTime'].replace('Z', '+00:00'))
        mine.append({
            'title': title,
            'offset_s': (start - t0).total_seconds(),
            'duration_s': (res.get('duration') or 0) / 1000.0,
            'worker': res.get('workerIndex'),
        })
    if not mine:
        sys.exit(f'{args.spec} not found in {args.report}')
    mine.sort(key=lambda r: r['offset_s'])

    print(f'{os.path.basename(args.report)} — {args.spec}\n')
    print(f'{"start +s":>10} {"dur s":>8} {"end +s":>9}  worker  test')
    for r in mine:
        print(f'{r["offset_s"]:>10.2f} {r["duration_s"]:>8.2f} '
              f'{r["offset_s"] + r["duration_s"]:>9.2f}  {str(r["worker"]):>6}  '
              f'{r["title"][:60]}')

    total = sum(r['duration_s'] for r in mine)
    span = (max(r['offset_s'] + r['duration_s'] for r in mine)
            - min(r['offset_s'] for r in mine))
    workers = sorted({r['worker'] for r in mine})
    longest = max(mine, key=lambda r: r['duration_s'])
    print(f'\n  tests            {len(mine)}')
    print(f'  sum of durations {total:.2f} s')
    print(f'  span             {span:.2f} s   (span - sum = {span - total:.2f} s)')
    print(f'  worker indexes   {workers}')
    print(f'  longest test     {longest["duration_s"]:.2f} s — {longest["title"][:50]}')
    print('\n  One worker and span == sum means the tests ran back to back in a '
          'single worker,\n  which is what fullyParallel: false requires. The '
          'longest SINGLE test is then not\n  a floor the run can approach — the '
          'whole file is.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
