"""Mutation-check Playwright specs against planted defects in the userscript.

CLAUDE.md requires every fix's regression test to be shown failing BEFORE the
fix, and each guard to be mutation-checked rather than assumed load-bearing.
Doing that by hand means editing ShowAllEntityData.user.js, running a spec and
reverting, several times over — slow, and one forgotten revert ships a defect.
This runs the whole list unattended and always restores the file.

A mutation file is JSON: a list of

    {
      "name":   "short label",
      "why":    "what this mutation removes, and what the spec should notice",
      "file":   "../lib/VZ_MBLibrary.user.js",   // optional; see below
      "edits":  [{"find": "exact text", "replace": "exact text"}, ...],
      "spec":   "tests/fixtures/some.spec.js",
      "project": "chromium-mobile",               // optional; see below
      "grep":   "substring of the test title (Playwright -g)",
      "expect": "fail" | "pass"
    }

`expect: "pass"` is for recording a KNOWN overlap honestly — a guard whose
removal the spec cannot see because another guard covers for it.

`project` is the Playwright project the spec runs in; it defaults to
`chromium-fixtures`. A `*.mobile.spec.js` needs `chromium-mobile`: the
fixtures project ignores those files, so without it the grep selects no test
and the entry is reported as ERROR.

`file` targets something other than the userscript, relative to
`ShowAllEntityData/`; it defaults to `ShowAllEntityData.user.js`. Two things
outside the userscript are real shipped behaviour the fixture harness exercises
and nothing else covers: `../lib/VZ_MBLibrary.user.js`, whose settings code has
no test harness of its own, and `tests/support/loadPage.js`, where a seeded GM
value can decide what a spec measures. Each target gets its own backup and its
own hash check.

Safety:
  - every `find` must occur EXACTLY once IN ITS OWN TARGET FILE, or that
    mutation is reported as ERROR and not run;
  - a `grep` that selects NO test is reported as ERROR as well, never as a
    failure — Playwright exits non-zero for "no tests found" exactly as it does
    for a real assertion failure, so without this a stale grep silently scores
    an `expect: "fail"` entry as OK while proving nothing;
  - every target file is copied to `<file>.mutation-backup` first, and the run
    refuses to start if any of those backups already exists (a previous run died
    mid-mutation — inspect and restore it by hand);
  - every target is restored in a `finally` after each mutation, and each one's
    SHA-256 is verified against its pre-run hash at the very end.

Each spec run stops at its first failing test (`--max-failures=1`,
2026-11-12): for an `expect: "fail"` entry one failure settles it, and a
mutation that breaks every test of a spec (a pageType that no longer
matches, so no button) cost one 90-second timeout per test before — the
Phase 9 list sat 11 minutes on its first entry. An `expect: "pass"` entry
still needs every selected test to pass, which the flag does not change.

Status line (2026-11-12, vzell: a mutation run did not show in the prompt
line): progress goes to ~/.cache/sa-mutation/status.json — the list, host,
branch@sha, start, done/total, OK / UNEXPECTED / ERROR counts, the mutation
running now, and at the end the finish, wall clock and whether every file was
restored. ~/.claude/statusline.sh shows it while the run lasts ("script
modified": the userscript holds a planted defect) and for an hour after, as
it does for scripts/run-test-full.py. Times are Berlin time with the offset.

usage:
  python3 scripts/mutation-check.py scripts/mutations/rel-column-fetch-failure.json
"""
import datetime
import hashlib
import json
import os
import shutil
import socket
import subprocess
import sys
import time
import zoneinfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
USERSCRIPT = os.path.join(ROOT, 'ShowAllEntityData.user.js')
DEFAULT_TARGET = 'ShowAllEntityData.user.js'
BACKUP_SUFFIX = '.mutation-backup'
DEFAULT_PROJECT = 'chromium-fixtures'
BERLIN = zoneinfo.ZoneInfo('Europe/Berlin')
STATUS_DIR = os.path.expanduser('~/.cache/sa-mutation')
STATUS_PATH = os.path.join(STATUS_DIR, 'status.json')


def berlin_now():
    """The current time, Berlin, whole seconds, as an aware datetime."""
    return datetime.datetime.now(BERLIN).replace(microsecond=0)


def git(*args):
    """Stripped stdout of a git command in the repo, or 'unknown'."""
    try:
        return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True,
                              check=True).stdout.strip() or 'unknown'
    except (OSError, subprocess.CalledProcessError):
        return 'unknown'


def write_status(status):
    """Atomically replace the status file the status line reads; never fatal."""
    try:
        os.makedirs(STATUS_DIR, exist_ok=True)
        tmp = STATUS_PATH + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as fh:
            json.dump(status, fh, indent=2)
        os.replace(tmp, STATUS_PATH)
    except OSError:
        pass


def target_path(rel):
    """Absolute path of a mutation target, which must stay inside the repo."""
    path = os.path.normpath(os.path.join(ROOT, rel))
    repo = os.path.dirname(ROOT)
    if not path.startswith(repo + os.sep):
        raise ValueError(f'mutation target escapes the repository: {rel!r}')
    return path


