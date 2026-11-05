#!/usr/bin/env python3
"""Builds the springsteenlyrics.com song list the userscript links titles with.

The SL item pages name songs by title only; a song's page is
`lyrics.php?song=SLUG`, and an unknown slug gets HTTP 200 with a "does not
exist!" page (checked 2026-11-05), so the userscript only links a title whose
slug is KNOWN (vzell's answer 1 to org/sl-tracklist-links-mockups.html).

Two steps:

1. `--index debug/sl-song-index.json` (the output of
   scripts/probe-sl-song-index.py, every line of the 32 letter pages)
   rewrites `docs/sl-song-base-slugs.json`: each BASE slug (no "_": versions
   carry `_1978-07-07`, `_original`, ...) with its title, plus the fetch time.
   That file is committed; the probe's full output is not.
2. From `docs/sl-song-base-slugs.json`, the generated block of
   ShowAllEntityData.user.js between the BEGIN/END GENERATED markers:
   `_SL_SONG_BASE_SLUGS` (every base slug) and `_SL_SONG_TITLE_EXCEPTIONS`
   (normalised title -> slug, for the titles the rule below does not get
   right). Run without arguments to write it, with `--check` to fail when it
   is stale or the rule disagrees with the data.

The rule (`_slSongSlugOf()` in the userscript, mirrored by `slug_of()`):
normalise (NFD, accents off, lower case, a-z and 0-9 only) the title, then
the title without a trailing "(...)", without a leading "(...)", without
both, then without each further trailing "(...)"; the first that is a known
slug wins. A title the rule maps to no slug,
or to a slug that is not one of its own (FIRE (Jimi Hendrix) -> "fire", which
is Bruce's FIRE), gets an exception: its shortest own slug.

Usage:
    python3 scripts/build-sl-song-slugs.py [--index debug/sl-song-index.json] [--check]
"""

import argparse
import json
import os
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, 'docs', 'sl-song-base-slugs.json')
USERSCRIPT = os.path.join(ROOT, 'ShowAllEntityData.user.js')
BEGIN = '    // BEGIN GENERATED: scripts/build-sl-song-slugs.py'
END = '    // END GENERATED: scripts/build-sl-song-slugs.py'


def norm(t):
    """NFD, combining marks off, lower case, [a-z0-9] only (`_slNorm()`)."""
    t = unicodedata.normalize('NFD', t or '')
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn').lower()
    return re.sub(r'[^a-z0-9]', '', t)


def exc_key(t):
    """The exception list's key (`_slExcKey()`): `norm()` keeping "(" and ")",
    so "SOMEDAY (WE'LL BE TOGETHER)" (slug someday) and "SOMEDAY WE'LL BE
    TOGETHER" (somedaywellbetogether) stay apart."""
    t = unicodedata.normalize('NFD', t or '')
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn').lower()
    return re.sub(r'[^a-z0-9()]', '', t)


def drop_trailing(t):
    """The title without one trailing parenthetical."""
    return re.sub(r'\s*\([^()]*\)\s*$', '', t)


def drop_leading(t):
    """The title without one leading parenthetical."""
    return re.sub(r'^\s*\([^()]*\)\s*', '', t)


def slug_of(title, slugs, exceptions):
    """The slug the userscript's `_slSongSlugOf()` gives a title, or ''."""
    if not norm(title):
        return ''
    k = exc_key(title)
    if k in exceptions:
        return exceptions[k]
    forms = [title, drop_trailing(title), drop_leading(title), drop_leading(drop_trailing(title))]
    x = drop_trailing(title)
    while x != drop_trailing(x):
        x = drop_trailing(x)
        forms.append(x)
    for c in forms:
        s = norm(c)
        if s and s in slugs:
            return s
    return ''


def refresh_data(index_path):
    """Rewrites docs/sl-song-base-slugs.json from the probe's full index."""
    with open(index_path, encoding='utf-8') as f:
        idx = json.load(f)
    base = {}
    for ln in idx['lines']:
        if '_' not in ln['slug']:
            base.setdefault(ln['slug'], ln['title'])
    rows = [{'slug': s, 'title': t} for s, t in sorted(base.items())]
    with open(DATA, 'w', encoding='utf-8') as f:
        f.write('{\n "source": "scripts/probe-sl-song-index.py, every letter page of '
                'https://www.springsteenlyrics.com/lyrics.php",\n')
        f.write(f' "fetched": {json.dumps(idx.get("fetched", ""))},\n')
        f.write(f' "lines": {len(idx["lines"])},\n "songs": [\n')
        f.write(',\n'.join('  ' + json.dumps(r, ensure_ascii=False) for r in rows))
        f.write('\n ]\n}\n')
    print(f'{DATA}: {len(rows)} base slugs from {len(idx["lines"])} lines')


