#!/usr/bin/env python3
"""Run the full fixture suite in two trees and decompose its critical path.

The follow-up to `scripts/time-spec-across-versions.py`, and it exists because
that script answered its question with a NO. `tests/MEASUREMENTS.org` recorded
two candidates for the `test:full` step from 337-341 s to 344-347 s: the
longest spec got slower, or host conditions. Timing `rel-auto-retry-failed`
standalone in both trees gave 294.54 s vs 294.70 s — a 0.05% difference. The
spec is not it.

"Therefore host conditions" does NOT follow, and writing it down would be the
same unmeasured inference `MEASUREMENTS.org` already has a worked example
against (the 9.99.1045-vs-1048 gap, where the environment guess happened to be
right and was still a guess until someone measured it).

There is a third candidate neither hypothesis named. At 12 workers the suite's
wall clock is set by its longest spec, but `rel-auto-retry-failed` costs ~294 s
ALONE and ~324 s inside the suite — so ~30 s of it is contention from the other
11 workers. The suite grew from 490 to 534 tests between these two versions.
More work competing for CPU while the long spec runs would move the wall clock
with nothing whatsoever being slower.

That splits into two measurable parts, which is what this reports:

    wall ≈ start_offset + in_suite_duration + teardown
           ^^^^^^^^^^^^   ^^^^^^^^^^^^^^^^
           when the long   how long it takes
           spec is picked  once it is running
           up by a worker  (rate gates + contention)

Playwright's JSON reporter carries `startTime` and `duration` per test result,
so both fall straight out of one run per tree. One run each, not a median:
this is a decomposition, not a precision measurement — the standalone numbers
above already establish the spec's own variance, and what is being asked here
is which BUCKET the seconds are in.

    python3 scripts/time-suite-critical-path.py \\
        --other /path/to/worktree/ShowAllEntityData \\
        --label-self 9.99.1142 --label-other 9.99.1139 \\
        --slowest rel-auto-retry-failed --out scratch/critical-path.json
"""

import argparse
import datetime as dt
import json
import os
import platform
import re
import socket
import subprocess
import sys
import tempfile
import time

VERSION_RE = re.compile(r'^// @version\s+(\S+)', re.M)


def script_version(tree):
    with open(os.path.join(tree, 'ShowAllEntityData.user.js'), encoding='utf-8') as fh:
        m = VERSION_RE.search(fh.read(4096))
    return m.group(1) if m else 'unknown'


def machine_block():
    block = {'hostname': socket.gethostname(), 'cores': os.cpu_count(),
             'platform': platform.platform()}
    try:
        with open('/proc/uptime', encoding='utf-8') as fh:
            block['uptimeHours'] = round(float(fh.read().split()[0]) / 3600, 2)
    except OSError:
        pass
    return block


def _iter_tests(node):
    """Yield every test in Playwright's nested JSON suite tree."""
    for suite in node.get('suites', []) or []:
        yield from _iter_tests(suite)
    for spec in node.get('specs', []) or []:
        for test in spec.get('tests', []) or []:
            yield spec, test


def parse_report(path):
    """{wall, tests, slowest-spec facts} from one Playwright JSON report."""
    with open(path, encoding='utf-8') as fh:
        data = json.load(fh)

    rows = []
    for suite in data.get('suites', []):
        for spec, test in _iter_tests(suite):
            for res in test.get('results', []):
                if not res.get('startTime'):
                    continue
                start = dt.datetime.fromisoformat(
                    res['startTime'].replace('Z', '+00:00'))
                rows.append({
                    'file': suite.get('file') or spec.get('file', ''),
                    'title': spec.get('title', ''),
                    'start': start,
                    'duration_s': (res.get('duration') or 0) / 1000.0,
                })
    if not rows:
        return None
    t0 = min(r['start'] for r in rows)
    for r in rows:
        r['offset_s'] = (r['start'] - t0).total_seconds()
    return rows


