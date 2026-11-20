#!/usr/bin/env python3
"""Probe: MusicBrainz event titles that differ from Brucebase by a typo (Track A idea 5, check 1's loose end).

  python3 scripts/probe-bb-mb-title-typos.py [--bp DIR] [--out FILE]

Read-only, no network. Inputs (BruceParser, the repo at --bp, default
~/git/scripts/BruceParser):
  - search/event_linked_to_artist.org (search.sh -e event): one row per
    MusicBrainz event with its MBID, its title and its Brucebase link;
  - bb/latest/mb-event-titles-sorted-from-bb.txt (eefyp.sh): the title
    BruceParser derives from the wiki for each year-page anchor, in
    MusicBrainz's style.

Of the ~600 titles that differ (search/extract-mb-event-titles.sh), nearly
all are naming conventions (the venue's name of the time, named events, the
derivation's own rules). This probe lists the slices a human can act on:
  accent    equal once accents and case are folded, and the MusicBrainz
            title has fewer accented letters (Dusseldorf, Sao Paulo);
  near      same word count, exactly one word differs, and the two words
            are close (SequenceMatcher >= 0.75): Pollack/Pollak, but also
            conventions such as Theater/Theatre, so it is read by hand;
  punct     equal once case, commas, semicolons, periods and blanks are
            folded: "NY; USA", "New York, City NY";
  pick      every title matching one of the --pick regexes, with its
            Brucebase title, for hand-found cases the slices above miss
            (case-only typos such as "first direct arena", or venue
            disagreements).
Case-only differences are skipped by the slices (BruceParser's own
capitalizer makes ~76 of them); use --pick for the real ones.

The list for vzell (2026-11-20, from the run of 2026-11-19) is in
org/bbp-parity.org, "MusicBrainz event titles to fix by hand".
"""
import argparse
import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

ROW_RE = re.compile(r'^\| \[\[https://musicbrainz\.org/event/([0-9a-f-]{36})\]\[(.*?)\]\] \|(.*)$')
BB_RE = re.compile(r'brucebase\.wikidot\.com/([^\]]+)\]\[BB\]')

DEFAULT_PICKS = [
    r'Steetcar', r'Toronto, On,', r'first direct', r'Oriole Park At', r'Grand Mountain Lodge',
    r'^1982‐02:', r'^1983‐07:', r'^1995‐08‐(06|10):', r'Charlie.s Place',
]


def fold(s):
    """Strip accents and lower-case a string.

    @param {str} s
    @returns {str}
    """
    return ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c)).lower()


def body(title):
    """The title without its date prefix ("1992‐01: ").

    @param {str} title
    @returns {str}
    """
    return title.split(': ', 1)[1] if ': ' in title else title


def load(bp):
    """Read the MusicBrainz events (anchor, title, mbid) and the Brucebase titles by anchor.

    @param {Path} bp BruceParser repo
    @returns {tuple} (list of (anchor, title, mbid), dict anchor -> [titles])
    """
    mb = []
    for line in (bp / 'search' / 'event_linked_to_artist.org').read_text(encoding='utf-8').splitlines():
        m = ROW_RE.match(line)
        if not m:
            continue
        b = BB_RE.search(m.group(3))
        mb.append((b.group(1) if b else '', m.group(2), m.group(1)))
    bb = {}
    for line in (bp / 'bb' / 'latest' / 'mb-event-titles-sorted-from-bb.txt').read_text(encoding='utf-8').splitlines():
        if '|' in line:
            a, t = line.split('|', 1)
            bb.setdefault(a, []).append(t)
    return mb, bb


def classify(mb, bb):
    """Sort the differing titles into the accent, near and punct slices.

    @param {list} mb
    @param {dict} bb
    @returns {dict} slice -> list of (anchor, mbid, mb title, bb title)
    """
    out = {'accent': [], 'near': [], 'punct': []}
    for anchor, title, mbid in mb:
        cands = bb.get(anchor)
        if not anchor or not cands or title in cands:
            continue
        mbb = body(title)
        best = max(cands, key=lambda c: SequenceMatcher(None, body(c), mbb).ratio())
        bbb = body(best)
        if mbb == bbb:
            continue
        if fold(mbb) == fold(bbb) and mbb.lower() != bbb.lower():
            if sum(ord(c) > 127 for c in mbb) < sum(ord(c) > 127 for c in bbb):
                out['accent'].append((anchor, mbid, title, best))
            continue
        if mbb.lower() == bbb.lower():
            continue
        if re.sub(r'[\s,;.]+', ' ', mbb.lower()).strip() == re.sub(r'[\s,;.]+', ' ', bbb.lower()).strip():
            out['punct'].append((anchor, mbid, title, best))
            continue
        wm, wb = fold(mbb).split(), fold(bbb).split()
        if len(wm) == len(wb):
            diff = [(x, y) for x, y in zip(wm, wb) if x != y]
            if len(diff) == 1 and SequenceMatcher(None, *diff[0]).ratio() >= 0.75:
                out['near'].append((anchor, mbid, title, best))
    return out


def main():
    """Parse arguments, run the slices and the picks, write the list."""
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--bp', default=str(Path.home() / 'git' / 'scripts' / 'BruceParser'))
    ap.add_argument('--out', default='debug/bb-mb-title-typos.txt')
    ap.add_argument('--pick', action='append', help='regex over the MusicBrainz title (repeatable)')
    args = ap.parse_args()
    bp = Path(args.bp)
    mb, bb = load(bp)
    slices = classify(mb, bb)
    picks = [re.compile(p) for p in (args.pick or DEFAULT_PICKS)]
    slices['pick'] = [(a, mbid, t, ' / '.join(bb.get(a, ['-'])))
                      for a, t, mbid in mb if any(p.search(t) for p in picks)]
    lines = [f'MusicBrainz events with a Brucebase link: {sum(1 for a, _, _ in mb if a)}']
    for name, rows in slices.items():
        lines.append(f'== {name}: {len(rows)}')
        lines += [f'{a}\thttps://musicbrainz.org/event/{mbid}\tMB: {t}\tBB: {b}' for a, mbid, t, b in rows]
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(lines[0])
    for name, rows in slices.items():
        print(f'{name}: {len(rows)}')
    print(f'written: {args.out}')


if __name__ == '__main__':
    main()