def build():
    """The generated JS block and a report of how the rule fares."""
    with open(DATA, encoding='utf-8') as f:
        data = json.load(f)
    songs = data['songs']
    slugs = {r['slug'] for r in songs}
    odd = sorted(s for s in slugs if not re.fullmatch(r'[a-z0-9-]+', s))
    if odd:
        sys.exit(f'base slugs outside [a-z0-9-]: {odd}')
    by_title = {}
    for r in songs:
        by_title.setdefault(r['title'], []).append(r['slug'])
    exceptions = {}
    for title, own in sorted(by_title.items()):
        got = slug_of(title, slugs, {})
        if got not in own:
            exceptions[exc_key(title)] = sorted(own, key=lambda s: (len(s), s))[0]
    bad = [t for t, own in by_title.items() if slug_of(t, slugs, exceptions) not in own]
    if bad:
        sys.exit(f'titles still wrong with the exceptions (two titles share a key?): {bad}')
    out = [BEGIN + f' from docs/sl-song-base-slugs.json (fetched {data.get("fetched", "")}).']
    out.append('    // Do not edit by hand: run the script.')
    out.append('    /**')
    out.append('     * Every base song slug of springsteenlyrics.com\'s lyrics index')
    out.append(f'     * ({len(slugs)}; a version\'s slug adds "_<date>", "_original", ...), space separated:')
    out.append('     * a title is linked only when its slug is one of these (`_slSongSlugOf()`).')
    out.append('     * @type {string}')
    out.append('     */')
    out.append('    const _SL_SONG_BASE_SLUGS = [')
    line = []
    for s in sorted(slugs):
        if sum(len(x) + 1 for x in line) + len(s) > 100:
            out.append("        '" + ' '.join(line) + "',")
            line = []
        line.append(s)
    if line:
        out.append("        '" + ' '.join(line) + "',")
    out.append("    ].join(' ');")
    out.append('')
    out.append('    /**')
    out.append('     * Titles (keyed by `_slExcKey()`) the rule of `_slSongSlugOf()` gets wrong,')
    out.append(f'     * and their slug ({len(exceptions)}).')
    out.append('     * @type {Object<string, string>}')
    out.append('     */')
    out.append('    const _SL_SONG_TITLE_EXCEPTIONS = {')
    for k, v in sorted(exceptions.items()):
        out.append(f"        '{k}': '{v}',")
    out.append('    };')
    out.append(END)
    rule_ok = len(by_title) - len(exceptions)
    report = (f'{len(slugs)} base slugs, {len(by_title)} titles: the rule gets {rule_ok} right, '
              f'{len(exceptions)} exceptions')
    return '\n'.join(out), report


def main():
    """Refreshes the data file when asked, then writes or checks the block."""
    ap = argparse.ArgumentParser()
    ap.add_argument('--index', help='the full index JSON of scripts/probe-sl-song-index.py')
    ap.add_argument('--check', action='store_true', help='fail when the block is stale')
    args = ap.parse_args()
    if args.index:
        refresh_data(args.index)
    block, report = build()
    with open(USERSCRIPT, encoding='utf-8') as f:
        src = f.read()
    i = src.find(BEGIN)
    j = src.find(END)
    if i < 0 or j < 0:
        sys.exit('the BEGIN/END GENERATED markers are missing from the userscript')
    current = src[i:j + len(END)]
    print(report)
    if args.check:
        if current != block:
            sys.exit('the generated block is stale: run python3 scripts/build-sl-song-slugs.py')
        print('ok: the generated block is current')
        return
    if current == block:
        print('unchanged')
        return
    with open(USERSCRIPT, 'w', encoding='utf-8') as f:
        f.write(src[:i] + block + src[j + len(END):])
    print('written')


if __name__ == '__main__':
    main()
