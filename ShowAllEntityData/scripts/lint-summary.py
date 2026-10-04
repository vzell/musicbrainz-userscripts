#!/usr/bin/env python3
"""Summarise ESLint results per file and per rule, and ratchet them.

ESLint is report-only in this project (see tests/README.org, section "Lint"):
`npm run lint` is not part of `npm test`/`test:full`. Raw output on the
userscript runs to thousands of lines, so this script folds it into counts
per (file, rule) and compares them with the committed baseline,
tests/lint-baseline.json. The baseline is what makes "do not add new lint
hits" checkable without first fixing every old one.

usage:
  python3 scripts/lint-summary.py                 # print totals per rule
  python3 scripts/lint-summary.py --examples RULE # list every location of RULE
  python3 scripts/lint-summary.py --write         # (re)write the baseline
  python3 scripts/lint-summary.py --check         # fail if any count went up

  --from FILE   read an existing `eslint -f json` result instead of running
                `npm run -s lint` (used by scripts/selftest-lint.py)

Exit status of --check: 0 when no (file, rule) count exceeds the baseline,
1 when one does (each is listed), 2 when ESLint itself could not run.
Counts that went DOWN are reported too, so the baseline can be lowered with
--write — it is a ratchet, so lower it whenever a fix lands.
"""
import argparse
import collections
import json
import os
import subprocess
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(PROJECT_ROOT)
BASELINE = os.path.join(PROJECT_ROOT, 'tests', 'lint-baseline.json')
PARSE_ERROR = '(parse-error)'
DIRECTIVE = '(eslint-directive)'


def run_eslint():
    """Run the project's `lint` npm script and return its parsed JSON report."""
    proc = subprocess.run(['npm', 'run', '-s', 'lint', '--', '-f', 'json'],
                          cwd=PROJECT_ROOT, capture_output=True, text=True)
    # ESLint exits 1 when it found errors, 2 when it could not run at all.
    if proc.returncode not in (0, 1) or not proc.stdout.strip():
        sys.stderr.write(proc.stderr or proc.stdout)
        sys.exit(2)
    return json.loads(proc.stdout)


def load_report(path):
    """Read an `eslint -f json` report from disk."""
    with open(path, encoding='utf8') as fh:
        return json.load(fh)


def eslint_version():
    """Return the installed ESLint version, or 'unknown'."""
    try:
        with open(os.path.join(PROJECT_ROOT, 'node_modules', 'eslint', 'package.json'), encoding='utf8') as fh:
            return json.load(fh)['version']
    except OSError:
        return 'unknown'


def fold(report):
    """Fold a report into {file: {rule: count}} plus {rule: [severity, [(file, line, msg)]]}."""
    counts = collections.defaultdict(collections.Counter)
    detail = {}
    for result in report:
        rel = os.path.relpath(result['filePath'], REPO_ROOT).replace(os.sep, '/')
        for msg in result['messages']:
            # A message with no ruleId is either a fatal parse error or a
            # report about an `eslint-disable` comment that no longer suppresses anything.
            rule = msg.get('ruleId') or (PARSE_ERROR if msg.get('fatal') else DIRECTIVE)
            counts[rel][rule] += 1
            entry = detail.setdefault(rule, [0, []])
            entry[0] = max(entry[0], msg.get('severity', 0))
            entry[1].append((rel, msg.get('line', 0), msg.get('message', '')))
    return counts, detail


def print_totals(counts, detail):
    """Print one line per rule: severity, total, and how many files it hits."""
    rows = []
    for rule, (sev, locs) in detail.items():
        files = len({f for f, _, _ in locs})
        rows.append((sev, len(locs), rule, files))
    rows.sort(key=lambda r: (-r[0], -r[1], r[2]))
    print(f'{"severity":<8} {"count":>7} {"files":>5}  rule')
    for sev, n, rule, files in rows:
        print(f'{"error" if sev == 2 else "warning":<8} {n:>7} {files:>5}  {rule}')
    total = sum(r[1] for r in rows)
    errors = sum(r[1] for r in rows if r[0] == 2)
    print(f'\n{total} problems ({errors} under error-level rules) in {len(counts)} files')


def print_examples(detail, rule):
    """Print every location of one rule as `file:line  message`."""
    if rule not in detail:
        print(f'no hits for {rule}')
        return
    for f, line, msg in sorted(detail[rule][1]):
        print(f'{f}:{line}  {msg}')


def write_baseline(counts):
    """Write the per-(file, rule) counts to tests/lint-baseline.json."""
    data = {
        'about': 'Per-file, per-rule ESLint counts. Written by scripts/lint-summary.py --write; '
                 'checked by --check, which fails if any count goes up. Lower it when a fix lands.',
        'eslint': eslint_version(),
        'counts': {f: dict(sorted(c.items())) for f, c in sorted(counts.items())},
    }
    with open(BASELINE, 'w', encoding='utf8') as fh:
        json.dump(data, fh, indent=2, sort_keys=False)
        fh.write('\n')
    print(f'wrote {os.path.relpath(BASELINE, PROJECT_ROOT)}: '
          f'{sum(sum(c.values()) for c in counts.values())} problems in {len(counts)} files')


def check_baseline(counts, baseline_path):
    """Compare counts with the baseline; return the process exit status."""
    with open(baseline_path, encoding='utf8') as fh:
        base = json.load(fh)['counts']
    worse, better = [], []
    for f in sorted(set(counts) | set(base)):
        now, was = counts.get(f, {}), base.get(f, {})
        for rule in sorted(set(now) | set(was)):
            n, b = now.get(rule, 0), was.get(rule, 0)
            if n > b:
                worse.append(f'  {f}  {rule}: {b} -> {n}')
            elif n < b:
                better.append(f'  {f}  {rule}: {b} -> {n}')
    if better:
        print('Below baseline (lower it with --write):')
        print('\n'.join(better))
    if worse:
        print('ABOVE baseline:')
        print('\n'.join(worse))
        return 1
    print('lint counts are within the baseline')
    return 0


def main():
    """Parse arguments and dispatch."""
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--from', dest='src', help='read this eslint -f json report instead of running ESLint')
    ap.add_argument('--baseline', default=BASELINE, help=argparse.SUPPRESS)
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument('--write', action='store_true')
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--examples', metavar='RULE')
    args = ap.parse_args()

    report = load_report(args.src) if args.src else run_eslint()
    counts, detail = fold(report)
    if args.write:
        write_baseline(counts)
    elif args.check:
        sys.exit(check_baseline(counts, args.baseline))
    elif args.examples:
        print_examples(detail, args.examples)
    else:
        print_totals(counts, detail)


if __name__ == '__main__':
    main()
