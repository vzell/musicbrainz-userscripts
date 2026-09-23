#!/usr/bin/env python3
"""Consistency audit for PERFORMANCE.org and CLAUDE.md. Exits non-zero on any defect.

These two files are written as prediction and plan, so landing a change
routinely falsifies prose that nothing will flag. CLAUDE.md already tells you
to re-read them "when you implement, and again when you merge" — this script
is the part of that re-read a machine can do. It does not replace the read:
most rot is semantic (a step whose bug description is simply no longer true)
and only a human notices that. It catches the three mechanical kinds, each of
which has actually happened here.

  - DONE-set drift        CLAUDE.md: "Derive the 'DONE set is exactly
                          Steps ...' sentence from the keywords, never by
                          hand. It has drifted twice, in both directions."
                          So derive it here and compare.
  - a half-flipped step   a step whose keyword says DONE while its own body
                          still says "Still TODO on main" / "TODO until it is
                          on main" / "IN PROGRESS". Flipping the keyword is
                          the easy half; the status paragraph three screens
                          down is the half that gets left behind.
  - a section pinned to   a doc section headed "IN PROGRESS" that names a
    a branch that is gone branch which no longer exists. That is what a merge
                          looks like from the doc's side: CLAUDE.md carried an
                          "IN PROGRESS ... (branch rel-column-batch-and-cell-
                          states)" subsection, with its own instruction to
                          rewrite it on merge, and nothing would have noticed
                          if that instruction had been skipped.

    python3 scripts/audit-docs.py
    python3 scripts/audit-docs.py --project-dir /path/to/copy
"""

import argparse
import pathlib
import re
import subprocess
import sys

PERF = 'PERFORMANCE.org'
GUIDE = 'CLAUDE.md'

# "*** DONE Step 36: Batched Relationships source + per-row load states"
STEP_HEADING = re.compile(r'^(\*+)\s+(TODO|DONE)\s+Step\s+(\d+):', re.MULTILINE)
# "the DONE set is exactly Steps 3, 4, 8 ... 35 and 36."
DONE_SET = re.compile(r'DONE set is exactly Steps? ([^.]+)\.', re.DOTALL)
NUMBER = re.compile(r'\d+')
# A body that contradicts a DONE keyword.
CONTRADICTS_DONE = (
    'Still TODO',
    'TODO until it is on',
    'IN PROGRESS',
)
# A branch-shaped token inside `backticks` or ~org markup~.
BRANCH_TOKEN = re.compile(r'[`~]([A-Za-z0-9][A-Za-z0-9._/-]*)[`~]')


def step_bodies(text):
    """Yields (level, keyword, number, body) for every Step heading."""
    marks = list(STEP_HEADING.finditer(text))
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
        yield m.group(1), m.group(2), int(m.group(3)), text[m.end():end]


def git_dir_for(root):
    """The repo to ask about branches.

    Falls back to the script's own checkout when --project-dir points at a
    scratch copy that is not itself a repo — the branch namespace being asked
    about is the real repo's either way.
    """
    for candidate in (root, pathlib.Path(__file__).resolve().parent.parent):
        done = subprocess.run(['git', '-C', str(candidate), 'rev-parse', '--git-dir'],
                              capture_output=True, text=True)
        if done.returncode == 0:
            return candidate
    return None


def branch_exists(git_root, name):
    """True when git knows a local or remote branch by that name."""
    if git_root is None:
        return True          # cannot tell; do not invent a defect
    for ref in (f'refs/heads/{name}', f'refs/remotes/origin/{name}'):
        done = subprocess.run(['git', '-C', str(git_root), 'rev-parse',
                               '--verify', '--quiet', ref],
                              capture_output=True, text=True)
        if done.returncode == 0:
            return True
    return False


def check_done_set(text, problems):
    """The sentence naming the DONE set must match the keywords themselves."""
    keywords = {num for _, kw, num, _ in step_bodies(text) if kw == 'DONE'}
    m = DONE_SET.search(text)
    if not m:
        problems.append(f'{PERF}: no "DONE set is exactly Steps ..." sentence found')
        return
    claimed = {int(n) for n in NUMBER.findall(m.group(1))}
    if claimed != keywords:
        missing = sorted(keywords - claimed)
        extra = sorted(claimed - keywords)
        detail = []
        if missing:
            detail.append(f'DONE but not listed: {", ".join(map(str, missing))}')
        if extra:
            detail.append(f'listed but not DONE: {", ".join(map(str, extra))}')
        problems.append(
            f'{PERF}: the DONE-set sentence disagrees with the keywords — '
            + '; '.join(detail))


def check_half_flipped(text, problems):
    """A DONE step whose own body still says it has not shipped."""
    for _, keyword, num, body in step_bodies(text):
        if keyword != 'DONE':
            continue
        for phrase in CONTRADICTS_DONE:
            if phrase in body:
                problems.append(
                    f'{PERF}: Step {num} is DONE but its body still says '
                    f'"{phrase}" — flipping the keyword is the easy half')


LINE_REF = re.compile(r'~:\d[\d-]*~')


