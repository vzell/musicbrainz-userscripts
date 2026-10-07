"""Phase 0 of the popup engine (org/iframe.org): do the Web Service requests
the planned MusicBrainz entity cards would make return what the cards show?

The card of each entity kind is planned to cost at most ONE request on hover,
and the pinned window one or two more. org/iframe.org's "Per entity kind"
table lists the candidate requests; this probe sends each one against the live
endpoint and reports, per kind, which of the fields the card needs are there,
how big the answer is, and how long it took.

What https://musicbrainz.org/doc/MusicBrainz_API says (checked 2026-10-07):
- every entity accepts `aliases`, `annotation`, `tags`, `ratings`, `genres`
  and the `<kind>-rels` relationship includes; `artist-credits`, `isrcs`,
  `media`, `discids` modify the sub-queries (release: `labels`, `recordings`,
  `release-groups`; recording: `releases`, `release-groups`);
- `/discid/<id>`, `/isrc/<code>`, `/iswc/<code>` take the inc of a release,
  recording and work lookup respectively;
- browse: limit 25 by default, at most 100, with `offset`; a release browse
  "contains no more than 500 tracks" in all, so `offset` must grow by the
  number of releases RETURNED, not by the limit; recording?work=,
  event?place=, release?label=, release?recording=, release-group?artist=&type=
  are all valid browses;
- nothing about an event's `setlist`, nor about the `cover-art-archive` block
  of a release. Those two are what this probe has to establish.
https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting (checked
2026-10-07): one request per second per IP on average, 503 beyond that, a
User-Agent with a contact required. The probe keeps 1.1 s between requests,
as the userscript's `_relAwaitRateSlot()` does, and retries 429/502/503/504.

Sections:
  1. lookups, one per kind, with the candidate inc set: status, bytes, ms,
     and each field the card needs (present / missing / value);
  2. the release group's release browse, paged with `offset` the documented
     way: releases per page, tracks per page, duplicates across pages, the
     order, and how many releases carry `cover-art-archive.front`;
  3. counts the cards want ("on N releases", "N recordings", "N events"):
     a lookup's embedded list versus a browse's `*-count` with limit=1, which
     tells whether a lookup's sub-query list is complete;
  4. the rate-limit headers the Web Service sends.

Results of the first runs (2026-10-07, host petri) are recorded in
org/iframe.org, "Phase 0: probes", R1 to R5: every candidate inc set answers;
a lookup's sub-query list stops at 25 (counts need a limit=1 browse); a
release-group browse with inc=media+labels returns 100 releases a page in no
date order, each with its cover-art-archive block; the legend's REC_BTR is a
video recording, so the studio "Thunder Road" (via its ISRC) is probed too.

usage: python3 scripts/probe-mb-entity-lookups.py [--max-pages N] [--json OUT]
       (37 requests, about 45 s)
"""
import argparse
import json
import time
import urllib.error
import urllib.request

UA = 'ShowAllEntityData-popup-engine-probe/1.0 ( info@volkerzell.de )'
WS = 'https://musicbrainz.org/ws/2'
EAA = 'https://eventartarchive.org/event'
SPACING_S = 1.1

# The identifier legend of PAGETYPES-TESTING-REFERENCE.org.
ARTIST = '70248960-cb53-4ea4-943a-edb18f7d336f'
RG_BTR = '39b22944-7503-3937-8bba-09b17281cc6a'
REL_BTR = '1d404e1d-fcb6-3a52-b478-e706e893c897'
REL_DARK = '9b94e384-60e3-44e3-b0ba-dd09a68485df'
REC_BTR = '875a6a0d-1fcc-416e-959f-433f96b0da17'
WORK_BTR = '9893a23c-f282-3b07-a2db-b4f2f3b9f4b2'
LABEL_COL = '011d1192-6f65-45bd-85c4-0400dd45693e'
PLACE_SP = '6a59a67c-fcc5-491f-949c-bfc45bc97463'
AREA_NJ = 'a36544c1-cb40-4f44-9e0e-7a5a69e403a8'
EVENT_MAN = '3f2ca30a-7de4-4964-ad30-48376535fec8'
EVENT_SX = 'ad5aaaef-8dd5-4152-987c-f6eaad05c20e'
SERIES_ST = 'aa3694d3-a3d0-48ed-8f07-5b576de87908'
INSTR_GT = '63021302-86cd-4aee-80df-2270d54f4978'
ISRC = 'USSM17500803'

_last = [0.0]
_headers_seen = {}


