"""Builds the artist-recordings fixture for the "Recording of" column specs.

Writes two files from ONE data table, so the page and the WS/2 mock the specs
serve can never disagree:

  tests/fixtures/artist-recordings-recording-of.html   the page
  tests/fixtures/recording-of-data.json                 recordings, their
                                                        performance relations,
                                                        and the artist's works
  tests/fixtures/artist-recordings-recording-of-bpr.html the same page as the
                                                        batch-add "performance of"
                                                        userscript leaves it (its
                                                        markup copied from
                                                        debug/A-R-3rd-works.html):
                                                        div.work / div.suggested-work
                                                        in Name, a trailing
                                                        <th>Performance Attributes</th>
                                                        and td.bpr_attrs per row

Shape, and why:
  - Column order Name, Artist, ISRCs, Rating, Length, Release groups — the real
    artist-recordings order (minus the checkbox column). Length sits AFTER
    Name, so the two new columns inserted after Name shift it by two, which is
    what the integer-column (colon alignment) checks are for.
  - Rows cover every cell shape: no relation, one plain relation, live with a
    date, cover+live, a two-work medley, partial, instrumental.
  - Rows without a relation cover the suggestion cases: an exact title match,
    an exact match only after dropping "(alternate take)", a fuzzy match
    ("Racing in the Streets" vs work "Racing in the Street", with a worse
    decoy), no match at all, and the same unperformed title twice (the memo).
  - Recording titles use real typographic apostrophes where MusicBrainz does,
    so the title normaliser's punctuation map is exercised.

usage: python3 scripts/build-recording-of-fixture.py
"""
import html
import json
import os

ROOT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures')
ARTIST = '89729b97-90a3-4f84-9e88-e16f96cab350'
ARTIST_NAME = 'Test Artist'


def rid(i):
    """Recording MBID for row i."""
    return f'bbbbbbbb-0000-4000-8000-{i:012d}'


def wid(i):
    """Work MBID number i."""
    return f'cccccccc-0000-4000-8000-{i:012d}'


WORKS = {
    'BTR': (wid(1), 'Born to Run', ''),
    'CHF': (wid(2), 'Can’t Help Falling in Love', ''),
    'HEAT': (wid(3), '(Love Is Like a) Heat Wave', ''),
    'JC': (wid(4), 'Jackson Cage', ''),
    'TR': (wid(5), 'Thunder Road', ''),
    'JUNG': (wid(6), 'Jungleland', ''),
    'BAD': (wid(7), 'Badlands', ''),
    'PIAN': (wid(8), 'Prove It All Night', ''),
    'RITS': (wid(9), 'Racing in the Street', ''),
    'RITS78': (wid(10), 'Racing in the Street ’78', 'Darkness outtakes version'),
    'DARK': (wid(11), 'Darkness on the Edge of Town', ''),
    'PL': (wid(12), 'The Promised Land', ''),
    'ROS': (wid(13), 'Rosalita (Come Out Tonight)', ''),
    'HH': (wid(14), 'Hungry Heart', ''),
}

# Works the artist's own work browse returns (the suggestion catalogue). The
# two covers are not the artist's works. The decoy RITS78 comes BEFORE RITS on
# purpose: both are within the fuzzy threshold of "Racing in the Streets", so a
# matcher that took the first hit instead of the closest would pick the decoy.
CATALOGUE = ['BTR', 'JC', 'TR', 'JUNG', 'BAD', 'PIAN', 'RITS78', 'RITS', 'DARK', 'PL', 'ROS', 'HH']


def perf(key, attrs=(), date=None):
    """One performance relation to work `key`."""
    w = WORKS[key]
    return {'work': key, 'attrs': list(attrs), 'begin': date, 'end': date}


# (title, comment, length, relations)
ROWS = [
    ('Born to Run', '', '4:30', [perf('BTR')]),
    ('Born to Run', 'live, 1975-10-18: Hammersmith Odeon, London, UK', '4:51', [perf('BTR', ['live'], '1975-10-18')]),
    ('Can’t Help Falling in Love', 'live, 1981-04-18: Palais des Sports de Saint-Ouen, Paris, France', '2:57',
     [perf('CHF', ['cover', 'live'], '1981-04-18')]),
    ('(Love Is Like a) Heatwave / Jackson Cage', 'live, 1980-11-05', '7:12',
     [perf('HEAT', ['cover', 'live', 'medley'], '1980-11-05'), perf('JC', ['live', 'medley'], '1980-11-05')]),
    ('Thunder Road', 'partial', '1:48', [perf('TR', ['partial'])]),
    ('Jungleland', 'instrumental', '9:34', [perf('JUNG', ['instrumental'])]),
    ('Badlands', '', '4:01', []),
    ('Prove It All Night (alternate take)', '', '3:56', []),
    ('Racing in the Streets', '', '6:52', []),
    ('Untitled Jam', '', '5:05', []),
    ('Thunder Road', 'live, 1978-07-07: The Roxy, West Hollywood, CA, USA', '5:40', [perf('TR', ['live'], '1978-07-07')]),
    ('Badlands', 'live, 1978-09-19', '4:20', []),
    ('Darkness on the Edge of Town', '', '4:30', [perf('DARK')]),
    ('The Promised Land', '', '4:33', []),
    ('Rosalita (Come Out Tonight)', '', '7:02', [perf('ROS')]),
    ('Hungry Heart', '', '3:19', [perf('HH')]),
]


