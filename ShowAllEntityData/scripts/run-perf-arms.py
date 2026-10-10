#!/usr/bin/env python3
"""Run interaction-perf arms one after another and publish progress for the status line.

Usage (from ShowAllEntityData/):

    python3 scripts/run-perf-arms.py artist-recordings-petty artist-recordings-petty-nocols
    python3 scripts/run-perf-arms.py artist-events --log /tmp/perf.log [-- --samples=3]

Each positional argument is a `--pageType=` of tests/support/capture-interaction-perf.js
(any registered descriptor, see tests/support/perfDescriptors.js); arguments
after `--` go to every run. The runs' output passes through unchanged (and is
copied to --log). Alongside, this keeps ~/.cache/sa-perf/status.json, which
~/.claude/statusline.sh reads, so the prompt's status line shows

    📈 perf · <host> · <branch>@<sha> · arm 1/2 artist-recordings-petty · sort 3/5 (14/30) · ETA ~HH:MM UTC

while the arms run, and a one-line result (each arm's wall clock) for an hour
afterwards. Progress inside an arm comes from the harness's own
SA_PERF_PROGRESS file (reportProgress() in capture-interaction-perf.js).

Per-host, per-arm history: ~/.cache/sa-perf/last-<host>-<arm>.json holds the
previous complete run's wall clock; the ETA sums it over the arms still to run.
Without history the ETA is extrapolated from the current arm's progress. A run
limited with `-- --only=typed` keeps its own history (`last-<host>-<arm>-typed.json`).

Exit status: the first failing run's, else 0.
"""

import argparse
import datetime
import json
import os
import socket
import subprocess
import sys
import threading
import time

STATE_DIR = os.path.expanduser('~/.cache/sa-perf')
STATUS_PATH = os.path.join(STATE_DIR, 'status.json')
PROGRESS_PATH = os.path.join(STATE_DIR, 'progress.json')


def utc_now():
    """The current time, aware UTC, whole seconds."""
    return datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)


def iso(dt):
    """`YYYY-MM-DDTHH:MM:SSZ`."""
    return dt.strftime('%Y-%m-%dT%H:%M:%SZ')


def git(*args):
    """Stripped stdout of a git command, or 'unknown'."""
    try:
        return subprocess.run(['git', *args], capture_output=True, text=True, check=True).stdout.strip()
    except Exception:                                        # noqa: BLE001
        return 'unknown'


def read_json(path):
    """A JSON file's content, or None."""
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception:                                        # noqa: BLE001
        return None


def write_status(status):
    """Atomically replaces the status file."""
    tmp = STATUS_PATH + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(status, f, indent=2)
    os.replace(tmp, STATUS_PATH)


def history_path(host, arm):
    """Where this host's last complete run of one arm is recorded."""
    return os.path.join(STATE_DIR, f'last-{host}-{arm}.json')


def history_name(arm, extra):
    """The history name of one arm: a run limited with `--only=` is its own kind.

    A typed run takes a fraction of a full run's time, so sharing one history
    would make every later ETA wrong in one direction or the other.
    """
    only = next((a.split('=', 1)[1] for a in extra if a.startswith('--only=')), '')
    return f'{arm}-{only}' if only else arm


def main():
    """Runs the arms, keeping the status file current."""
    argv = sys.argv[1:]
    extra = []
    if '--' in argv:
        i = argv.index('--')
        argv, extra = argv[:i], argv[i + 1:]
    ap = argparse.ArgumentParser()
    ap.add_argument('arms', nargs='+')
    ap.add_argument('--log', default='')
    args = ap.parse_args(argv)
    os.makedirs(STATE_DIR, exist_ok=True)
    host = socket.gethostname()
    status = {
        'state': 'running', 'pid': os.getpid(), 'host': host,
        'branch': git('branch', '--show-current'), 'sha': git('rev-parse', '--short', 'HEAD'),
        'start': iso(utc_now()), 'arms': args.arms, 'index': 0, 'arm': args.arms[0],
        'metric': '', 'step': 0, 'total': 0, 'sample': 0, 'samples': 0,
        'eta': None, 'results': [],
    }
    write_status(status)
    log = open(args.log, 'a', encoding='utf-8') if args.log else None
    print(f"[run-perf-arms] {len(args.arms)} arm(s) started at {status['start'][11:19]} UTC on {host}, "
          f"on {status['branch']} at {status['sha']}: {', '.join(args.arms)}", flush=True)
    exit_code = 0
    stop = threading.Event()

    def eta_for(index, arm_start):
        """Expected finish: the history of the arms left, else extrapolation."""
        hist = [read_json(history_path(host, history_name(a, extra))) for a in args.arms[index:]]
        if all(h and h.get('wall_s') for h in hist):
            return iso(arm_start + datetime.timedelta(seconds=sum(h['wall_s'] for h in hist)))
        prog = read_json(PROGRESS_PATH)
        if prog and prog.get('step') and prog.get('total'):
            spent = (utc_now() - arm_start).total_seconds()
            return iso(arm_start + datetime.timedelta(seconds=round(spent * prog['total'] / prog['step'])))
        return None

    for index, arm in enumerate(args.arms):
        arm_start = utc_now()
        try:
            os.remove(PROGRESS_PATH)
        except FileNotFoundError:
            pass
        status.update({'index': index, 'arm': arm, 'metric': '', 'step': 0, 'total': 0, 'sample': 0,
                       'arm_start': iso(arm_start), 'eta': eta_for(index, arm_start)})
        write_status(status)

        def poll():
            """Copies the harness's progress into the status file every 2 s."""
            while not stop.wait(2):
                prog = read_json(PROGRESS_PATH)
                if prog:
                    status.update({k: prog.get(k, status.get(k)) for k in ('metric', 'step', 'total', 'sample', 'samples')})
                    status['eta'] = eta_for(index, arm_start)
                    write_status(status)

        stop.clear()
        poller = threading.Thread(target=poll, daemon=True)
        poller.start()
        env = dict(os.environ, SA_PERF_PROGRESS=PROGRESS_PATH)
        proc = subprocess.Popen(['node', 'tests/support/capture-interaction-perf.js', f'--pageType={arm}', *extra],
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
        written = ''
        for line in proc.stdout:
            sys.stdout.write(line)
            sys.stdout.flush()
            if log:
                log.write(line)
            if line.startswith('Written to '):
                written = line[len('Written to '):].strip()
        proc.wait()
        stop.set()
        poller.join()
        wall = round((utc_now() - arm_start).total_seconds())
        status['results'].append({'arm': arm, 'exit': proc.returncode, 'wall_s': wall, 'file': written})
        if proc.returncode == 0:
            with open(history_path(host, history_name(arm, extra)), 'w', encoding='utf-8') as f:
                json.dump({'wall_s': wall, 'finished': iso(utc_now())}, f)
        elif not exit_code:
            exit_code = proc.returncode
        write_status(status)

    status.update({'state': 'passed' if not exit_code else 'failed', 'finish': iso(utc_now()),
                   'wall_s': round((utc_now() - datetime.datetime.strptime(status['start'], '%Y-%m-%dT%H:%M:%SZ')
                                    .replace(tzinfo=datetime.timezone.utc)).total_seconds())})
    write_status(status)
    if log:
        log.close()
    print(f"[run-perf-arms] done: " + ', '.join(f"{r['arm']} {r['wall_s']} s" for r in status['results']), flush=True)
    return exit_code


if __name__ == '__main__':
    sys.exit(main())
