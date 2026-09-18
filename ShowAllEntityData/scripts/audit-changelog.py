"""Hygiene audit for ShowAllEntityData_CHANGELOG.json. Exits non-zero on any defect.

Every check here exists because the defect it looks for was actually found in
this file, and none of them was caught by anything else — a changelog is
prose, so nothing type-checks it and no test reads it.

  - missing `version`      two entries had none, which makes any tool doing
                           entry['version'] bail outright.
  - non-numeric `version`  9.99.483-dbg / 9.99.482-dbg broke
                           int(v.split('.')[2]).
  - duplicate `version`    three pairs: one entry stored twice byte-identical,
                           and two releases each written up twice.
  - missing `date`         none today; cheap to keep honest.
  - out-of-order versions  the file is newest-first by contract, and the fold
                           prepends on that assumption.
  - ship date wrong        the newest entry's `date` must equal the
                           `+YYYY-MM-DD` stamp in the userscript's
                           `@version`. CLAUDE.md requires a folded entry to
                           carry the day it SHIPPED, and until 2026-09-18
                           `fold-wip-changelog.py` carried the WIP file's
                           authoring date through instead, with CLAUDE.md
                           naming the correction as a hand step. Hand steps
                           that change nothing visible get skipped, and this
                           one was. The fold does it itself now; this check
                           is what would have noticed.
  - date going BACKWARDS   versions ascend with time, so dates must not
                           increase as you read DOWN the file. Three entries
                           predating the fix break it (see
                           KNOWN_DATE_INVERSIONS) and are allowed by name;
                           a NEW one is a defect. This is the visible tip of
                           the leak above — a whole batch can carry authoring
                           dates and only show up here when it reaches back
                           past the release below it.
  - BARE `WIP.N`           an unrewritten cross-reference from a hand-fold.
                           A BACKTICKED token is a deliberate literal — an
                           entry explaining the placeholder mechanism rather
                           than citing a release — and is fine. That
                           distinction is why this is a script and not a
                           grep: `"WIP.26"` sits inside a backtick span whose
                           adjacent characters are quotes, so a lookaround
                           regex reports it as bare.

    python3 scripts/audit-changelog.py
"""

import argparse
import json
import pathlib
import re
import sys
from collections import Counter

CHANGELOG = 'ShowAllEntityData_CHANGELOG.json'
USERSCRIPT = 'ShowAllEntityData.user.js'
SEMVER = re.compile(r'^\d+\.\d+\.\d+$')
HEADER_VERSION = re.compile(r'^//\s*@version\s+(\d+\.\d+\.\d+)\+(\d{4}-\d{2}-\d{2})\s*$')

# Entries whose date is older than the release BELOW them. All three are from
# folds that ran before fold-wip-changelog.py set the ship date itself, and
# each one's true ship date is recoverable from the commit that introduced it
# (c2cf44a 2026-09-05, 066096e 2026-08-28, a6738b4 2026-08-05). They are
# allowed rather than corrected: the published dates are what people read in
# release notes, and repairing only the three that happen to invert would
# leave the wider leak untouched while implying it was cleaned up.
KNOWN_DATE_INVERSIONS = frozenset({'9.99.1005', '9.99.955', '9.99.755'})
WIP_TOKEN = re.compile(r'WIP\.\d+')
# Splits a string into alternating outside/inside-backticks parts: even
# indices are outside, odd indices are the quoted literals.
BACKTICK_SPLIT = re.compile(r'(`[^`]*`)')


def iter_texts(entry):
    """Yields every item text in an entry, handling both item shapes."""
    for sec in entry.get('sections', []):
        for it in sec.get('items', []):
            yield it if isinstance(it, str) else it.get('text', '')


def main():
    # --project-dir mirrors fold-wip-changelog.py's, and exists so these
    # checks can be mutation-tested against a planted defect in a scratch
    # copy instead of by editing the real changelog and restoring it.
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--project-dir', default=None,
                        help='project directory (default: the script\'s parent)')
    args = parser.parse_args()

    root = pathlib.Path(args.project_dir) if args.project_dir \
        else pathlib.Path(__file__).resolve().parent.parent
    path = root / CHANGELOG
    data = json.loads(path.read_text(encoding='utf-8'))
    problems = []

    for i, e in enumerate(data):
        v = e.get('version')
        if v is None:
            problems.append(f'index {i} ({e.get("date")}): no "version" field')
        elif not SEMVER.match(str(v)):
            problems.append(f'index {i}: version {v!r} is not M.MM.NNN')
        if 'date' not in e:
            problems.append(f'{v}: no "date" field')

    counts = Counter(str(e['version']) for e in data if 'version' in e)
    for v, n in sorted(counts.items()):
        if n > 1:
            problems.append(f'version {v} appears {n} times')

    # Newest-first ordering. Only comparable once every version parses, so
    # skip silently when a malformed one was already reported above.
    parsed = []
    for e in data:
        v = str(e.get('version', ''))
        if SEMVER.match(v):
            parsed.append((v, [int(p) for p in v.split('.')]))
    for a, b in zip(parsed, parsed[1:]):
        if a[1] <= b[1]:
            problems.append(f'out of order: {a[0]} is listed above {b[0]}')

    # The newest entry is the release the header names, so their dates are
    # the same fact written twice.
    userscript = path.parent / USERSCRIPT
    if userscript.exists():
        stamp = None
        for line in userscript.read_text(encoding='utf-8').splitlines():
            m = HEADER_VERSION.match(line)
            if m:
                stamp = m.group(2)
                header_version = m.group(1)
                break
        if stamp is None:
            problems.append(f'{USERSCRIPT}: no parseable "// @version M.MM.NNN+YYYY-MM-DD" line')
        else:
            newest = data[0] if data else {}
            if str(newest.get('version')) != header_version:
                problems.append(
                    f'newest entry is {newest.get("version")} but {USERSCRIPT} '
                    f'says {header_version}')
            elif newest.get('date') != stamp:
                problems.append(
                    f'{newest.get("version")}: entry date {newest.get("date")!r} '
                    f'is not the ship date {stamp!r} in {USERSCRIPT}\'s @version')

    # Dates must not increase as you read down the file.
    for a, b in zip(data, data[1:]):
        av, ad, bd = str(a.get('version')), a.get('date'), b.get('date')
        if isinstance(ad, str) and isinstance(bd, str) and ad < bd \
                and av not in KNOWN_DATE_INVERSIONS:
            problems.append(
                f'{av} is dated {ad}, older than {b.get("version")} below it ({bd})')

    for e in data:
        for text in iter_texts(e):
            for idx, part in enumerate(BACKTICK_SPLIT.split(text)):
                if idx % 2:
                    continue                    # inside backticks: a literal
                for m in WIP_TOKEN.finditer(part):
                    problems.append(
                        f'{e.get("version")}: unrewritten cross-reference {m.group(0)} '
                        f'(backtick it if it is a literal mention)')

    if problems:
        print(f'{len(problems)} problem(s) in {CHANGELOG}:')
        for p in problems:
            print(f'  {p}')
        return 1

    print(f'{CHANGELOG}: {len(data)} entries, clean — '
          'every version parseable and unique, dates present, order strictly '
          'descending, newest entry dated as the header\'s ship date, no date '
          f'running backwards beyond the {len(KNOWN_DATE_INVERSIONS)} known '
          'historical ones, no unrewritten WIP.N.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
