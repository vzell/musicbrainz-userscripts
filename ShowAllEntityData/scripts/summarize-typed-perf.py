#!/usr/bin/env python3
"""Tabulate `--only=typed` interaction-perf files (capture-interaction-perf.js).

Usage (from ShowAllEntityData/):

    python3 scripts/summarize-typed-perf.py main-typed-order1 main-typed-order2

Each argument is a `--label=` of a typed run; every
tests/snapshots/<pageType>/interaction-perf-<label>-*.json is read, newest per
(pageType, label). Prints one org table row per pageType x delay x label, the
medians of the run, in the column order MEASUREMENTS.org uses for them.
"""

import glob
import json
import os
import sys

FIELDS = ['worstKeyMs', 'keysOver50', 'keysOver100', 'longestFrameMs', 'longestBlockingMs',
          'longestTaskMs', 'afterLastKeyMs', 'totalMs', 'passes']
PAGES = ['artist-events', 'artist-releases-dylan', 'artist-releasegroups', 'artist-recordings-petty']


def newest(page, label):
    """The newest typed file of one page and label, or None."""
    files = sorted(glob.glob(os.path.join('tests', 'snapshots', page, f'interaction-perf-{label}-*.json')))
    return files[-1] if files else None


def main():
    """Prints the table, columns padded the way org-mode aligns them (numbers right)."""
    labels = sys.argv[1:]
    head = ['pageType', 'delay', 'run', 'worst key', 'keys ≥50', 'keys ≥100', 'longest frame',
            'blocking', 'longest task', 'after last key', 'total', 'passes', 'UTC run']
    rows = []
    for page in PAGES:
        for label in labels:
            path = newest(page, label)
            if not path:
                continue
            with open(path, encoding='utf-8') as f:
                d = json.load(f)
            for m in d['interactions'].values():
                win = f"{d['startedAt'][11:16]} -> {d['finishedAt'][11:16]}"
                rows.append([f'={page}=', str(m['delayMs']), label] + [str(round(m[k])) for k in FIELDS] + [win])
    rows.sort(key=lambda r: (PAGES.index(r[0].strip('=')), int(r[1]), r[2]))
    widths = [max(len(x) for x in col) for col in zip(head, *rows)]
    numeric = [i for i in range(len(head)) if all(r[i].isdigit() for r in rows)]

    def fmt(cells):
        """One padded row."""
        return '| ' + ' | '.join(c.rjust(w) if i in numeric else c.ljust(w)
                                 for i, (c, w) in enumerate(zip(cells, widths))) + ' |'
    print(fmt(head))
    print('|' + '+'.join('-' * (w + 2) for w in widths) + '|')
    for r in rows:
        print(fmt(r))


if __name__ == '__main__':
    main()
