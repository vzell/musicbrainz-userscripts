"""List every place in ShowAllEntityData.user.js that walks a table's rows
directly from the DOM (a `tbody tr`-style selector, `.rows`, `tBodies`), with
the enclosing function — the inventory behind the "rows that are not data"
rule (docs/claude/filter-and-cache-invariants.md, "Rows that are not data",
2026-11-11). A pass on this list sees a section band of the Discogs Tracks
view (`tr.mb-sec-band`) unless it skips `_NON_DATA_ROW_SEL`.

usage: python3 scripts/list-live-row-passes.py [--skipped] [--open]
  --skipped  only lines that already name the shared skip
  --open     only lines that do not (the default prints both, marked)
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'ShowAllEntityData.user.js')

ROW_RE = re.compile(r"""(?x)
    querySelectorAll\(\s*[`'"][^`'"]*\btr\b[^`'"]*[`'"]   # a selector naming tr
  | \.tBodies\b
  | \btbody\.rows\b | \btable\.rows\b | \.children\)\s*\.filter\(\s*\w+\s*=>\s*\w+\.tagName\s*===\s*'TR'
""")
FUNC_RE = re.compile(r'^\s*(?:async\s+)?function\s+(\w+)|^\s*(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>)')


def main():
    """Print `line  function  code` for each row walk."""
    want = sys.argv[1] if len(sys.argv) > 1 else ''
    func = '?'
    n_open = n_skip = 0
    with open(SRC, encoding='utf-8') as fh:
        for no, line in enumerate(fh, 1):
            m = FUNC_RE.match(line)
            if m:
                func = m.group(1) or m.group(2)
            if line.lstrip().startswith(('*', '//')) or not ROW_RE.search(line):
                continue
            skipped = '_NON_DATA_ROW_SEL' in line or 'mb-nd-row' in line or '_isNonDataRow' in line
            if skipped:
                n_skip += 1
            else:
                n_open += 1
            if (want == '--skipped' and not skipped) or (want == '--open' and skipped):
                continue
            print(f"{no:>7}  {'SKIP' if skipped else '    '}  {func:<40.40}  {line.strip()[:110]}")
    print(f'# {n_open} open, {n_skip} skipping', file=sys.stderr)


if __name__ == '__main__':
    main()
