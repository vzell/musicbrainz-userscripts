"""Mutation-check scripts/check-publish-ready.py against a scratch mirror.

Same discipline as scripts/check-config-defaults-gate.py: plant one defect at a
time, assert the checker reaches the RIGHT verdict, and never trust an arm
nobody has tried to get past.

It earned this immediately. The checker's first run reported three problems, of
which **one was real and two were its own**:

  - it called `SpringsteenCoverArtUploader` "live without the library it needs"
    — a script that does not `@require` VZ_MBLibrary at all and had simply not
    changed in three months. Version skew between a script and the dev library
    is the normal state, not a defect.
  - it read every `SpringsteenCoverArtUploader_CHANGELOG.json` entry as
    disagreeing with the script, because these projects do not agree on whether
    a changelog `version` carries the `+YYYY-MM-DD` suffix. Comparing one
    convention against the other flags everything.

Two false alarms in the first three findings is how a pre-publish check becomes
a thing people skip, which would leave the real finding — a published
`file://` `@require` — unnoticed for another eight months.

**The mirror is synthetic and lives in a temp directory.** Nothing here reads
or writes `/home/vzell/git/mb-userscripts`: mutating a real publish repo to
test a checker is exactly the kind of clever idea that ends with a bad push.
The scratch mirror is built from the dev repo's own files, with the library
`@require` rewritten the way a real publish does it, so the "clean" case
exercises the actual publish contract rather than a guess at it.

usage:
  python3 scripts/check-publish-ready-gate.py
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(ROOT)
CHECKER = os.path.join(ROOT, 'scripts', 'check-publish-ready.py')

NETWORK_LIB_URL = ('https://raw.githubusercontent.com/vzell/mb-userscripts/'
                   'master/lib/VZ_MBLibrary.user.js')

SAED = 'ShowAllEntityData.user.js'
SAED_CHANGELOG = 'ShowAllEntityData_CHANGELOG.json'
SAED_HELP = 'ShowAllEntityData_HELP.txt'


def build_mirror(dest):
    """A mirror as a correct publish would leave it: copy, rewrite one line."""
    os.makedirs(os.path.join(dest, 'lib'), exist_ok=True)
    shutil.copyfile(os.path.join(REPO, 'lib', 'VZ_MBLibrary.user.js'),
                    os.path.join(dest, 'lib', 'VZ_MBLibrary.user.js'))

    for name in (SAED, SAED_CHANGELOG, SAED_HELP):
        shutil.copyfile(os.path.join(ROOT, name), os.path.join(dest, name))

    path = os.path.join(dest, SAED)
    with open(path, encoding='utf-8') as fh:
        text = fh.read()
    text = re.sub(r'^// @require\s+\S*MBLibrary\S*\s*$',
                  f'// @require      {NETWORK_LIB_URL}', text, count=1, flags=re.M)
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(text)
    return dest


def patch(path, find, replace):
    with open(path, encoding='utf-8') as fh:
        text = fh.read()
    if text.count(find) < 1:
        raise AssertionError(f'anchor not found in {os.path.basename(path)}: {find[:60]!r}')
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(text.replace(find, replace, 1))


def bump_version(path, new_version):
    patch_re = re.compile(r'^(// @version\s+)(\S+)\s*$', re.M)
    with open(path, encoding='utf-8') as fh:
        text = fh.read()
    text = patch_re.sub(lambda m: f'{m.group(1)}{new_version}', text, count=1)
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(text)


# Each case mutates the scratch mirror and names the verdict expected.
# (label, mutate(mirror_dir), extra argv, expected exit code, what it pins)
CASES = [
    ('a correctly published mirror',
     lambda d: None, [], 0,
     'the publish contract itself — copy the file, rewrite the library @require'),

    ('a file:// @require in a published script',
     lambda d: patch(os.path.join(d, SAED), f'// @require      {NETWORK_LIB_URL}',
                     '// @require      file:///V:/home/vzell/git/x/lib/VZ_MBLibrary.user.js'),
     [], 1,
     'the failure the whole script exists for — silent, and found live once'),

    ('a published library @require pointing somewhere else entirely',
     lambda d: patch(os.path.join(d, SAED), f'// @require      {NETWORK_LIB_URL}',
                     '// @require      https://example.invalid/VZ_MBLibrary.user.js'),
     [], 1,
     'not file://, so the sweep misses it; the per-script URL check catches it'),

    ('a published copy that differs beyond the @require line',
     lambda d: patch(os.path.join(d, SAED), "'use strict';",
                     "'use strict'; /* stale publish */"),
     [], 1,
     'a partial or stale copy at the same version'),

    ('the published changelog disagrees with the published script',
     lambda d: bump_version(os.path.join(d, SAED), '9.99.9999+2026-01-01'),
     [], 1,
     'the in-script ChangeLog dialog would name a version nobody runs'),

    ('the published HELP is stale while the script is current',
     lambda d: patch(os.path.join(d, SAED_HELP), 'SAVE / LOAD CONFIGURATION',
                     'SAVE / LOAD CONFIGURATION (stale)'),
     [], 1,
     'the Help dialog fetches from the mirror, so it would serve the wrong text'),

    ('the library is missing from the mirror',
     lambda d: os.remove(os.path.join(d, 'lib', 'VZ_MBLibrary.user.js')),
     [], 1,
     'every consumer @require 404s'),

    ('the library differs at the same version',
     lambda d: patch(os.path.join(d, 'lib', 'VZ_MBLibrary.user.js'),
                     'const LIBRARY_VERSION', 'const X = 1; const LIBRARY_VERSION'),
     [], 1,
     'one side was edited without a bump'),

    ('the mirror is AHEAD of the dev repo',
     lambda d: bump_version(os.path.join(d, SAED), '99.99.9999+2026-01-01'),
     [], 1,
     'the dev repo is meant to be the source of truth'),

    ('the mirror is behind — the normal state between releases',
     lambda d: _put_behind(d),
     [], 0,
     'BEHIND IS NOT BROKEN. If this ever fails, the script has become a thing '
     'people skip, and the real findings go with it'),

    ('the same, under --strict',
     lambda d: _put_behind(d),
     ['--strict'], 1,
     'the run straight after publishing, where behind means the copy stopped '
     'half way'),
]


def _put_behind(d):
    """Make the mirror an older release: older script AND matching changelog."""
    bump_version(os.path.join(d, SAED), '9.99.1+2026-01-01')
    with open(os.path.join(d, SAED_CHANGELOG), encoding='utf-8') as fh:
        data = json.load(fh)
    data.insert(0, {'version': '9.99.1', 'date': '2026-01-01',
                    'sections': [{'label': '🐛 Fix', 'items': ['scratch']}]})
    # The mirror's own changelog must agree with its own script, or this case
    # would fail for a second reason and prove nothing about "behind".
    data = [e for e in data if e.get('version') == '9.99.1']
    with open(os.path.join(d, SAED_CHANGELOG), 'w', encoding='utf-8') as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)


def run_checker(mirror, extra):
    return subprocess.run([sys.executable, CHECKER, '--mirror', mirror] + extra,
                          capture_output=True, text=True, cwd=ROOT)


def main():
    if not os.path.isfile(CHECKER):
        print(f'missing {CHECKER}', file=sys.stderr)
        return 2

    results = []
    for label, mutate, extra, expected, pins in CASES:
        with tempfile.TemporaryDirectory(prefix='publish-gate-') as tmp:
            mirror = build_mirror(os.path.join(tmp, 'mirror'))
            try:
                mutate(mirror)
            except Exception as exc:                              # noqa: BLE001
                results.append(('ERROR', label, f'could not plant it: {exc}'))
                print(f'[{label}] ERROR — {exc}', flush=True)
                continue
            done = run_checker(mirror, extra)
            got = done.returncode
            verdict = 'OK' if got == expected else 'WRONG VERDICT'
            detail = f'expected exit {expected}, got {got} — {pins}'
            if verdict != 'OK':
                detail += '\n' + (done.stdout + done.stderr).strip()[:900]
            results.append((verdict, label, detail))
            print(f'[{label}] expected {expected}, got {got} — {verdict}', flush=True)

    print('\n== SUMMARY ==')
    for verdict, label, detail in results:
        print(f'  {verdict:<14} {label}\n                 {detail}')

    bad = [r for r in results if r[0] != 'OK']
    if bad:
        print(f'\n{len(bad)} case(s) the checker gets wrong.', file=sys.stderr)
        return 1
    print(f'\nall {len(results)} cases correct.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
