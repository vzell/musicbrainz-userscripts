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

import json
import pathlib
import re
import sys
from collections import Counter

CHANGELOG = 'ShowAllEntityData_CHANGELOG.json'
SEMVER = re.compile(r'^\d+\.\d+\.\d+$')
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
    path = pathlib.Path(__file__).resolve().parent.parent / CHANGELOG
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
          'descending, no unrewritten WIP.N.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