def get(url, accept='application/json', attempts=5):
    """GET one URL politely: 1.1 s after the previous request, transient
    statuses retried with a widening wait (Retry-After as a floor).

    Returns (status, body-bytes, elapsed-ms, headers-dict). A 4xx other than
    429 is returned, not raised, so an invalid inc set shows up as a status.
    """
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': accept})
    status, body, headers = 0, b'', {}
    for attempt in range(1, attempts + 1):
        wait = _last[0] + SPACING_S - time.time()
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                status, body, headers = r.status, r.read(), dict(r.headers)
        except urllib.error.HTTPError as e:
            status, body, headers = e.code, e.read(), dict(e.headers or {})
        except Exception as e:  # transport failure: retry like a 503
            status, body, headers = 0, str(e).encode(), {}
        ms = round((time.time() - t0) * 1000)
        for h in ('x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'retry-after'):
            for k, v in headers.items():
                if k.lower() == h:
                    _headers_seen[h] = v
        if status in (0, 429, 502, 503, 504) and attempt < attempts:
            ra = next((v for k, v in headers.items() if k.lower() == 'retry-after'), None)
            floor = float(ra) if ra and ra.isdigit() else 0
            time.sleep(max(SPACING_S * attempt, floor))
            continue
        return status, body, ms, headers
    return status, body, 0, headers


def ws(path):
    """GET a Web Service path as JSON; returns (status, data-or-None, bytes, ms)."""
    sep = '&' if '?' in path else '?'
    status, body, ms, _ = get(f'{WS}/{path}{sep}fmt=json')
    data = None
    if status == 200:
        try:
            data = json.loads(body.decode('utf-8'))
        except ValueError:
            data = None
    return status, data, len(body), ms


def rels_by(data, key='target-type'):
    """Counts an entity's relations by target type (or by relation type)."""
    out = {}
    for r in (data or {}).get('relations') or []:
        out[r.get(key)] = out.get(r.get(key), 0) + 1
    return out


def show(title, status, nbytes, ms, rows):
    """Prints one lookup's report: a header line, then label: value rows."""
    print(f'\n## {title}\n   HTTP {status} · {nbytes:,} bytes · {ms} ms')
    for label, value in rows:
        print(f'   {label:<28} {value}')


def has(v):
    """'yes (value)' for a present value, 'MISSING' for None/empty."""
    if v is None or v == '' or v == [] or v == {}:
        return 'MISSING'
    s = json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else v
    return 'yes  ' + (s if len(s) <= 90 else s[:87] + '...')


def section_lookups(results):
    """Section 1: one lookup per kind with the candidate inc set."""
    print('\n# 1. Lookups, one per kind')

    s, d, b, ms = ws(f'release-group/{RG_BTR}?inc=artist-credits+genres+ratings+url-rels+annotation')
    d = d or {}
    show('release-group (pin): inc=artist-credits+genres+ratings+url-rels+annotation', s, b, ms, [
        ('primary-type', has(d.get('primary-type'))),
        ('secondary-types', has(d.get('secondary-types')) if d.get('secondary-types') else 'yes  [] (none)'),
        ('first-release-date', has(d.get('first-release-date'))),
        ('artist-credit', has([c.get('name') for c in d.get('artist-credit') or []])),
        ('rating', has(d.get('rating'))),
        ('genres', has([g.get('name') for g in d.get('genres') or []][:5])),
        ('url relations', has(rels_by(d))),
        ('annotation key', 'present: ' + repr((d.get('annotation') or '')[:60]) if 'annotation' in d else 'ABSENT'),
    ])
    results['release-group'] = {'status': s, 'bytes': b}

    s, d, b, ms = ws(f'release/{REL_BTR}?inc=artist-credits+labels+recordings+release-groups+media')
    d = d or {}
    media = d.get('media') or []
    tracks = [t for m in media for t in m.get('tracks') or []]
    show('release (card): inc=artist-credits+labels+recordings+release-groups+media', s, b, ms, [
        ('status / packaging', has([d.get('status'), d.get('packaging')])),
        ('date / country', has([d.get('date'), d.get('country')])),
        ('release-events', has(len(d.get('release-events') or []))),
        ('label-info', has([((li.get('label') or {}).get('name'), li.get('catalog-number')) for li in d.get('label-info') or []])),
        ('barcode', has(d.get('barcode')) if d.get('barcode') is not None else 'MISSING'),
        ('text-representation', has(d.get('text-representation'))),
        ('media: format / tracks', has([(m.get('format'), m.get('track-count')) for m in media])),
        ('track titles + lengths', has(f'{len(tracks)} tracks, {sum(1 for t in tracks if t.get("length"))} with length')),
        ('release-group type', has((d.get('release-group') or {}).get('primary-type'))),
        ('cover-art-archive', has(d.get('cover-art-archive'))),
    ])
    results['release'] = {'status': s, 'bytes': b}

    # REC_BTR in the legend is a VIDEO recording of "Born to Run" (2005, three
    # releases, no ISRC, no work): an untypical card. The studio "Thunder
    # Road" is found through its ISRC and probed first.
    s, d, b, ms = ws(f'isrc/{ISRC}')
    recs = (d or {}).get('recordings') or []
    show(f'isrc {ISRC}', s, b, ms, [('recordings', has([(r.get('title'), r.get('id')) for r in recs]))])
    results['rec-thunder'] = recs[0]['id'] if recs else None
    for name, rid in (('Thunder Road, via its ISRC', results['rec-thunder']), ('REC_BTR', REC_BTR)):
        if not rid:
            continue
        s, d, b, ms = ws(f'recording/{rid}?inc=artist-credits+isrcs+releases+work-rels')
        d = d or {}
        results[f'releases-in-lookup {rid}'] = len(d.get('releases') or [])
        show(f'recording {name} (card): inc=artist-credits+isrcs+releases+work-rels', s, b, ms, [
            ('title / length', has([d.get('title'), d.get('length')])),
            ('first-release-date', has(d.get('first-release-date'))),
            ('video', has(str(d.get('video')))),
            ('isrcs', has(d.get('isrcs'))),
            ('releases (embedded list)', has(len(d.get('releases') or []))),
            ('work relations', has([(r.get('type'), (r.get('work') or {}).get('title')) for r in d.get('relations') or []])),
        ])
        results[f'recording {name}'] = {'status': s, 'bytes': b}

        s, d, b, ms = ws(f'recording/{rid}?inc=artist-rels+place-rels+event-rels')
        show(f'recording {name} (pin): inc=artist-rels+place-rels+event-rels', s, b, ms, [
            ('relations by target', has(rels_by(d))),
            ('relation types', has(rels_by(d, 'type'))),
        ])

    s, d, b, ms = ws(f'work/{WORK_BTR}?inc=artist-rels+label-rels+work-rels')
    d = d or {}
    results['iswc'] = (d.get('iswcs') or [None])[0]
    show('work (card): inc=artist-rels+label-rels+work-rels', s, b, ms, [
        ('type / language(s)', has([d.get('type'), d.get('language'), d.get('languages')])),
        ('iswcs', has(d.get('iswcs'))),
        ('relations by target', has(rels_by(d))),
        ('relation types', has(rels_by(d, 'type'))),
    ])
    results['work'] = {'status': s, 'bytes': b}

    s, d, b, ms = ws(f'artist/{ARTIST}?inc=genres+ratings+url-rels+aliases')
    d = d or {}
    show('artist (card): inc=genres+ratings+url-rels+aliases', s, b, ms, [
        ('type / gender', has([d.get('type'), d.get('gender')])),
        ('area / begin-area', has([(d.get('area') or {}).get('name'), (d.get('begin-area') or {}).get('name')])),
        ('life-span', has(d.get('life-span'))),
        ('disambiguation', has(d.get('disambiguation'))),
        ('ipis / isnis', has([d.get('ipis'), d.get('isnis')])),
        ('genres', has([g.get('name') for g in d.get('genres') or []][:5])),
        ('rating', has(d.get('rating'))),
        ('url relations', has(len(d.get('relations') or []))),
        ('aliases', has(len(d.get('aliases') or []))),
    ])
    results['artist'] = {'status': s, 'bytes': b}

    s, d, b, ms = ws(f'label/{LABEL_COL}?inc=genres+url-rels+label-rels')
    d = d or {}
    show('label (card): inc=genres+url-rels+label-rels', s, b, ms, [
        ('type / label-code', has([d.get('type'), d.get('label-code')])),
        ('area', has((d.get('area') or {}).get('name'))),
        ('life-span', has(d.get('life-span'))),
        ('genres', has([g.get('name') for g in d.get('genres') or []][:5])),
        ('relations by target', has(rels_by(d))),
        ('label relation types', has({k: v for k, v in rels_by(d, 'type').items()})),
    ])
    results['label'] = {'status': s, 'bytes': b}

    for name, mbid in (('EVENT_MAN', EVENT_MAN), ('EVENT_SX', EVENT_SX)):
        s, d, b, ms = ws(f'event/{mbid}?inc=artist-rels+place-rels+recording-rels+release-rels')
        d = d or {}
        setlist = d.get('setlist')
        show(f'event {name} (card): inc=artist-rels+place-rels+recording-rels+release-rels', s, b, ms, [
            ('type / time / cancelled', has([d.get('type'), d.get('time'), d.get('cancelled')])),
            ('life-span', has(d.get('life-span'))),
            ('setlist key', ('present, ' + (f'{len(setlist.splitlines())} lines' if setlist else 'empty')) if 'setlist' in d else 'ABSENT'),
            ('relations by target', has(rels_by(d))),
            ('relation types', has(rels_by(d, 'type'))),
        ])
        results[f'event-{name}'] = {'status': s, 'bytes': b, 'setlist': bool(setlist)}

    s, d, b, ms = ws(f'event/{EVENT_MAN}?inc=release-group-rels')
    show('event EVENT_MAN: inc=release-group-rels (is an event-to-release-group link a thing?)', s, b, ms, [
        ('relations by target', has(rels_by(d)) if d else f'no data ({s})'),
    ])

    s, d, b, ms = ws(f'place/{PLACE_SP}?inc=area-rels+url-rels')
    d = d or {}
    show('place (card): inc=area-rels+url-rels', s, b, ms, [
        ('type / address', has([d.get('type'), d.get('address')])),
        ('area', has((d.get('area') or {}).get('name'))),
        ('coordinates', has(d.get('coordinates'))),
        ('life-span', has(d.get('life-span'))),
        ('relations by target', has(rels_by(d))),
    ])

    s, d, b, ms = ws(f'area/{AREA_NJ}?inc=area-rels')
    d = d or {}
    parents = [(r.get('area') or {}).get('name') for r in d.get('relations') or []
               if r.get('type') == 'part of' and r.get('direction') == 'backward']
    show('area (card): inc=area-rels', s, b, ms, [
        ('type', has(d.get('type'))),
        ('iso-3166-2-codes', has(d.get('iso-3166-2-codes'))),
        ('parent (part of, backward)', has(parents)),
        ('relations', has(len(d.get('relations') or []))),
    ])

    s, d, b, ms = ws(f'series/{SERIES_ST}?inc=release-rels+release-group-rels')
    d = d or {}
    items = [r for r in d.get('relations') or [] if r.get('type') == 'part of']
    show('series (card): inc=release-rels+release-group-rels', s, b, ms, [
        ('type', has(d.get('type'))),
        ('"part of" items', has(len(items))),
        ('items with ordering-key', has(sum(1 for r in items if r.get('ordering-key') is not None))),
        ('items with a number', has(sum(1 for r in items if (r.get('attribute-values') or {}).get('number')))),
        ('item target types', has(rels_by({'relations': items}))),
    ])

    s, d, b, ms = ws(f'instrument/{INSTR_GT}?inc=instrument-rels+aliases')
    d = d or {}
    show('instrument (card): inc=instrument-rels+aliases', s, b, ms, [
        ('type', has(d.get('type'))),
        ('description', has(d.get('description'))),
        ('relation types', has(rels_by(d, 'type'))),
        ('aliases', has(len(d.get('aliases') or []))),
    ])

    if results.get('iswc'):
        s, d, b, ms = ws(f'iswc/{results["iswc"]}')
        show(f'iswc {results["iswc"]}', s, b, ms, [('works', has([w.get('title') for w in (d or {}).get('works') or []]))])

    s, d, b, ms = ws(f'release/{REL_DARK}?inc=discids')
    discs = [x.get('id') for m in (d or {}).get('media') or [] for x in m.get('discs') or []]
    if discs:
        s2, d2, b2, ms2 = ws(f'discid/{discs[0]}')
        d2 = d2 or {}
        show(f'discid {discs[0]}', s2, b2, ms2, [
            ('sectors / offsets', has([d2.get('sectors'), len(d2.get('offsets') or [])])),
            ('releases', has([r.get('title') for r in d2.get('releases') or []])),
        ])
    else:
        print(f'\n## discid: release {REL_DARK} lists no disc IDs (HTTP {s})')

    s, d, b, ms = ws('collection?editor=vzell&limit=5')
    cols = (d or {}).get('collections') or []
    show('collection browse ?editor=vzell (public collections)', s, b, ms, [
        ('collections', has([(c.get('name'), c.get('entity-type'),
                              next((v for k, v in c.items() if k.endswith('-count')), None)) for c in cols])),
    ])


def section_rg_browse(results, max_pages):
    """Section 2: the release group's releases, paged by releases returned."""
    print('\n# 2. Release browse of release group Born to Run, paged the documented way')
    offset, total, seen, dups, pages = 0, None, set(), 0, []
    caa_front, caa_block, order = 0, 0, []
    while len(pages) < max_pages:
        s, d, b, ms = ws(f'release?release-group={RG_BTR}&inc=media+labels&limit=100&offset={offset}')
        if s != 200 or not d:
            print(f'   offset {offset}: HTTP {s}, stopping')
            break
        rels = d.get('releases') or []
        total = d.get('release-count')
        ntracks = sum(m.get('track-count') or 0 for r in rels for m in r.get('media') or [])
        for r in rels:
            if r['id'] in seen:
                dups += 1
            seen.add(r['id'])
            if 'cover-art-archive' in r:
                caa_block += 1
                caa_front += 1 if (r.get('cover-art-archive') or {}).get('front') else 0
            order.append(r.get('date') or '')
        pages.append((offset, len(rels), ntracks, b, ms))
        print(f'   offset {offset:>4}: {len(rels):>3} releases, {ntracks:>4} tracks, {b:>8,} bytes, {ms} ms')
        if not rels:
            break
        offset += len(rels)
        if total is not None and offset >= total:
            break
    dated = [o for o in order if o]
    print(f'   release-count {total}; fetched {len(seen)} distinct in {len(pages)} request(s); duplicates across pages {dups}')
    print(f'   cover-art-archive block on {caa_block} of {len(order)}; front=true on {caa_front}')
    print(f'   dates in returned order sorted ascending: {dated == sorted(dated)} (first five: {order[:5]})')
    results['rg-browse'] = {'release-count': total, 'pages': pages, 'distinct': len(seen),
                            'duplicates': dups, 'caa-front': caa_front, 'caa-block': caa_block}
    # The 500-track cap: does it bite only when the tracks themselves come
    # along (inc=recordings), or also with inc=media's bare track counts?
    s, d, b, ms = ws(f'release?release-group={RG_BTR}&inc=media+labels+recordings&limit=100')
    rels = (d or {}).get('releases') or []
    listed = sum(len(m.get('tracks') or []) for r in rels for m in r.get('media') or [])
    print(f'   with inc=media+labels+recordings: HTTP {s}, {len(rels)} releases, {listed} tracks listed, {b:,} bytes, {ms} ms')
    results['rg-browse-with-recordings'] = {'releases': len(rels), 'tracks': listed, 'bytes': b}


def section_counts(results):
    """Section 3: is a lookup's embedded list complete, or does a count need a browse?"""
    print('\n# 3. Counts: lookup sub-query list vs browse *-count (limit=1)')
    rid = results.get('rec-thunder') or REC_BTR
    for label, path, key in (
            ('recording -> releases', f'release?recording={rid}&limit=1', 'release-count'),
            ('work -> recordings', f'recording?work={WORK_BTR}&limit=1', 'recording-count'),
            ('place -> events', f'event?place={PLACE_SP}&limit=1', 'event-count'),
            ('label -> releases', f'release?label={LABEL_COL}&limit=1', 'release-count'),
            ('artist -> albums', f'release-group?artist={ARTIST}&type=album&limit=1', 'release-group-count')):
        s, d, b, ms = ws(path)
        count = (d or {}).get(key)
        extra = ''
        if label.startswith('recording'):
            extra = f' (the lookup embedded {results.get(f"releases-in-lookup {rid}")})'
        print(f'   {label:<24} HTTP {s} · {key} = {count}{extra} · {b:,} bytes · {ms} ms')
        results[f'count {label}'] = count


def section_eaa():
    """Event art: does the archive answer for the probed events (its own host)?"""
    print('\n# Event Art Archive index (eventartarchive.org, not MusicBrainz)')
    for name, mbid in (('EVENT_MAN', EVENT_MAN), ('EVENT_SX', EVENT_SX)):
        s, body, ms, _ = get(f'{EAA}/{mbid}')
        n = None
        if s == 200:
            try:
                n = len(json.loads(body.decode('utf-8')).get('images') or [])
            except ValueError:
                n = None
        print(f'   {name}: HTTP {s} · images {n} · {ms} ms')


def main():
    """Runs the four sections and optionally writes the summary as JSON."""
    ap = argparse.ArgumentParser()
    ap.add_argument('--max-pages', type=int, default=6)
    ap.add_argument('--json', default='')
    args = ap.parse_args()
    results = {}
    print(f'Probe run {time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())}')
    section_lookups(results)
    section_rg_browse(results, args.max_pages)
    section_counts(results)
    section_eaa()
    print('\n# 4. Rate-limit headers seen on Web Service answers')
    for k, v in _headers_seen.items():
        print(f'   {k}: {v}')
    if args.json:
        with open(args.json, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=1, ensure_ascii=False)
        print(f'\nwrote {args.json}')


if __name__ == '__main__':
    main()
