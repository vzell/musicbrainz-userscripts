"""Mutation-check scripts/audit-config-defaults.py — does each arm actually fail?

The audit is a gate, and a gate nobody has tried to get past is a decoration.
This is the same discipline scripts/mutation-check.py applies to the Playwright
specs: plant one defect at a time, assert the audit NOTICES, restore, verify
the restore by SHA-256.

It has already earned its keep. The first run showed the ORPHAN arm — an inline
read of a setting that no longer exists, i.e. what a rename leaves behind at a
site someone missed — exiting 0, because that case was written as a NOTE rather
than a failure. That is the worst form of F4's bug (`Lib.settings.sa_typo || 8`
is always 8, silently and forever), and it was promoted to a failure because
this script found it green.

It also caught two badly-chosen mutations of its own, which is worth knowing
before adding a case: `sa_enable_barcode_highlight` is never read WITH a
fallback, so renaming it proves nothing about an audit that only looks at
fallback sites. Pick an anchor that the audit actually sees.

usage:
  python3 scripts/check-config-defaults-gate.py
"""
import hashlib
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
USERSCRIPT = os.path.join(ROOT, 'ShowAllEntityData.user.js')
BACKUP = USERSCRIPT + '.gatecheck-backup'
AUDIT = os.path.join(ROOT, 'scripts', 'audit-config-defaults.py')

# (name, find, replace, what the audit must say). Every `find` must occur at
# least once; a missing anchor is reported as ERROR, never as a pass, for the
# same reason scripts/mutation-check.py refuses a stale grep.
CASES = [
    ('a schema default is changed without regenerating the snapshot',
     'sa_uniq_dropdown_visible_rows: {\n            label: "Unique-Values Dropdown Visible Rows",'
     '\n            type: "number",\n            default: 30,',
     'sa_uniq_dropdown_visible_rows: {\n            label: "Unique-Values Dropdown Visible Rows",'
     '\n            type: "number",\n            default: 31,',
     'stage 1: snapshot out of date'),
    ('a NEW drifting inline fallback is introduced',
     "Lib.settings.sa_global_filter_highlight_bg || '#FFD700'",
     "Lib.settings.sa_global_filter_highlight_bg || '#ABCDEF'",
     'stage 2: NEW drift'),
    ('a rename leaves an inline read pointing at a setting that no longer exists',
     'Lib.settings.sa_caa_big_img_size || 250',
     'Lib.settings.sa_caa_big_img_size_ORPHANED || 250',
     'stage 2: ORPHAN'),
    ('a baselined drift is FIXED but the baseline is not updated',
     'Lib.settings.sa_uniq_dropdown_visible_rows) || 8',
     'Lib.settings.sa_uniq_dropdown_visible_rows) || 30',
     'stage 2: asks for a re-baseline'),
]


def sha256(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def run_audit():
    return subprocess.run([sys.executable, AUDIT],
                          capture_output=True, text=True, cwd=ROOT)


def main():
    if os.path.exists(BACKUP):
        print(f'refusing to start: {BACKUP} already exists — a previous run died '
              f'mid-mutation. Inspect and restore it by hand.', file=sys.stderr)
        return 2

    original = sha256(USERSCRIPT)
    shutil.copy2(USERSCRIPT, BACKUP)
    results = []

    try:
        base = run_audit()
        if base.returncode != 0:
            print('refusing to start: the audit is already failing on an '
                  'unmutated tree. Fix that first — every case below would '
                  '"fail" for the wrong reason.\n', file=sys.stderr)
            print(base.stdout + base.stderr, file=sys.stderr)
            return 2
        print('baseline: audit exits 0 on the unmutated tree')

        for name, find, replace, expect in CASES:
            src = open(USERSCRIPT, encoding='utf-8').read()
            if find not in src:
                results.append(('ERROR', name, 'anchor not found'))
                continue
            open(USERSCRIPT, 'w', encoding='utf-8').write(src.replace(find, replace, 1))
            try:
                res = run_audit()
            finally:
                shutil.copy2(BACKUP, USERSCRIPT)
                if sha256(USERSCRIPT) != original:
                    print('RESTORE FAILED — stopping', file=sys.stderr)
                    return 2
            verdict = 'OK' if res.returncode != 0 else 'NOT CAUGHT'
            results.append((verdict, name, expect))
    finally:
        shutil.copy2(BACKUP, USERSCRIPT)
        ok = sha256(USERSCRIPT) == original
        os.remove(BACKUP)
        print(f'\nuserscript restored and verified: {ok}')
        if not ok:
            return 2

    print('\n== SUMMARY ==')
    for verdict, name, expect in results:
        print(f'  {verdict:<11} {name}  [{expect}]')

    bad = [r for r in results if r[0] != 'OK']
    if bad:
        print(f'\n{len(bad)} case(s) the audit does not catch.', file=sys.stderr)
        return 1
    print(f'\nall {len(results)} cases caught.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
