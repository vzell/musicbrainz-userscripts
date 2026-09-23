#!/usr/bin/env python3
"""Time one Playwright spec in two trees, INTERLEAVED, in a single session.

Written to answer one question recorded in `tests/MEASUREMENTS.org`: the
`test:full` wall clock stepped from 337-341 s to 344-347 s somewhere between
9.99.1139 and 9.99.1140, and nothing explains it. At 12 workers the suite's
wall clock is set by its longest single spec — `rel-auto-retry-failed`, ~324 s
— so the step is either inside that spec or in host conditions nothing
recorded. Those are distinguishable, and this distinguishes them.

**Interleaved, not batched, and that is the whole design.** A B A B A B rather
than A A A B B B: a machine that warms up, throttles, or picks up background
load over half an hour produces a monotonic drift that batching converts
straight into a fake version difference. Interleaving spreads any drift across
both arms. `MEASUREMENTS.org`'s own worked example is the 9.99.1045-vs-1048
gap, where a 2x "regression" turned out to be environment and could not be
attributed afterwards because nothing had recorded the host.

**Both arms in ONE session**, per `CLAUDE.md`: "Never quote an absolute across
versions or sessions — capture your own `main` arm alongside your branch's, in
one session."

The first run of each arm is a WARMUP and is discarded. Playwright's first
launch in a tree pays for browser start-up and module resolution that later
runs do not, and that cost lands on whichever arm happens to go first.

    python3 scripts/time-spec-across-versions.py \\
        --spec tests/fixtures/rel-auto-retry-failed.spec.js \\
        --other /path/to/worktree/ShowAllEntityData \\
        --label-self 9.99.1142 --label-other 9.99.1139 \\
        --samples 3 --out scratch/timings.json

Results are written after EVERY run, so a partial file is readable while the
thing is still going — 6 samples of a 5-minute spec is over half an hour.
"""

import argparse
import json
import os
import platform
import re
import socket
import statistics
import subprocess
import sys
import time

VERSION_RE = re.compile(r'^// @version\s+(\S+)', re.M)
# Playwright's own tail line, e.g. "14 passed (5.4m)".
SUMMARY_RE = re.compile(r'(\d+)\s+passed', re.M)


def script_version(tree):
    path = os.path.join(tree, 'ShowAllEntityData.user.js')
    with open(path, encoding='utf-8') as fh:
        head = fh.read(4096)
    m = VERSION_RE.search(head)
    return m.group(1) if m else 'unknown'


def machine_block():
    """Host facts, because a number with no machine attached is not evidence.

    `CLAUDE.md`: record the machine and the wall-clock time, every timing,
    every time. `uptimeHours` is here for the same reason the capture scripts
    carry it — host conditions that are not hardware but do move timings.
    """
    block = {
        'hostname': socket.gethostname(),
        'platform': platform.platform(),
        'cores': os.cpu_count(),
        'python': platform.python_version(),
    }
    try:
        with open('/proc/uptime', encoding='utf-8') as fh:
            block['uptimeHours'] = round(float(fh.read().split()[0]) / 3600, 2)
    except OSError:
        pass
    try:
        block['loadavg'] = [round(v, 2) for v in os.getloadavg()]
    except OSError:
        pass
    return block


def run_once(tree, spec, project):
    """One `npx playwright test` of one spec. Returns wall seconds + outcome."""
    started = time.time()
    t0 = time.monotonic()
    done = subprocess.run(
        ['npx', 'playwright', 'test', spec, f'--project={project}',
         '--reporter=line'],
        cwd=tree, capture_output=True, text=True)
    wall = time.monotonic() - t0
    out = done.stdout + done.stderr
    m = SUMMARY_RE.search(out)
    return {
        'wall_s': round(wall, 2),
        'passed': int(m.group(1)) if m else None,
        'exit': done.returncode,
        'startedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(started)),
        'tail': out.strip().splitlines()[-1] if out.strip() else '',
    }