def sha256(path):
    """Hex SHA-256 of a file."""
    with open(path, 'rb') as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def run_spec(spec, grep, project=DEFAULT_PROJECT):
    """Runs one spec filtered by title, in Playwright project `project`.

    Returns `(passed, detail, selected)`. `selected` is False when Playwright
    matched NO test at all — which it reports by exiting non-zero, exactly as
    it does for a real assertion failure. Without that third value a stale or
    mistyped `grep` reads as "expected fail, got fail" and the mutation is
    scored OK while proving nothing. That is not hypothetical: on 2026-09-16 an
    entry whose test had been renamed reported OK with `Error: No tests found.`
    (see DEBUG-NOTES.md). The same for a `grep` that is no valid regular
    expression (an unclosed "(" in a test title, 2026-11-03): Playwright
    then runs nothing and exits non-zero with "SyntaxError: Invalid regular
    expression", which four entries scored as OK.
    """
    cmd = ['npx', 'playwright', 'test', spec, f'--project={project}',
           '--reporter=line', '--workers=1', '--max-failures=1', '-g', grep]
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    out = (proc.stdout or '') + (proc.stderr or '')
    lines = [ln for ln in out.splitlines() if ln.strip()]
    first_error = next((ln.strip() for ln in lines if ln.strip().startswith('Error:')), '')
    selected = 'no tests found' not in out.lower() and 'invalid regular expression' not in out.lower()
    return proc.returncode == 0, first_error or (lines[-1].strip() if lines else ''), selected


def main():
    """Applies each mutation in turn, runs its spec, restores, and summarises."""
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    with open(sys.argv[1], encoding='utf-8') as fh:
        mutations = json.load(fh)

    # Every file any mutation names, backed up once for the whole run.
    targets = sorted({m.get('file', DEFAULT_TARGET) for m in mutations} |
                     {DEFAULT_TARGET})
    paths = {rel: target_path(rel) for rel in targets}
    backups = {rel: p + BACKUP_SUFFIX for rel, p in paths.items()}

    for rel, bak in backups.items():
        if os.path.exists(bak):
            print(f'REFUSING TO RUN: {bak} exists — a previous run did not finish. '
                  f'Compare it with {rel} and restore by hand.')
            return 2

    original_hash = {rel: sha256(p) for rel, p in paths.items()}
    original = {}
    for rel, p in paths.items():
        shutil.copyfile(p, backups[rel])
        with open(backups[rel], encoding='utf-8') as fh:
            original[rel] = fh.read()

    def restore_all():
        for rel, p in paths.items():
            shutil.copyfile(backups[rel], p)

    results = []
    start = berlin_now()
    status = {
        'state': 'running', 'pid': os.getpid(), 'list': os.path.basename(sys.argv[1]),
        'host': socket.gethostname(), 'branch': git('branch', '--show-current'),
        'sha': git('rev-parse', '--short', 'HEAD'), 'start': start.isoformat(),
        'total': len(mutations), 'done': 0, 'ok': 0, 'unexpected': 0, 'error': 0,
        'current': None, 'finish': None, 'wall_s': None, 'restored': None,
    }
    write_status(status)

    def tally(verdict):
        """Count one finished mutation into the status file."""
        status['done'] += 1
        status[{'OK': 'ok', 'UNEXPECTED': 'unexpected'}.get(verdict, 'error')] += 1
        write_status(status)

    try:
        for m in mutations:
            name = m['name']
            status['current'] = name
            write_status(status)
            rel = m.get('file', DEFAULT_TARGET)
            text = original[rel]
            problem = ''
            for e in m['edits']:
                count = text.count(e['find'])
                if count != 1:
                    problem = (f'find text occurs {count} times in {rel} '
                               f'(must be exactly 1): {e["find"][:80]!r}')
                    break
                text = text.replace(e['find'], e['replace'], 1)
            if problem:
                results.append((name, m['expect'], 'ERROR', problem))
                print(f'[{name}] ERROR — {problem}', flush=True)
                tally('ERROR')
                continue

            started = time.time()
            try:
                with open(paths[rel], 'w', encoding='utf-8') as fh:
                    fh.write(text)
                passed, detail, selected = run_spec(m['spec'], m['grep'], m.get('project', DEFAULT_PROJECT))
            finally:
                restore_all()
            if not selected:
                problem = (f'grep selected NO tests: {m["grep"]!r} — fix the grep; '
                           'this result proves nothing either way')
                results.append((name, m['expect'], 'ERROR', problem))
                print(f'[{name}] ERROR — {problem}', flush=True)
                tally('ERROR')
                continue
            actual = 'pass' if passed else 'fail'
            verdict = 'OK' if actual == m['expect'] else 'UNEXPECTED'
            results.append((name, m['expect'], actual, verdict if verdict == 'UNEXPECTED' else detail))
            print(f'[{name}] expected {m["expect"]}, got {actual} — {verdict} '
                  f'({time.time() - started:.0f}s) {detail}', flush=True)
            tally(verdict)
    finally:
        restore_all()
        bad = [rel for rel, p in paths.items() if sha256(p) != original_hash[rel]]
        restored_ok = not bad
        if restored_ok:
            for bak in backups.values():
                os.remove(bak)
        finish = berlin_now()
        status.update({
            'state': 'passed' if restored_ok and not status['unexpected'] and not status['error']
                     and status['done'] == status['total'] else 'failed',
            'current': None, 'finish': finish.isoformat(),
            'wall_s': int((finish - start).total_seconds()), 'restored': 'yes' if restored_ok else 'NO',
        })
        write_status(status)

    print('\n== SUMMARY ==')
    unexpected = 0
    for name, expect, actual, detail in results:
        flag = 'OK' if actual == expect else 'UNEXPECTED'
        if flag != 'OK':
            unexpected += 1
        print(f'{flag:>10}  {name:<44} expected {expect:<4} got {actual:<5} {detail}')
    print(f'{len(paths)} file(s) restored and verified: {restored_ok}')
    if not restored_ok:
        for rel in bad:
            print(f'!!! HASH MISMATCH on {rel} — backup kept at {backups[rel]}')
        return 3
    return 1 if unexpected else 0


if __name__ == '__main__':
    sys.exit(main())
