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
      "edits":  [{"find": "exact text", "replace": "exact text"}, ...],
      "spec":   "tests/fixtures/some.spec.js",
      "grep":   "substring of the test title (Playwright -g)",
      "expect": "fail" | "pass"
    }

`expect: "pass"` is for recording a KNOWN overlap honestly — a guard whose
removal the spec cannot see because another guard covers for it.

Safety:
  - every `find` must occur EXACTLY once, or that mutation is reported as
    ERROR and not run;
  - the original file is copied to `<userscript>.mutation-backup` first, and the
    run refuses to start if that backup already exists (a previous run died
    mid-mutation — inspect and restore it by hand);
  - the original is restored in a `finally` after every mutation, and its
    SHA-256 is verified against the pre-run hash at the very end.

usage:
  python3 scripts/mutation-check.py scripts/mutations/rel-column-fetch-failure.json
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
USERSCRIPT = os.path.join(ROOT, 'ShowAllEntityData.user.js')
BACKUP = USERSCRIPT + '.mutation-backup'


def sha256(path):
    """Hex SHA-256 of a file."""
    with open(path, 'rb') as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def run_spec(spec, grep):
    """Runs one spec filtered by title; returns (passed, tail_of_output)."""
    cmd = ['npx', 'playwright', 'test', spec, '--project=chromium-fixtures',
           '--reporter=line', '--workers=1', '-g', grep]
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    out = (proc.stdout or '') + (proc.stderr or '')
    lines = [ln for ln in out.splitlines() if ln.strip()]
    first_error = next((ln.strip() for ln in lines if ln.strip().startswith('Error:')), '')
    return proc.returncode == 0, first_error or (lines[-1].strip() if lines else '')


def main():
    """Applies each mutation in turn, runs its spec, restores, and summarises."""
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    with open(sys.argv[1], encoding='utf-8') as fh:
        mutations = json.load(fh)

    if os.path.exists(BACKUP):
        print(f'REFUSING TO RUN: {BACKUP} exists — a previous run did not finish. '
              'Compare it with the userscript and restore by hand.')
        return 2

    original_hash = sha256(USERSCRIPT)
    shutil.copyfile(USERSCRIPT, BACKUP)
    with open(BACKUP, encoding='utf-8') as fh:
        original = fh.read()

    results = []
    try:
        for m in mutations:
            name = m['name']
            text = original
            problem = ''
            for e in m['edits']:
                count = text.count(e['find'])
                if count != 1:
                    problem = f'find text occurs {count} times (must be exactly 1): {e["find"][:80]!r}'
                    break
                text = text.replace(e['find'], e['replace'], 1)
            if problem:
                results.append((name, m['expect'], 'ERROR', problem))
                print(f'[{name}] ERROR — {problem}', flush=True)
                continue

            started = time.time()
            try:
                with open(USERSCRIPT, 'w', encoding='utf-8') as fh:
                    fh.write(text)
                passed, detail = run_spec(m['spec'], m['grep'])
            finally:
                shutil.copyfile(BACKUP, USERSCRIPT)
            actual = 'pass' if passed else 'fail'
            verdict = 'OK' if actual == m['expect'] else 'UNEXPECTED'
            results.append((name, m['expect'], actual, verdict if verdict == 'UNEXPECTED' else detail))
            print(f'[{name}] expected {m["expect"]}, got {actual} — {verdict} '
                  f'({time.time() - started:.0f}s) {detail}', flush=True)
    finally:
        shutil.copyfile(BACKUP, USERSCRIPT)
        restored_ok = sha256(USERSCRIPT) == original_hash
        if restored_ok:
            os.remove(BACKUP)

    print('\n== SUMMARY ==')
    unexpected = 0
    for name, expect, actual, detail in results:
        flag = 'OK' if actual == expect else 'UNEXPECTED'
        if flag != 'OK':
            unexpected += 1
        print(f'{flag:>10}  {name:<44} expected {expect:<4} got {actual:<5} {detail}')
    print(f'userscript restored and verified: {restored_ok}')
    if not restored_ok:
        print(f'!!! HASH MISMATCH — backup kept at {BACKUP}')
        return 3
    return 1 if unexpected else 0


if __name__ == '__main__':
    sys.exit(main())
