#!/usr/bin/env python3
"""Mutation self-test for audit-changelog.py and audit-docs.py.

An audit that cannot be made to fail is not an audit, and these two guard
against defects that produce no runtime symptom at all — a changelog entry
dated wrong, a doc paragraph that stopped being true. Nothing else would
notice if a refactor quietly broke one of their checks, so each check is
exercised here against a planted defect in a scratch COPY of the real files.

This is the same discipline `scripts/mutation-check.py` applies to the
userscript: plant one defect, assert the guard trips, and assert it trips on
the RIGHT thing rather than merely failing. The real tree is never modified.

    python3 scripts/selftest-audits.py

Exits non-zero if any mutation behaves other than predicted.
"""

import json
import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
CHANGELOG = 'ShowAllEntityData_CHANGELOG.json'
USERSCRIPT = 'ShowAllEntityData.user.js'
PERF = 'PERFORMANCE.org'
GUIDE = 'CLAUDE.md'


class Case:
    """One planted defect and what the audit must say about it."""

    def __init__(self, name, audit, files, expect_fail, needle=None):
        self.name = name
        self.audit = audit
        self.files = files
        self.expect_fail = expect_fail
        self.needle = needle


def run_audit(script, work):
    done = subprocess.run([sys.executable, str(ROOT / 'scripts' / script),
                           '--project-dir', str(work)],
                          capture_output=True, text=True)
    return done.returncode, (done.stdout + done.stderr).strip()


def sub_once(path, old, new):
    """Replace `old` exactly once, or fail loudly.

    A find that matches twice, or not at all, means the file moved under the
    test and the 'defect' may never have been planted — the same rule
    mutation-check.py enforces on the userscript.
    """
    text = path.read_text(encoding='utf-8')
    hits = text.count(old)
    if hits != 1:
        raise SystemExit(f'selftest: pattern matched {hits} times, want exactly 1: {old!r}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')


def edit_json(path, mutate):
    data = json.loads(path.read_text(encoding='utf-8'))
    mutate(data)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def cases():
    """Every check in both audits, as (name, audit, planting function)."""
    return [
        # --- audit-changelog.py ------------------------------------------
        ('changelog: unmutated copy passes', 'audit-changelog.py',
         [CHANGELOG, USERSCRIPT], lambda w: None, False, None),

        ('changelog: newest entry keeps its authoring date', 'audit-changelog.py',
         [CHANGELOG, USERSCRIPT],
         lambda w: edit_json(w / CHANGELOG,
                             lambda d: d[0].__setitem__('date', '2000-01-01')),
         True, 'is not the ship date'),

        ('changelog: header names a version the changelog lacks', 'audit-changelog.py',
         [CHANGELOG, USERSCRIPT],
         lambda w: sub_once(w / USERSCRIPT, header_version(w), bumped_header(w)),
         True, 'but ShowAllEntityData.user.js says'),

        ('changelog: a NEW date inversion', 'audit-changelog.py',
         [CHANGELOG, USERSCRIPT],
         lambda w: edit_json(w / CHANGELOG,
                             lambda d: d[3].__setitem__('date', '2000-01-01')),
         True, 'older than'),

        ('changelog: a duplicate version', 'audit-changelog.py',
         [CHANGELOG, USERSCRIPT],
         lambda w: edit_json(w / CHANGELOG,
                             lambda d: d[5].__setitem__('version', d[6]['version'])),
         True, 'appears 2 times'),

        ('changelog: a bare WIP.N left in prose', 'audit-changelog.py',
         [CHANGELOG, USERSCRIPT],
         lambda w: edit_json(w / CHANGELOG, plant_bare_wip),
         True, 'unrewritten cross-reference WIP.'),

        # --- audit-docs.py -----------------------------------------------
        ('docs: unmutated copy passes', 'audit-docs.py',
         [PERF, GUIDE], lambda w: None, False, None),

        ('docs: DONE-set sentence omits a DONE step', 'audit-docs.py',
         [PERF, GUIDE],
         lambda w: sub_once(w / PERF, '34, 35 and 36.', '34 and 35.'),
         True, 'DONE but not listed: 36'),

        ('docs: a keyword reverted without the sentence', 'audit-docs.py',
         [PERF, GUIDE],
         lambda w: sub_once(w / PERF, '*** DONE Step 35:', '*** TODO Step 35:'),
         True, 'listed but not DONE: 35'),

        ('docs: a DONE step whose body still says "Still TODO"', 'audit-docs.py',
         [PERF, GUIDE],
         lambda w: sub_once(w / PERF, '**** The perf gate: measured',
                            '**** Status\n\nStill TODO on ~main~.\n\n**** The perf gate: measured'),
         True, 'is DONE but its body still says'),

        ('docs: an IN PROGRESS section naming a branch that is gone', 'audit-docs.py',
         [PERF, GUIDE],
         lambda w: sub_once(w / GUIDE, '## Common pitfalls',
                            '## IN PROGRESS: something (branch `a-branch-that-was-deleted`)\n\n'
                            '## Common pitfalls'),
         True, 'no longer exists'),
    ]


def header_version(work):
    for line in (work / USERSCRIPT).read_text(encoding='utf-8').splitlines():
        if line.startswith('// @version'):
            return line
    raise SystemExit('selftest: no @version line in the userscript copy')


def bumped_header(work):
    line = header_version(work)
    version = line.split()[-1]
    number, _, stamp = version.partition('+')
    major, minor, patch = number.split('.')
    return line.replace(version, f'{major}.{minor}.{int(patch) + 1}+{stamp}')


def plant_bare_wip(data):
    section = data[0]['sections'][0]
    items = section['items']
    items[0] = items[0] + ' Same root cause as WIP.3.'


def main():
    results = []
    for name, audit, files, plant, expect_fail, needle in cases():
        with tempfile.TemporaryDirectory() as tmp:
            work = pathlib.Path(tmp)
            for f in files:
                shutil.copy(ROOT / f, work / f)
            plant(work)
            code, out = run_audit(audit, work)
            if expect_fail:
                ok = code != 0 and (needle is None or needle in out)
            else:
                ok = code == 0
            last = out.splitlines()[-1].strip() if out else '(no output)'
            results.append((name, ok, expect_fail, last))

    width = max(len(n) for n, _, _, _ in results)
    failed = 0
    for name, ok, expect_fail, last in results:
        if not ok:
            failed += 1
        want = 'must FAIL' if expect_fail else 'must PASS'
        print(f'{"ok  " if ok else "MISS"}  {name:<{width}}  {want}')
        print(f'        {last[:140]}')

    print()
    if failed:
        print(f'{failed} of {len(results)} mutations did NOT behave as predicted')
        return 1
    print(f'all {len(results)} mutations behaved as predicted')
    return 0


if __name__ == '__main__':
    sys.exit(main())