def check_no_line_refs(text, problems):
    """A ~:NNNNN~ line reference has come back.

    They were all removed on 2026-09-20 after a survey found every one of the
    118 then present pointing at unrelated code — the userscript grows on
    nearly every commit, so a number is stale within days of being written.
    CLAUDE.md's File-structure table reached the same conclusion first
    ("worse than having no table at all") and carries grep anchors instead.

    Scoped to PERFORMANCE.org because that is the file the cleanup covered;
    widen it if another doc starts collecting them.
    """
    for i, line in enumerate(text.split('\n'), 1):
        for ref in LINE_REF.findall(line):
            problems.append(
                f'{PERF}:{i}: line reference {ref} — name the symbol and grep '
                'for it instead; a number is stale within days')


def check_stale_branch_sections(root, problems):
    """An "IN PROGRESS" section naming a branch that no longer exists."""
    git_root = git_dir_for(root)
    for name in (GUIDE, PERF):
        path = root / name
        if not path.exists():
            continue
        lines = path.read_text(encoding='utf-8').splitlines()
        for i, line in enumerate(lines):
            if 'IN PROGRESS' not in line:
                continue
            # The branch is named on the same line, or the next one when the
            # sentence wraps. A wider window cries wolf: six lines of an org
            # table reaches neighbouring rows, where ~release-tracks~ is a
            # pageType and not a branch at all.
            window = ' '.join(lines[i:i + 2])
            for token in BRANCH_TOKEN.findall(window):
                # Only things that look like a branch, not a file or a symbol.
                if '.' in token or '/' not in token and '-' not in token:
                    continue
                if token.endswith(('.js', '.json', '.org', '.md', '.py')):
                    continue
                if branch_exists(git_root, token):
                    continue
                problems.append(
                    f'{name}:{i + 1}: an "IN PROGRESS" section names branch '
                    f'"{token}", which no longer exists — if it merged, '
                    f'rewrite the section to say what shipped')


def check_stale_wip_citations(root, problems):
    """Fail on a `WIP.N` placeholder left in an org file after its merge.

    `merge-push-remove`'s fold rewrites `WIP.N` inside
    `ShowAllEntityData_CHANGELOG.json` and nowhere else — which is a trap for
    the org files, where a status table naturally wants to say "shipped as …"
    while the work is still on a branch. Writing `WIP.1` there reads like a
    placeholder something will come back for, and nothing does.

    It happened immediately: `org/config-handling.org` recorded F1 as shipped
    at `WIP.1`, the branch merged as 9.99.1138, and the row still said `WIP.1`
    until the NEXT branch's author happened to read that line. Mechanical
    here, like `audit-changelog.py`'s own unrewritten-`WIP.N` check.

    **Scoped to org TABLE ROWS, and that scope is the whole design.** A first
    version looked at every line and reported 18 hits across 7 files — of which
    exactly 3 were status claims and 15 were prose describing the WIP flow
    ("This branch carries a fresh WIP.1", "1304eb9 — … (WIP.2)"), which these
    files legitimately contain and which is worth keeping. An 83%
    false-positive rate is not a gate; it is how a script everyone currently
    trusts starts getting ignored, and `org/config-handling.org` reached the
    same conclusion about the `--docs` worklist from the other side.

    A table row is where a version is CLAIMED. Prose about the mechanism is a
    description, and a version repeated in prose should not be there anyway —
    one place holds it, and the table is that place.

    Verbatim spans (`backticks`, =org=, ~org~) are stripped first: they quote
    the token rather than cite a release, the same carve-out and for the same
    reason as in `audit-changelog.py`.

    The check is skipped while a `*_CHANGELOG.wip.json` exists: on a branch,
    `WIP.N` in a status table is correct and is how the row gets written
    before its version is known.
    """
    if list(root.glob('*_CHANGELOG.wip.json')):
        return
    if not (root / 'org').is_dir():
        return

    for org in sorted((root / 'org').glob('*.org')):
        text = org.read_text(encoding='utf-8')
        for lineno, line in enumerate(text.splitlines(), 1):
            if not line.lstrip().startswith('|'):
                continue
            bare = re.sub(r'`[^`]*`', '', line)
            bare = re.sub(r'=[^=]*=', '', bare)
            bare = re.sub(r'~[^~]*~', '', bare)
            for m in re.finditer(r'\bWIP\.\d+\b', bare):
                problems.append(
                    f'{org.relative_to(root)}:{lineno} still claims {m.group(0)} in a '
                    f'status table — the fold rewrites the changelog only, so a table '
                    f'row has to be given its real version by hand at merge time')


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--project-dir', default=None,
                        help='project directory (default: the script\'s parent)')
    args = parser.parse_args()

    root = pathlib.Path(args.project_dir) if args.project_dir \
        else pathlib.Path(__file__).resolve().parent.parent
    perf_path = root / PERF
    if not perf_path.exists():
        sys.exit(f'error: {perf_path} not found — wrong --project-dir?')

    text = perf_path.read_text(encoding='utf-8')
    problems = []
    check_done_set(text, problems)
    check_half_flipped(text, problems)
    check_no_line_refs(text, problems)
    check_stale_branch_sections(root, problems)
    check_stale_wip_citations(root, problems)

    if problems:
        print(f'{len(problems)} problem(s):')
        for p in problems:
            print(f'  {p}')
        return 1

    done = sorted(num for _, kw, num, _ in step_bodies(text) if kw == 'DONE')
    print(f'{PERF}: {len(list(step_bodies(text)))} steps, '
          f'{len(done)} DONE ({", ".join(map(str, done))}) — sentence matches the '
          'keywords, no DONE step contradicts itself, no "IN PROGRESS" section '
          'names a branch that is gone, no ~:NNNNN~ line references, no org file '
          'left citing a WIP.N placeholder.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
