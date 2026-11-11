#!/usr/bin/env python3
"""Copy an evenly spaced sample of Brucebase pages from the BruceParser mirror.

The mirror (``~/git/scripts/BruceParser/bb/latest``, a symlink to a slow
network share) has one directory per page category, ``<cat>/<cat>_<slug>.html``.
Grepping it in place takes minutes per directory, so the probes read a local
copy: ``debug/bb-mirror/<cat>/`` (gitignored, like all of ``debug/``).

The sample is deterministic: the directory listing is sorted and every k-th
file is taken, so it spans the whole date range of a category (event slugs
start with the date). Files already copied are skipped.

Usage:
    python3 scripts/sample-bb-mirror.py [--per N] [--cat gig --cat song …]
"""
import argparse
import os
import shutil
import sys

MIRROR = os.path.expanduser('~/git/scripts/BruceParser/bb/latest')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'debug', 'bb-mirror')

# Families of the overhaul plan (org/brucebase.org, "Plan (2026-11-11)").
DEFAULT_CATS = {
    'gig': 120, 'recording': 60, 'rehearsal': 40, 'interview': 40, 'nogig': 40,
    'song': 60, 'lyrics': 20, 'ott': 20,
    'venue': 40, 'relation': 40,
    'retail': 60, 'playlist': 15, 'bootleg': 30,
    'files': 20, 'onstage': 20,
}


def sample(cat, per):
    """Copy ``per`` evenly spaced files of one category; return (copied, total)."""
    src = os.path.join(MIRROR, cat)
    names = sorted(n for n in os.listdir(src) if n.endswith('.html'))
    if not names:
        return 0, 0
    step = max(1, len(names) // per)
    picked = names[::step][:per]
    dst = os.path.join(OUT, cat)
    os.makedirs(dst, exist_ok=True)
    copied = 0
    for n in picked:
        target = os.path.join(dst, n)
        if os.path.exists(target) and os.path.getsize(target) > 0:
            continue
        shutil.copyfile(os.path.join(src, n), target)
        copied += 1
    return copied, len(names)


def main():
    """Parse arguments and copy the sample of each requested category."""
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--per', type=int, default=0, help='files per category (default: per-category table)')
    ap.add_argument('--cat', action='append', help='category (repeatable; default: all of the plan)')
    args = ap.parse_args()
    cats = args.cat or list(DEFAULT_CATS)
    for cat in cats:
        per = args.per or DEFAULT_CATS.get(cat, 20)
        copied, total = sample(cat, per)
        print(f'{cat:10s} {copied:4d} copied (of {total} in the mirror)', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
