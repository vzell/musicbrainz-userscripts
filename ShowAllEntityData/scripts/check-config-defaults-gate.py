"""Mutation-check scripts/audit-config-defaults.py — does each arm actually fail?

The audit is a gate, and a gate nobody has tried to get past is a decoration.
This is the same discipline scripts/mutation-check.py applies to the Playwright
specs: plant one defect at a time, assert the audit reaches the RIGHT verdict,
restore, verify the restore by SHA-256.

It has already earned its keep twice.

  - The ORPHAN arm — an inline read of a setting that no longer exists, i.e.
    what a rename leaves behind at a site someone missed — was written as a
    NOTE and exited 0. That is the worst form of F4's bug
    (`Lib.settings.sa_typo || 8` is always 8, silently and for ever), and it
    was promoted to a failure because this script found it green.
  - The version-stamp arm goes the other way: it asserts the audit does NOT
    fail when only `_meta.script_version` has moved. `merge-push-remove` bumps
    the version during its fold, AFTER the audit has run, so failing there
    would leave the gate red after every single merge — the state in which a
    gate stops being read.

It also caught two badly-chosen mutations of its own, which is worth knowing
before adding a case: `sa_enable_barcode_highlight` is never read WITH a
fallback, so renaming it proves nothing about an audit that only looks at
fallback sites. Pick an anchor the audit actually sees.

usage:
  python3 scripts/check-config-defaults-gate.py
"""
import hashlib
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIT = os.path.join(ROOT, 'scripts', 'audit-config-defaults.py')

# Every file a case may mutate is backed up and restored, not just the
# userscript: the FIXED arm can only be exercised by planting a stale entry in
# the baseline, since a clean tree has none to go stale.
TARGETS = {
    'userscript': os.path.join(ROOT, 'ShowAllEntityData.user.js'),
    'baseline': os.path.join(ROOT, 'scripts', 'config-fallback-drift-baseline.json'),
}

# (name, target, find, replace, expected verdict, what the audit must say).
# Every `find` must occur at least once; a missing anchor is reported as ERROR,
# never as a pass, for the same reason scripts/mutation-check.py refuses a
# stale grep.
CASES = [
    ('a schema default is changed without regenerating the snapshot',
     'userscript',
     'sa_uniq_dropdown_visible_rows: {\n            label: "Unique-Values Dropdown Visible Rows",'
     '\n            type: "number",\n            default: 30,',
     'sa_uniq_dropdown_visible_rows: {\n            label: "Unique-Values Dropdown Visible Rows",'
     '\n            type: "number",\n            default: 31,',
     'fail', 'stage 1: snapshot out of date'),

    ('a setting is renamed without regenerating the snapshot',
     'userscript',
     "        sa_enable_barcode_highlight: {",
     "        sa_enable_barcode_highlight_RENAMED: {",
     'fail', 'stage 1: label/shape changed'),

    ('a NEW drifting inline fallback is introduced',
     'userscript',
     "Lib.settings.sa_global_filter_highlight_bg || '#FFD700'",
     "Lib.settings.sa_global_filter_highlight_bg || '#ABCDEF'",
     'fail', 'stage 2: NEW drift'),

    ('a rename leaves an inline read pointing at a setting that no longer exists',
     'userscript',
     'Lib.settings.sa_caa_big_img_size || 250',
     'Lib.settings.sa_caa_big_img_size_ORPHANED || 250',
     'fail', 'stage 2: ORPHAN'),

    ('the baseline still lists a drift that has been fixed',
     'baseline',
     '"drifting": {}',
     '"drifting": {"sa_max_page": {"schema": 50, "inline": 99}}',
     'fail', 'stage 2: asks for a re-baseline'),

    ('the version is bumped but the snapshot is not regenerated',
     'userscript',
     '// @version      9.99.1136+2026-09-22',
     '// @version      9.99.9999+2026-09-22',
     'pass', 'stage 1: a NOTE, never a failure — see the module docstring'),
]


def sha256(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def run_audit():
    return subprocess.run([sys.executable, AUDIT],
                          capture_output=True, text=True, cwd=ROOT)


def main():
    backups = {name: path + '.gatecheck-backup' for name, path in TARGETS.items()}
    for name, bak in backups.items():
        if os.path.exists(bak):
            print(f'refusing to start: {bak} already exists — a previous run died '
                  f'mid-mutation. Inspect and restore it by hand.', file=sys.stderr)
            return 2

    originals = {name: sha256(path) for name, path in TARGETS.items()}
    for name, path in TARGETS.items():
        shutil.copy2(path, backups[name])
    results = []

    def restore():
        ok = True
        for name, path in TARGETS.items():
            shutil.copy2(backups[name], path)
            if sha256(path) != originals[name]:
                ok = False
        return ok

    try:
        base = run_audit()
        if base.returncode != 0:
            print('refusing to start: the audit is already failing on an '
                  'unmutated tree. Fix that first — every case below would '
                  '"fail" for the wrong reason.\n', file=sys.stderr)
            print(base.stdout + base.stderr, file=sys.stderr)
            return 2
        print('baseline: audit exits 0 on the unmutated tree')

        for name, target, find, replace, expect, note in CASES:
            path = TARGETS[target]
            src = open(path, encoding='utf-8').read()
            if find not in src:
                results.append(('ERROR', name, f'anchor not found in {target}'))
                continue
            open(path, 'w', encoding='utf-8').write(src.replace(find, replace, 1))
            try:
                res = run_audit()
            finally:
                if not restore():
                    print('RESTORE FAILED — stopping', file=sys.stderr)
                    return 2
            got = 'fail' if res.returncode != 0 else 'pass'
            results.append(('OK' if got == expect else 'WRONG VERDICT',
                            name, f'expected {expect}, got {got} — {note}'))
    finally:
        ok = restore()
        for bak in backups.values():
            if os.path.exists(bak):
                os.remove(bak)
        print(f'\nfiles restored and verified: {ok}')
        if not ok:
            return 2

    print('\n== SUMMARY ==')
    for verdict, name, detail in results:
        print(f'  {verdict:<14} {name}\n                 {detail}')

    bad = [r for r in results if r[0] != 'OK']
    if bad:
        print(f'\n{len(bad)} case(s) the audit gets wrong.', file=sys.stderr)
        return 1
    print(f'\nall {len(results)} cases correct.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
