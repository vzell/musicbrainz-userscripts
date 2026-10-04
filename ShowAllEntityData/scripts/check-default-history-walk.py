"""Regression test for scripts/dump-default-history.py's walk over merges.

Builds a scratch git repository in a temp directory — never this one — with
the smallest history that shows both defects fixed on 2026-10-04
(fix/default-history-merge-walk), runs the script against it black-box, and
checks the JSON it writes:

    M0  main     sa_k = false
    M1  main     sa_k = true
    B   branch   (from M0) adds sa_new = 5
    X   main     --no-ff merge of the branch: sa_k = true AND sa_new = 5

run twice, differing only in whether B or M1 is dated later:

  1. "main-last" (M1 after B) — `current` must be HEAD's schema. The old
     `git log --follow` walk left the merge X out, so its last revision was
     M1, and `sa_new` came out as an ORPHAN although HEAD has it. That is
     exactly how the sl-support merge made audit-config-defaults.py fail.
  2. "branch-last" (B after M1) — `changes` must hold sa_k false -> true ONCE.
     Date order walks M0, M1, B, so the old walk compared B with M1 and
     recorded a flip true -> false that no line of history ever made, and
     took `current` (sa_k = false) from B.

Every check runs in both scenarios; neither ordering may break any of them.

The script is copied into a fake `<tmp>/ShowAllEntityData/scripts/` layout,
since it locates the repository from its own path. `--script` points it at
another copy, which is how the "fails before" half is verified:

    git show <old-sha>:ShowAllEntityData/scripts/dump-default-history.py > /tmp/old.py
    python3 scripts/check-default-history-walk.py --script /tmp/old.py   # must FAIL

usage:
  python3 scripts/check-default-history-walk.py
  python3 scripts/check-default-history-walk.py --script OTHER_COPY.py
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = os.path.join(ROOT, 'scripts')
REL = 'ShowAllEntityData/ShowAllEntityData.user.js'


def userscript(version, schema_lines):
    """A minimal userscript the schema parser accepts."""
    body = '\n'.join(f'        {line}' for line in schema_lines)
    return (f'// ==UserScript==\n// @version      {version}\n// ==/UserScript==\n'
            f'(function() {{\n    const configSchema = {{\n{body}\n    }};\n}})();\n')


def git(repo, *args, date=None):
    """Run git in `repo`; `date` pins both author and committer dates."""
    env = dict(os.environ, GIT_AUTHOR_NAME='t', GIT_AUTHOR_EMAIL='t@t',
               GIT_COMMITTER_NAME='t', GIT_COMMITTER_EMAIL='t@t')
    if date:
        env['GIT_AUTHOR_DATE'] = env['GIT_COMMITTER_DATE'] = date
    return subprocess.run(['git', *args], cwd=repo, env=env, check=True,
                          capture_output=True, text=True).stdout


def commit(repo, text, msg, date):
    """Write the userscript and commit it."""
    with open(os.path.join(repo, REL), 'w', encoding='utf-8') as fh:
        fh.write(text)
    git(repo, 'add', REL)
    git(repo, 'commit', '-q', '-m', msg, date=date)


def build(repo, m1_date, b_date):
    """The M0 / M1 / B / X history described in the module docstring."""
    os.makedirs(os.path.join(repo, 'ShowAllEntityData'))
    git(repo, 'init', '-q', '-b', 'main')
    k_false = "sa_k: { type: 'checkbox', default: false },"
    k_true = "sa_k: { type: 'checkbox', default: true },"
    new = "sa_new: { type: 'number', default: 5 },"
    commit(repo, userscript('1.0.0+2026-01-01', [k_false]), 'M0', '2026-01-01T10:00:00')
    git(repo, 'branch', 'side')
    commit(repo, userscript('1.0.1+2026-01-02', [k_true]), 'M1', m1_date)
    git(repo, 'checkout', '-q', 'side')
    commit(repo, userscript('1.0.0+2026-01-01', [k_false, new]), 'B', b_date)
    git(repo, 'checkout', '-q', 'main')
    # Both sides edited the same lines, so resolve by hand like a real merge.
    subprocess.run(['git', 'merge', '--no-ff', '-q', 'side'], cwd=repo,
                   capture_output=True)
    commit(repo, userscript('1.0.2+2026-01-04', [k_true, new]), 'X', '2026-01-04T10:00:00')
    parents = git(repo, 'log', '-1', '--format=%P').split()
    assert len(parents) == 2, 'scenario broken: X is not a merge commit'


SCENARIOS = [
    ('main-last', '2026-01-03T10:00:00', '2026-01-02T10:00:00'),
    ('branch-last', '2026-01-02T10:00:00', '2026-01-03T10:00:00'),
]


def run(script, m1_date, b_date):
    """Build one scenario in a temp dir, run `script` on it, return its JSON."""
    tmp = tempfile.mkdtemp(prefix='default-history-walk-')
    try:
        repo = os.path.join(tmp, 'repo')
        os.makedirs(repo)
        build(repo, m1_date, b_date)
        fake = os.path.join(repo, 'ShowAllEntityData', 'scripts')
        os.makedirs(fake)
        shutil.copy(script, os.path.join(fake, 'dump-default-history.py'))
        shutil.copy(os.path.join(SCRIPTS, 'dump-config-defaults.py'), fake)
        out = os.path.join(tmp, 'history.json')
        subprocess.run([sys.executable, os.path.join(fake, 'dump-default-history.py'),
                        '--out', out], check=True, capture_output=True, text=True)
        with open(out, encoding='utf-8') as fh:
            return json.load(fh)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def check(data):
    """The four properties, as (name, ok, what was found)."""
    return [
        ('current is HEAD\'s schema (the merge, not an older revision)',
         data['current'] == {'sa_k': True, 'sa_new': 5}, data['current']),
        ('a setting present at HEAD is not an orphan',
         'sa_new' not in data['orphans'], sorted(data['orphans'])),
        ('the one real default change is recorded exactly once, and no reverse flip',
         [(c['key'], c['from'], c['to']) for c in data['changes']] == [('sa_k', False, True)],
         [(c['key'], c['from'], c['to']) for c in data['changes']]),
        ('stale names only the value that really shipped before',
         data['stale'] == {'sa_k': {'type': 'checkbox', 'current': True, 'was': [False]}},
         data['stale']),
    ]


def main():
    """Run every scenario against the script and report each check."""
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--script', default=os.path.join(SCRIPTS, 'dump-default-history.py'))
    args = ap.parse_args()

    total = failed = 0
    for scenario, m1_date, b_date in SCENARIOS:
        print(f'— {scenario}')
        for name, ok, got in check(run(args.script, m1_date, b_date)):
            total += 1
            print(f'  {"PASS" if ok else "FAIL"}  {name}')
            if not ok:
                failed += 1
                print(f'        got: {json.dumps(got)}')
    print(f'\n{total - failed}/{total} passed')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
