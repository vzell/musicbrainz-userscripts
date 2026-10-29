#!/usr/bin/env python3
"""Run `npm run test:full` (or another test script) and publish its progress for the Claude Code status line.

Usage (from ShowAllEntityData/):

    python3 scripts/run-test-full.py [--script NAME] [--log PATH] [-- extra playwright args]

`--script` names the npm script to run, `test:full` by default (the merge
gate). Any `test…` script of package.json works — `test` while developing,
`test:mobile`, … (vzell, 2026-10-29: every suite run is followed in the
status line, not only the merge gate).

The run's output is passed through unchanged (and copied to --log when given).
Alongside it, this script keeps a small JSON status file that
~/.claude/statusline.sh reads, so the prompt's status line shows

    🧪 <script> · <host> · <branch>@<sha> · since HH:MM:SS CEST · done/total · ETA ~HH:MM CEST

while the suite runs, and the result for an hour afterwards.

Times are Berlin time (Europe/Berlin, CET/CEST; CLAUDE.md, "Time zone:
Europe/Berlin"): stored as ISO 8601 with the offset
(`2026-10-15T07:24:28+02:00`), printed as `07:24:28 CEST`. Arithmetic is
done in UTC and only the result is converted, so an ETA that crosses a clock
change is still right. Older status/history files hold `…Z` stamps;
statusline.sh reads both.

Status file: ~/.cache/sa-test-full/status.json (one per user; the newest run
wins; its `script` field names what ran). Per-host, per-script history:
~/.cache/sa-test-full/last-<host>.json for test:full (the name it always had),
last-<host>-<script>.json for the others (`:` becomes `-`), holding the
previous complete run's wall clock and test count; the ETA is that wall clock
scaled by this run's test count (CLAUDE.md, "Testing (Playwright)"). A run of
one script never sets another's baseline: `test` skips the two @slow specs, so
its minutes say nothing about test:full's. Without a history file the status
line extrapolates from progress and marks the ETA "(extrapolated)".

The announcement line CLAUDE.md asks for ("The suite started at … on …, on …
at …, probably around …") is printed as soon as Playwright reports its test
count, prefixed with "[run-test-full]".

Exit status is npm's.
"""

import argparse
import datetime
import json
import os
import re
import socket
import subprocess
import sys
import time
import zoneinfo

BERLIN = zoneinfo.ZoneInfo('Europe/Berlin')
STATE_DIR = os.path.expanduser('~/.cache/sa-test-full')
STATUS_PATH = os.path.join(STATE_DIR, 'status.json')

RUNNING_RE = re.compile(r'Running (\d+) tests? using (\d+) workers?')
RESULT_RE = re.compile(r'^\s+([✓✘-])\s+\d+\s+\[')
SUMMARY_RE = re.compile(r'^\s+(\d+) (passed|failed|flaky|skipped|did not run|interrupted)\b')


def utc_now():
    """Return the current time as an aware UTC datetime, whole seconds."""
    return datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)


def iso(dt):
    """Format an aware datetime in Berlin time as `YYYY-MM-DDTHH:MM:SS+HH:MM`."""
    return dt.astimezone(BERLIN).isoformat(timespec='seconds')


def hms(dt, seconds=True):
    """Format an aware datetime as Berlin wall time plus zone, e.g. `07:24:28 CEST`."""
    return dt.astimezone(BERLIN).strftime('%H:%M:%S %Z' if seconds else '%H:%M %Z')


def git(*args):
    """Return the stripped stdout of a git command, or 'unknown' on failure."""
    try:
        return subprocess.run(['git', *args], capture_output=True, text=True,
                              check=True).stdout.strip() or 'unknown'
    except (OSError, subprocess.CalledProcessError):
        return 'unknown'


def write_status(status):
    """Atomically replace the status file with `status` (a dict)."""
    os.makedirs(STATE_DIR, exist_ok=True)
    tmp = STATUS_PATH + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        json.dump(status, fh, indent=2)
    os.replace(tmp, STATUS_PATH)


def history_path(host, script):
    """Return the ETA-baseline file of `script` on `host` (test:full keeps its old name)."""
    suffix = '' if script == 'test:full' else '-' + script.replace(':', '-')
    return os.path.join(STATE_DIR, f'last-{host}{suffix}.json')


def load_history(host, script):
    """Return the host's last complete run of `script` ({'wall_s', 'tests', 'finished'}) or None."""
    try:
        with open(history_path(host, script), encoding='utf-8') as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def save_history(host, script, wall_s, tests, finished):
    """Record a complete run of `script` as the host's ETA baseline for it."""
    os.makedirs(STATE_DIR, exist_ok=True)
    with open(history_path(host, script), 'w', encoding='utf-8') as fh:
        json.dump({'wall_s': wall_s, 'tests': tests, 'finished': finished}, fh, indent=2)