def per_file(rows, needle):
    """Start offset, end offset and total in-suite duration for one spec file."""
    mine = [r for r in rows if needle in r['file']]
    if not mine:
        return None
    start = min(r['offset_s'] for r in mine)
    end = max(r['offset_s'] + r['duration_s'] for r in mine)
    return {
        'tests': len(mine),
        'start_offset_s': round(start, 2),
        'end_offset_s': round(end, 2),
        'span_s': round(end - start, 2),
        'sum_duration_s': round(sum(r['duration_s'] for r in mine), 2),
    }


def run_suite(tree, report_path):
    started = time.time()
    t0 = time.monotonic()
    env = dict(os.environ, PLAYWRIGHT_JSON_OUTPUT_NAME=report_path)
    done = subprocess.run(
        ['npx', 'playwright', 'test', '--project=chromium-fixtures',
         '--reporter=json'],
        cwd=tree, capture_output=True, text=True, env=env)
    return {
        'wall_s': round(time.monotonic() - t0, 2),
        'exit': done.returncode,
        'startedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(started)),
        'stderr_tail': done.stderr.strip().splitlines()[-3:],
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--other', required=True)
    ap.add_argument('--self', dest='self_tree', default=None)
    ap.add_argument('--label-self', default='self')
    ap.add_argument('--label-other', default='other')
    ap.add_argument('--slowest', default='rel-auto-retry-failed')
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    self_tree = args.self_tree or os.path.dirname(
        os.path.dirname(os.path.abspath(__file__)))
    arms = [(args.label_self, self_tree), (args.label_other, args.other)]

    record = {'_meta': {
        'question': ('the test:full step is not in rel-auto-retry-failed '
                     '(294.54 vs 294.70 s standalone). Is it that spec\'s '
                     'START OFFSET, its in-suite DURATION under contention, '
                     'or neither?'),
        'machine': machine_block(),
        'slowest': args.slowest,
        'startedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    }, 'arms': []}

    tmpdir = tempfile.mkdtemp(prefix='critpath-')
    for label, tree in arms:
        report = os.path.join(tmpdir, f'{label}.json')
        print(f'[{label}] {script_version(tree)} — running full suite …', flush=True)
        res = run_suite(tree, report)
        rows = parse_report(report) if os.path.exists(report) else None
        arm = {'label': label, 'tree': tree, 'version': script_version(tree),
               'run': res,
               'tests': len(rows) if rows else 0,
               'slowest': per_file(rows, args.slowest) if rows else None}
        if rows:
            last = max(rows, key=lambda r: r['offset_s'] + r['duration_s'])
            arm['last_to_finish'] = {
                'file': os.path.basename(last['file']),
                'end_offset_s': round(last['offset_s'] + last['duration_s'], 2),
            }
        record['arms'].append(arm)
        s = arm['slowest']
        print(f'[{label}] wall {res["wall_s"]} s, {arm["tests"]} test results'
              + (f', {args.slowest}: starts +{s["start_offset_s"]} s, '
                 f'spans {s["span_s"]} s, ends +{s["end_offset_s"]} s'
                 if s else f', {args.slowest} NOT FOUND'), flush=True)
        with open(args.out, 'w', encoding='utf-8') as fh:
            json.dump(record, fh, indent=2)

    print('\n== SUMMARY ==', flush=True)
    for arm in record['arms']:
        s = arm['slowest'] or {}
        print(f'  {arm["label"]:<12} wall {arm["run"]["wall_s"]:>7.2f} s  '
              f'{arm["tests"]:>4} results  '
              f'start +{s.get("start_offset_s", 0):>6.2f}  '
              f'span {s.get("span_s", 0):>7.2f}  '
              f'end +{s.get("end_offset_s", 0):>7.2f}')
    if len(record['arms']) == 2:
        a, b = record['arms']
        sa, sb = a['slowest'] or {}, b['slowest'] or {}
        print(f'\n  wall        {a["run"]["wall_s"] - b["run"]["wall_s"]:+.2f} s')
        print(f'  start off.  {sa.get("start_offset_s", 0) - sb.get("start_offset_s", 0):+.2f} s'
              '   <- when a worker picked the long spec up')
        print(f'  span        {sa.get("span_s", 0) - sb.get("span_s", 0):+.2f} s'
              '   <- how long it took once running (gates + contention)')
    print(f'\nwrote {args.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
