#!/usr/bin/env python3
"""
Mutation-tester for the collapsable-column min-width ratchet fix.

Reverts ONE half of the fix in ShowAllEntityData.user.js so
tests/fixtures/collapse-column-width-stable-on-sort.spec.js can be shown to
fail before it, then restores the file from the pristine copy.

    python3 scripts/mutate-collapse-minwidth.py save    <backup-path>
    python3 scripts/mutate-collapse-minwidth.py measure        # scrollWidth again
    python3 scripts/mutate-collapse-minwidth.py cleanup        # no minWidth reset
    python3 scripts/mutate-collapse-minwidth.py restore <backup-path>
"""
import shutil
import sys

SRC = 'ShowAllEntityData.user.js'

MEASURE_NEW = """            _firstLisForMeasure.forEach(li => { li.style.width = 'max-content'; });
            _firstLisForMeasure.forEach(li => {
                maxFirstLiWidth = Math.max(
                    maxFirstLiWidth, Math.ceil(li.getBoundingClientRect().width));
            });
            _firstLisForMeasure.forEach(li => { li.style.width = ''; });"""

MEASURE_OLD = """            _firstLisForMeasure.forEach(li => { li.style.whiteSpace = 'nowrap'; });
            _firstLisForMeasure.forEach(li => {
                maxFirstLiWidth = Math.max(maxFirstLiWidth, li.scrollWidth);
            });
            _firstLisForMeasure.forEach(li => { li.style.whiteSpace = ''; });"""

CLEANUP_NEW = "            'thead th[data-mb-collapse-min-px], ' +\n"


def swap(old, new):
    text = open(SRC, encoding='utf-8').read()
    if text.count(old) != 1:
        sys.exit('anchor not unique or not found: %d matches' % text.count(old))
    open(SRC, 'w', encoding='utf-8').write(text.replace(old, new))


def main():
    mode = sys.argv[1]
    if mode == 'save':
        shutil.copyfile(SRC, sys.argv[2])
    elif mode == 'restore':
        shutil.copyfile(sys.argv[2], SRC)
    elif mode == 'measure':
        swap(MEASURE_NEW, MEASURE_OLD)
    elif mode == 'cleanup':
        swap(CLEANUP_NEW, '')
    else:
        sys.exit('unknown mode: ' + mode)
    print('ok: ' + mode)


main()