def npm_test_scripts():
    """Return the names of package.json's `test…` scripts (empty when it cannot be read)."""
    try:
        with open('package.json', encoding='utf-8') as fh:
            scripts = json.load(fh).get('scripts', {})
    except (OSError, ValueError):
        return []
    return sorted(k for k in scripts if k == 'test' or k.startswith('test:'))


def main():
    """Run the suite, stream its output, and keep the status file current."""
    ap = argparse.ArgumentParser(description=__doc__.split('\n', 1)[0])
    ap.add_argument('--script', default='test:full',
                    help='the npm test script to run (default: test:full, the merge gate)')
    ap.add_argument('--log', help='also copy the output to this file')
    ap.add_argument('extra', nargs='*', help='extra args after --, passed to playwright')
    opts = ap.parse_args()
    known = npm_test_scripts()
    if opts.script not in known:
        ap.error(f"--script {opts.script!r} is not a test script of package.json "
                 f"(run from ShowAllEntityData/): {', '.join(known) or 'none found'}")

    host = socket.gethostname()
    start = utc_now()
    status = {
        'state': 'running',
        'pid': os.getpid(),
        'script': opts.script,
        'host': host,
        'branch': git('branch', '--show-current'),
        'sha': git('rev-parse', '--short', 'HEAD'),
        'start': iso(start),
        'total': None,
        'workers': None,
        'passed': 0,
        'failed': 0,
        'skipped': 0,
        'eta': None,
        'eta_basis': None,
        'log': os.path.abspath(opts.log) if opts.log else None,
    }
    write_status(status)
    history = load_history(host, opts.script)

    log = open(opts.log, 'w', encoding='utf-8') if opts.log else None
    cmd = ['npm', 'run', opts.script] + (['--', *opts.extra] if opts.extra else [])
    header = (f"[run-test-full] start {iso(start)} script {opts.script} host {host} "
              f"branch {status['branch']} head {status['sha']}")
    for out in (sys.stdout, log):
        if out:
            print(header, file=out, flush=True)

    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, encoding='utf-8', errors='replace', bufsize=1)
    summary = {}
    last_write = 0.0
    for line in proc.stdout:
        sys.stdout.write(line)
        sys.stdout.flush()
        if log:
            log.write(line)
            log.flush()
        dirty = False
        m = RUNNING_RE.search(line)
        if m and status['total'] is None:
            status['total'] = int(m.group(1))
            status['workers'] = int(m.group(2))
            if history and history.get('tests'):
                eta_s = history['wall_s'] * status['total'] / history['tests']
                eta = start + datetime.timedelta(seconds=round(eta_s))
                status['eta'] = iso(eta)
                status['eta_basis'] = (f"last {opts.script} run on {host}: "
                                       f"{history['tests']} tests in {history['wall_s']} s")
                when = f"probably around {hms(eta, seconds=False)}"
            else:
                when = f"no recorded {opts.script} on {host}, so no ETA yet"
            msg = (f"[run-test-full] The suite started at {hms(start)} on "
                   f"{host}, on {status['branch']} at {status['sha']}: "
                   f"npm run {opts.script}, "
                   f"{status['total']} tests, {status['workers']} workers, {when}.")
            for out in (sys.stdout, log):
                if out:
                    print(msg, file=out, flush=True)
            dirty = True
        m = RESULT_RE.match(line)
        if m:
            key = {'✓': 'passed', '✘': 'failed', '-': 'skipped'}[m.group(1)]
            status[key] += 1
            dirty = True
        m = SUMMARY_RE.match(line)
        if m:
            summary[m.group(2)] = int(m.group(1))
        if dirty and time.monotonic() - last_write >= 1.0:
            write_status(status)
            last_write = time.monotonic()
    rc = proc.wait()

    finish = utc_now()
    wall_s = int((finish - start).total_seconds())
    status.update({
        'state': 'passed' if rc == 0 else 'failed',
        'exit': rc,
        'finish': iso(finish),
        'wall_s': wall_s,
        'summary': summary,
    })
    write_status(status)
    # A red run's wall clock is as good an ETA baseline as a green one; a
    # partial run (extra args) is not, and an aborted one has no summary.
    if not opts.extra and status['total'] and summary:
        save_history(host, opts.script, wall_s, status['total'], iso(finish))
    tail = (f"[run-test-full] exit {rc} finish {iso(finish)} wall {wall_s // 60} m "
            f"{wall_s % 60} s summary {json.dumps(summary)}")
    for out in (sys.stdout, log):
        if out:
            print(tail, file=out, flush=True)
    if log:
        log.close()
    return rc


if __name__ == '__main__':
    sys.exit(main())