def summarise(samples):
    """Median and spread of the kept (non-warmup) runs."""
    walls = [s['wall_s'] for s in samples if not s['warmup'] and s['exit'] == 0]
    if not walls:
        return {'n': 0}
    return {
        'n': len(walls),
        'median_s': round(statistics.median(walls), 2),
        'min_s': round(min(walls), 2),
        'max_s': round(max(walls), 2),
        'spread_pct': round((max(walls) - min(walls)) / statistics.median(walls) * 100, 2),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--spec', required=True)
    ap.add_argument('--other', required=True,
                    help="the OTHER tree's ShowAllEntityData directory")
    ap.add_argument('--self', dest='self_tree', default=None,
                    help='this tree (default: the script\'s own project dir)')
    ap.add_argument('--label-self', default='self')
    ap.add_argument('--label-other', default='other')
    ap.add_argument('--project', default='chromium-fixtures')
    ap.add_argument('--samples', type=int, default=3,
                    help='kept samples per arm, on top of one discarded warmup')
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    self_tree = args.self_tree or os.path.dirname(
        os.path.dirname(os.path.abspath(__file__)))
    arms = [
        {'label': args.label_self, 'tree': self_tree,
         'version': script_version(self_tree), 'samples': []},
        {'label': args.label_other, 'tree': args.other,
         'version': script_version(args.other), 'samples': []},
    ]

    record = {
        '_meta': {
            'question': ('does rel-auto-retry-failed itself account for the '
                         'test:full step from 337-341 s to 344-347 s between '
                         '9.99.1139 and 9.99.1140, or is it host conditions?'),
            'spec': args.spec,
            'project': args.project,
            'interleaved': True,
            'warmup_discarded': 1,
            'machine': machine_block(),
            'startedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        },
        'arms': arms,
    }

    def flush():
        record['_meta']['finishedAt'] = time.strftime(
            '%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        for arm in arms:
            arm['summary'] = summarise(arm['samples'])
        with open(args.out, 'w', encoding='utf-8') as fh:
            json.dump(record, fh, indent=2)

    for arm in arms:
        print(f"{arm['label']}: {arm['version']}  ({arm['tree']})", flush=True)
    flush()

    # Round 0 is the warmup; rounds 1..N are kept. Interleaved within a round.
    for rnd in range(args.samples + 1):
        warmup = (rnd == 0)
        for arm in arms:
            tag = 'warmup' if warmup else f'sample {rnd}/{args.samples}'
            print(f'[{arm["label"]}] {tag} …', flush=True)
            res = run_once(arm['tree'], args.spec, args.project)
            res['warmup'] = warmup
            res['round'] = rnd
            arm['samples'].append(res)
            print(f'[{arm["label"]}] {tag}: {res["wall_s"]} s '
                  f'({res["passed"]} passed, exit {res["exit"]})', flush=True)
            flush()

    print('\n== SUMMARY ==', flush=True)
    for arm in arms:
        s = arm['summary']
        if not s.get('n'):
            print(f'  {arm["label"]:<12} no usable samples')
            continue
        print(f'  {arm["label"]:<12} {arm["version"]:<22} '
              f'median {s["median_s"]} s  (n={s["n"]}, '
              f'{s["min_s"]}-{s["max_s"]}, spread {s["spread_pct"]}%)')

    a, b = arms
    if a['summary'].get('n') and b['summary'].get('n'):
        delta = a['summary']['median_s'] - b['summary']['median_s']
        pct = delta / b['summary']['median_s'] * 100
        print(f'\n  {a["label"]} - {b["label"]} = {delta:+.2f} s ({pct:+.2f}%)')
        worst = max(a['summary']['spread_pct'], b['summary']['spread_pct'])
        print(f'  within-arm spread is {worst:.2f}% — a difference smaller '
              'than that is not a difference')
    print(f'\nwrote {args.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
