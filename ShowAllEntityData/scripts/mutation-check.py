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
      "grep":   "substring of the test title (Playwright -g)",
      "expect": "fail" | "pass"
    }

`expect: "pass"` is for recording a KNOWN overlap honestly — a guard whose
removal the spec cannot see because another guard covers for it.

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
DEFAULT_TARGET = 'ShowAllEntityData.user.js'
BACKUP_SUFFIX = '.mutation-backup'


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


def run_spec(spec, grep):
    """Runs one spec filtered by title.

    Returns `(passed, detail, selected)`. `selected` is False when Playwright
    matched NO test at all — which it reports by exiting non-zero, exactly as
    it does for a real assertion failure. Without that third value a stale or
    mistyped `grep` reads as "expected fail, got fail" and the mutation is
    scored OK while proving nothing. That is not hypothetical: on 2026-09-16 an
    entry whose test had been renamed reported OK with `Error: No tests found.`
    (see DEBUG-NOTES.md).
    """
    cmd = ['npx', 'playwright', 'test', spec, '--project=chromium-fixtures',
           '--reporter=line', '--workers=1', '-g', grep]
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    out = (proc.stdout or '') + (proc.stderr or '')
    lines = [ln for ln in out.splitlines() if ln.strip()]
    first_error = next((ln.strip() for ln in lines if ln.strip().startswith('Error:')), '')
    selected = 'no tests found' not in out.lower()
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
    try:
        for m in mutations:
            name = m['name']
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
                continue

            started = time.time()
            try:
                with open(paths[rel], 'w', encoding='utf-8') as fh:
                    fh.write(text)
                passed, detail, selected = run_spec(m['spec'], m['grep'])
            finally:
                restore_all()
            if not selected:
                problem = (f'grep selected NO tests: {m["grep"]!r} — fix the grep; '
                           'this result proves nothing either way')
                results.append((name, m['expect'], 'ERROR', problem))
                print(f'[{name}] ERROR — {problem}', flush=True)
                continue
            actual = 'pass' if passed else 'fail'
            verdict = 'OK' if actual == m['expect'] else 'UNEXPECTED'
            results.append((name, m['expect'], actual, verdict if verdict == 'UNEXPECTED' else detail))
            print(f'[{name}] expected {m["expect"]}, got {actual} — {verdict} '
                  f'({time.time() - started:.0f}s) {detail}', flush=True)
    finally:
        restore_all()
        bad = [rel for rel, p in paths.items() if sha256(p) != original_hash[rel]]
        restored_ok = not bad
        if restored_ok:
            for bak in backups.values():
                os.remove(bak)

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
