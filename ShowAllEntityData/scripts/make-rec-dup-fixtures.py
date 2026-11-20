#!/usr/bin/env python3
"""Plant duplicate-recording cases into a real release tracklist, for the rec-dup finding's specs.

The base is tests/fixtures/release-tracks-comment-dates.html (a 2-medium Springsteen live release, 27
tracks, every title different, so the base itself forms no group). Each planted track is a copy of
its plain "[intro]" row (no relationships, no comment) with a new track MBID, recording MBID, title,
length, a work ("recording of") and, where a case needs it, a comment, an open-edit marker (span.mp around the recording link)
or a video icon. The expected outcome is written beside it as JSON: that planted truth is the specs'
oracle, never the grouping code's output.

Cases (Auto picks the normal cutoff on a tracklist; Fusion's rules, org/majkinetor.org):
  G1  "Planted Song" 3:00 + "Planted Song" 3:03 (medium 1 and 2): one group, across media
  A1  "Planted Song" 3:40: lengths 40 s apart from G1, kept apart (gross length)
  A2  "Hammersmith Song" live 1975-11-18 / live 1975-11-24 at one venue: kept apart (two dates)
  A3  "Studio Or Live" studio / live: kept apart (live and studio)
  A4  "Pending Song" twice, one with an open edit: kept apart (an open edit)
  A5  "Video Song" twice, one a video: kept apart (video and audio)
  N1  "Dwell I" / "Dwell IV": not grouped, not listed (titles differ in a word on each side)
  S1  the same recording on two tracks (medium 1 and 2): one recording, not a duplicate
  G3  "Unknown Length" ?:?? + 4:00: one group (an unknown length does not veto at normal, #565)
  G4  "Hammersmith Song" live 1975-11-18 on medium 2: one group with A2's first (same date, venue)

usage: python3 scripts/make-rec-dup-fixtures.py   # writes the two files below
"""
import json
import re

BASE = 'tests/fixtures/release-tracks-comment-dates.html'
OUT = 'tests/fixtures/release-tracks-rec-dup.html'
EXPECT = 'tests/fixtures/release-tracks-rec-dup.expected.json'
INTRO_REC = '6ed5b235-90f3-4426-bc3f-a47ec006f43b'


def mbid(kind, n):
    """A made-up MBID, recognisable as planted: kind 'a' track, 'b' recording."""
    return f'{"aaaaaaaa" if kind == "a" else "bbbbbbbb"}-0000-4000-8000-{n:012d}'


# (medium, key, title, length, comment, flags); key names the recording (same key = same recording)
PLANTS = [
    (1, 'g1a', 'Planted Song', '3:00', '', ''),
    (2, 'g1b', 'Planted Song', '3:03', '', ''),
    (2, 'a1', 'Planted Song', '3:40', '', ''),
    (1, 'a2a', 'Hammersmith Song', '4:10', 'live, 1975‐11‐18: Hammersmith Odeon, London, UK', ''),
    (1, 'a2b', 'Hammersmith Song', '4:12', 'live, 1975‐11‐24: Hammersmith Odeon, London, UK', ''),
    (2, 'g4', 'Hammersmith Song', '4:11', 'live, 1975‐11‐18: Hammersmith Odeon, London, UK', ''),
    (1, 'a3a', 'Studio Or Live', '5:00', 'studio', ''),
    (2, 'a3b', 'Studio Or Live', '5:01', 'live', ''),
    (1, 'a4a', 'Pending Song', '2:30', '', ''),
    (2, 'a4b', 'Pending Song', '2:31', '', 'pending'),
    (1, 'a5a', 'Video Song', '3:30', '', ''),
    (2, 'a5b', 'Video Song', '3:31', '', 'video'),
    (1, 'n1a', 'Dwell I', '9:20', '', ''),
    (2, 'n1b', 'Dwell IV', '9:20', '', ''),
    (1, 's1', 'Same Recording Twice', '6:00', '', ''),
    (2, 's1', 'Same Recording Twice', '6:00', '', ''),
    (1, 'g3a', 'Unknown Length', '?:??', '', ''),
    (2, 'g3b', 'Unknown Length', '4:00', '', ''),
]

