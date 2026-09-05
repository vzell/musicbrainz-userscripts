#!/usr/bin/env python3
"""
Add the `eventParts` syntheticColumnExtractor to every recording-listing
pageType that was missing it.

`eventParts` parses a recording's disambiguation comment — MusicBrainz's
free-form live-performance encoding, e.g. "live, 1975-10-18, early show:
The Roxy Theatre, West Hollywood, CA, USA" — into nine synthetic columns.
It was already wired to twelve recording-listing pageTypes and absent from
these eleven, all of which produce the same synthetic `Comment` source
column via `extractMainColumn`.

Each target is addressed by LINE NUMBER rather than by a text anchor,
because several of the blocks involved are byte-identical to each other
and so cannot be disambiguated by content alone:

  - collections-releases['Recordings'] vs series-releases['Recordings']
  - user-tag-value['Recordings']       vs tag-value['Recordings']
  - place-performances.features        vs place-performances-filtered.features
  - artist-relationships.features      vs artist-relationships-filtered.features

Every insertion is still guarded: the script asserts the expected text at
each anchor line and at the block's `'Recordings': {` / `features: {`
opening line before touching anything, and refuses to write if any guard
fails. Insertions are applied in DESCENDING line order so earlier anchors
stay valid.

Line numbers are those of the file as it stood at commit d117bbc
(v9.99.1016) — this script is a record of the edit, not a general tool.

Run:  python3 scripts/add-eventparts-to-recording-pagetypes.py
"""

import sys

SRC = 'ShowAllEntityData.user.js'

EVENT_PARTS_ENTRY = (
    "{ sourceColumn: 'Comment', extractor: 'eventParts', syntheticColumns: "
    "['Event-Type', 'Event-Date', 'Event-Detail', 'Event-Venue', "
    "'Event-Venue-Detail', 'Event-City', 'Event-State', 'Event-Country', "
    "'Event-Additional-Info'] }"
)

# (label, opening_line, opening_text, anchor_line, anchor_text, key_indent)
#
# opening_line/opening_text  — the block header, proving we are in the right
#                              pageType's Recordings / features block.
# anchor_line/anchor_text    — the closing line of that block's
#                              `columnExtractors: [ … ]`, after which the new
#                              `syntheticColumnExtractors` block is inserted.
# key_indent                 — spaces before the inserted key (20 inside an
#                              entityFeatures entry, 16 in a top-level
#                              `features:` block).
#
# When `columnExtractors` was the block's LAST property its closing line has
# no trailing comma; one is added, and the newly-inserted block then becomes
# the last property and is written without one, matching the file's style.
TARGETS = [
    (
        "user-tag-value-entity['Recordings']",
        13423, "                'Recordings': {",
        13424,
        "                    columnExtractors: [ { sourceColumn: 'Recording', "
        "extractor: 'artistCredit', syntheticColumns: ['Artist'] } ]",
        20,
    ),
    (
        "user-tag-value['Recordings']",
        13488, "                'Recordings': {",
        13492, "                    ]",
        20,
    ),
    (
        "tag-value-entity['Recordings']",
        13572, "                'Recordings': {",
        13576, "                    ],",
        20,
    ),
    (
        "tag-value['Recordings']",
        13639, "                'Recordings': {",
        13643, "                    ]",
        20,
    ),
    (
        "collections-releases['Recordings']",
        13778, "                'Recordings': {",
        13781, "                    ],",
        20,
    ),
    (
        "search['Recordings']",
        14042, "                'Recordings': {",
        14047, "                    ],",
        20,
    ),
    (
        "place-performances-filtered.features",
        14558, "            features: {",
        14562, "                ],",
        16,
    ),
    (
        "place-performances.features",
        14585, "            features: {",
        14589, "                ],",
        16,
    ),
    (
        "series-releases['Recordings']",
        14703, "                'Recordings': {",
        14706, "                    ],",
        20,
    ),
    (
        "artist-relationships-filtered.features",
        14846, "            features: {",
        14854, "                ],",
        16,
    ),
    (
        "artist-relationships.features",
        14871, "            features: {",
        14879, "                ],",
        16,
    ),
]


def main():
    with open(SRC, encoding='utf-8') as fh:
        lines = fh.read().split('\n')

    problems = []
    for label, open_ln, open_txt, anchor_ln, anchor_txt, _indent in TARGETS:
        got_open = lines[open_ln - 1]
        got_anchor = lines[anchor_ln - 1]
        if got_open != open_txt:
            problems.append(
                f"{label}: line {open_ln} expected {open_txt!r}, got {got_open!r}")
        if got_anchor != anchor_txt:
            problems.append(
                f"{label}: line {anchor_ln} expected {anchor_txt!r}, got {got_anchor!r}")
        if 'syntheticColumnExtractors' in '\n'.join(lines[open_ln - 1:anchor_ln + 6]):
            problems.append(f"{label}: already has a syntheticColumnExtractors key")

    if problems:
        print('REFUSING TO WRITE — anchor verification failed:')
        for p in problems:
            print('  - ' + p)
        return 1

    # Descending order so earlier anchor line numbers stay valid.
    for label, _open_ln, _open_txt, anchor_ln, anchor_txt, indent in sorted(
            TARGETS, key=lambda t: t[3], reverse=True):
        was_last = not anchor_txt.endswith(',')
        if was_last:
            # The preceding array is no longer last, so it needs a comma.
            lines[anchor_ln - 1] = anchor_txt + ','

        pad = ' ' * indent
        # No trailing comma when this block is now the block's last property.
        lines[anchor_ln:anchor_ln] = [
            f'{pad}syntheticColumnExtractors: [',
            f'{pad}    {EVENT_PARTS_ENTRY}',
            f'{pad}]' + ('' if was_last else ','),
        ]
        print(f'inserted after line {anchor_ln}: {label}')

    with open(SRC, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(lines))

    print(f'\n{len(TARGETS)} pageTypes updated.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