def ws_relation(r):
    """A relation in the WS/2 JSON shape scripts/probe-recording-work-rels.py recorded."""
    wid_, title, dis = WORKS[r['work']]
    attr_ids = {'live': '70007db6-a8bc-46d7-a770-80e6a0bb551a', 'cover': '1e8536bd-6eda-3822-8e78-1c0f4d3d2113',
                'partial': 'd2b63be6-91ec-426a-987a-30b47f8aae2d', 'instrumental': 'c031ed4f-c9bb-4394-8cf5-e8ce4db512ae',
                'medley': '37da3398-5d6c-4e3e-8f8b-6a9ee1e5ef3d'}
    return {
        'type': 'performance', 'type-id': 'a3005666-a872-32c3-ad06-98af558e99b0',
        'target-type': 'work', 'direction': 'forward',
        'attributes': r['attrs'], 'attribute-ids': {a: attr_ids[a] for a in r['attrs']}, 'attribute-values': {},
        'begin': r['begin'], 'end': r['end'], 'ended': bool(r['begin']),
        'source-credit': '', 'target-credit': '',
        'work': {'id': wid_, 'title': title, 'disambiguation': dis, 'type': 'Song', 'attributes': [], 'iswcs': [],
                 'languages': ['eng'], 'language': 'eng'},
    }


BPR_STYLE = 'font-size: 0.9em; padding: 0.3em 0.3em 0.3em 1em;'
BPR_ATTRS_TD = ('<td class="bpr_attrs" style="color: black;"><span class="bpr-attr partial" style="cursor: pointer;">part.</span>/'
                '<span class="bpr-attr live" style="cursor: pointer;">live</span>/'
                '<span class="bpr-attr instrumental" style="cursor: pointer;">inst.</span>/'
                '<span class="bpr-attr cover" style="cursor: pointer;">cover</span>&nbsp;'
                '<input type="text" placeholder="yyyy-mm-dd" class="date bpr-date-input" '
                'style="color: rgb(221, 221, 221); width: 7em; border: 1px solid rgb(153, 153, 153);"></td>')


def bpr_name_extra(title, rels):
    """What the batch-add userscript appends to a Name cell."""
    if rels:
        return ''.join(
            f'<div class="work" style="{BPR_STYLE}">{" ".join(r["attrs"])} recording of '
            f'<a href="/work/{WORKS[r["work"]][0]}">{html.escape(WORKS[r["work"]][1])}</a></div>' for r in rels)
    if title == 'Badlands':
        w = WORKS['BAD']
        return (f'<div class="suggested-work" style="{BPR_STYLE}"><span style="color: green; font-weight: bold;">'
                f'Suggested work:</span>&nbsp;<a href="/work/{w[0]}">{w[1]}</a></div>')
    return ''


def page_html(trs, bpr):
    """The whole page around the rows."""
    extra_th = '\n                    <th>Performance Attributes</th>' if bpr else ''
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>{ARTIST_NAME} - Recordings - MusicBrainz</title>
</head>
<body>
    <div id="content">
        <div class="artistheader">
            <h1><a href="/artist/{ARTIST}"><bdi>{ARTIST_NAME}</bdi></a></h1>
        </div>
        <div class="tabs">
            <ul><li class="sel"><a href="/artist/{ARTIST}/recordings">Recordings</a></li></ul>
        </div>
        <h2>Recordings</h2>
        <!--
            GENERATED by scripts/build-recording-of-fixture.py — do not hand-edit.
            {len(ROWS)} recordings; their performance relations and the artist's
            works are in recording-of-data.json, which the specs serve as WS/2.{" With the batch-add userscript's markup." if bpr else ""}
        -->
        <table class="tbl">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Artist</th>
                    <th>ISRCs</th>
                    <th class="rating c">Rating</th>
                    <th>Length</th>
                    <th>Release groups</th>{extra_th}
                </tr>
            </thead>
            <tbody>
{chr(10).join(trs)}
            </tbody>
        </table>
        <ul class="pagination"></ul>
    </div>
</body>
</html>
'''


def main():
    """Writes the pages and the data file."""
    recordings = []
    trs = []
    trs_bpr = []
    for i, (title, comment, length, rels) in enumerate(ROWS):
        recordings.append({'id': rid(i), 'title': title, 'disambiguation': comment, 'length': None,
                           'video': False, 'relations': [ws_relation(r) for r in rels]})
        cm = f' <span class="comment">(<bdi>{html.escape(comment)}</bdi>)</span>' if comment else ''
        for bpr, out in ((False, trs), (True, trs_bpr)):
            extra = bpr_name_extra(title, rels) if bpr else ''
            tail = f'\n                    {BPR_ATTRS_TD}' if bpr else ''
            out.append(f'''                <tr class="{'odd' if i % 2 == 0 else 'even'}">
                    <td><a href="/recording/{rid(i)}"><bdi>{html.escape(title)}</bdi></a>{cm}{extra}</td>
                    <td><a href="/artist/{ARTIST}"><bdi>{ARTIST_NAME}</bdi></a></td>
                    <td></td>
                    <td></td>
                    <td>{length}</td>
                    <td></td>{tail}
                </tr>''')
    page = page_html(trs, False)
    page_bpr = page_html(trs_bpr, True)
    data = {
        'artist': ARTIST,
        'artistName': ARTIST_NAME,
        'recordings': recordings,
        'works': [{'id': WORKS[k][0], 'title': WORKS[k][1], 'disambiguation': WORKS[k][2], 'type': 'Song',
                   'aliases': []} for k in CATALOGUE],
    }
    with open(os.path.join(ROOT, 'artist-recordings-recording-of.html'), 'w', encoding='utf-8') as f:
        f.write(page)
    with open(os.path.join(ROOT, 'artist-recordings-recording-of-bpr.html'), 'w', encoding='utf-8') as f:
        f.write(page_bpr)
    with open(os.path.join(ROOT, 'recording-of-data.json'), 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')
    print(f'{len(ROWS)} rows, {len(CATALOGUE)} catalogue works')


if __name__ == '__main__':
    main()