# The planted truth: groups by recording key, and what the card's "Kept apart" must name.
EXPECTED = {
    'cutoff': 'normal',
    'groups': [['g1a', 'g1b'], ['a2a', 'g4'], ['g3a', 'g3b']],
    'notGrouped': ['a1', 'a2b', 'a3a', 'a3b', 'a4a', 'a4b', 'a5a', 'a5b', 'n1a', 'n1b', 's1'],
    # The card's "Kept apart" line is on a GROUPED row's card: card owner -> [other, reason].
    # The live/studio, open-edit and video pairs form no group, so no card names them.
    'apart': {
        'g1a': ['a1', 'lengths'],
        'a2a': ['a2b', 'recorded at'],
    },
}


def main():
    """Write the planted fixture and its expected outcome."""
    html = open(BASE, encoding='utf-8').read()
    m = re.search(r'<tr class="(?:odd|even)" id="[0-9a-f-]{36}"><td class="pos t">(?:(?!</tr>).)*?/recording/' + INTRO_REC + r'(?:(?!</tr>).)*</tr>', html, re.S)
    if not m:
        raise SystemExit('template row not found')
    tpl = m.group(0)
    keys = {}
    rows = {1: [], 2: []}
    for n, (medium, key, title, length, comment, flags) in enumerate(PLANTS, start=1):
        rec = keys.setdefault(key, mbid('b', len(keys) + 1))
        tr = tpl
        tid = mbid('a', n)
        tr = re.sub(r'id="[0-9a-f-]{36}"', f'id="{tid}"', tr, count=1)
        tr = re.sub(r'href="/track/[0-9a-f-]{36}">\d+<', f'href="/track/{tid}">{90 + n}<', tr, count=1)
        link = f'<a href="/recording/{rec}"><bdi>{title}</bdi></a>'
        if flags == 'pending':
            link = f'<span class="mp">{link}</span>'
        if flags == 'video':
            link = '<span class="video" title="This recording is a video"></span>' + link
        if comment:
            link += f' <span class="comment">(<bdi>{comment}</bdi>)</span>'
        tr = re.sub(r'<a href="/recording/' + INTRO_REC + r'"><bdi>\[intro\]</bdi></a>', lambda _: link, tr, count=1)
        tr = re.sub(r'<td class="treleases">[^<]*</td>', f'<td class="treleases">{length}</td>', tr, count=1)
        # a work of its own: a track without one is painted by the "no work" family, which then
        # owns the title cell's tint and tooltip (_writeFindingAttrs()), and the card is not shown
        work = f'cccccccc-0000-4000-8000-{n:012d}'
        tr = tr.replace('<div class="ars"></div>', '<div class="ars"><dl class="ars"><dt>recording of:</dt><dd><span class="worklink"></span>'
                        f'<a class="wrap-anywhere" href="/work/{work}"><bdi>{title}</bdi></a></dd></dl></div>', 1)
        rows[medium].append(tr)
    # append each medium's planted rows at the end of ITS tbody (the first </tbody> after
    # each '<table class="tbl medium">'), last medium first so earlier offsets stay valid
    starts = [mm.start() for mm in re.finditer(r'<table class="tbl medium">', html)]
    if len(starts) != 2:
        raise SystemExit(f'expected two media, found {len(starts)}')
    text = html
    for medium in (2, 1):
        end = text.index('</tbody>', starts[medium - 1])
        text = text[:end] + ''.join(rows[medium]) + text[end:]
    note = ('<!-- PLANTED by scripts/make-rec-dup-fixtures.py from release-tracks-comment-dates.html: '
            f'{len(PLANTS)} made-up tracks (MBIDs aaaaaaaa-/bbbbbbbb-0000-4000-8000-…) for the rec-dup specs; '
            'expected outcome in release-tracks-rec-dup.expected.json -->\n')
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(note + text)
    exp = dict(EXPECTED, recordings={k: v for k, v in keys.items()}, planted=len(PLANTS))
    with open(EXPECT, 'w', encoding='utf-8') as f:
        json.dump(exp, f, ensure_ascii=False, indent=4)
        f.write('\n')
    print(f'wrote {OUT} ({len(PLANTS)} planted tracks) and {EXPECT}')


if __name__ == '__main__':
    main()
