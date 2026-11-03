#!/usr/bin/env python3
"""Probe archive.org item pages for the planned `ia-details` pageType
(org/foreign-detail-PTs.org, vzell 2026-11-03: "one branch each,
archive.org first").

For each item (named shapes plus the first N of a few year searches) it
asks /metadata/<id> and reports what the pageType's parse must handle:

  - mediatype, number of files, item size;
  - the ORIGINAL audio files by format, how many carry `track` / `title`,
    whether their names carry a disc prefix ("1-01. …", "d1t01", "cd2"),
    and the derivative formats made from them (VBR MP3, Ogg, …);
  - video originals and their derivatives;
  - original pictures;
  - whether the item page's RAW HTML (not a browser's save) carries the
    metadata JSON in `input.js-ia-metadata` (a request saved if it does).

Read-only, anonymous, one request a second. Writes the full result to
debug/ia-details-probe.json (gitignored) and prints a summary.

Usage: python3 scripts/probe-ia-details.py [N]
"""

import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 (https://github.com/vzell/mb-userscripts)'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAMED = [
    'bs1975-12-27.aud.jk.cb.hrubesh.flac16',            # two discs, "1-01." names
    'bs1975-02-05.prefm-fm.prodigalson.jems.flac16',
    'bs1975-03-07.aud.cdr.unknown.flac16',
    'bs1977-02-28.aud.ntl-2.jems.flac16',
    'live-at-the-ahmanson-theater-los-angeles-1973',    # video
    '1975-bruce-springsteen-widener-college-audience-cam',  # video
]
YEARS = ['1978', '1985', '2016']
AUDIO_ORIG = re.compile(r'^(flac|24bit flac|shorten|vbr mp3|mp3|ogg vorbis|wave|aiff|apple lossless audio|m4a)', re.I)
VIDEO = re.compile(r'(mpeg4|h\.264|matroska|ogg video|mpeg2|quicktime|avi|512kb mpeg4)', re.I)
PIC = re.compile(r'^(jpeg|png|gif|webp)$', re.I)
DISC = re.compile(r'(^|[^a-z])(?:d|cd|disc|disk)\s*(\d+)|^(\d+)-\d+', re.I)
_last = [0.0]


def get(url, limit=None):
    """GET a URL, one a second; returns (status, body bytes)."""
    wait = 1.1 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    _last[0] = time.time()
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read(limit) if limit else r.read()
    except urllib.error.HTTPError as e:
        return e.code, b''
    except Exception as e:  # noqa: BLE001 - a probe reports every failure
        return 0, str(e).encode()


def search_ids(year, n):
    """The first n identifiers of the Springsteen search of one year, by date."""
    q = f'subject:"Bruce Springsteen" AND year:{year}'
    url = ('https://archive.org/advancedsearch.php?' + urllib.parse.urlencode(
        {'q': q, 'fl[]': 'identifier', 'rows': n, 'page': 1, 'output': 'json', 'sort[]': 'date asc'}))
    st, body = get(url)
    if st != 200:
        return []
    return [d['identifier'] for d in json.loads(body)['response']['docs']]


def probe(ident):
    """One item's shape."""
    st, body = get(f'https://archive.org/metadata/{ident}')
    if st != 200 or not body:
        return {'id': ident, 'status': st}
    m = json.loads(body)
    files = m.get('files', [])
    md = m.get('metadata', {})
    orig_audio = [f for f in files if f.get('source') == 'original' and AUDIO_ORIG.match(f.get('format', ''))]
    derivs = {}
    for f in files:
        if f.get('source') == 'derivative' and f.get('original'):
            derivs.setdefault(f['original'], []).append(f.get('format', ''))
    by_fmt = {}
    for f in orig_audio:
        by_fmt[f.get('format')] = by_fmt.get(f.get('format'), 0) + 1
    discs = sorted({(m2.group(2) or m2.group(3)) for f in orig_audio for m2 in [DISC.search(f['name'])] if m2})
    hs, html = get(f'https://archive.org/details/{ident}', 3_000_000)
    return {
        'id': ident, 'status': st, 'mediatype': md.get('mediatype'), 'files': len(files), 'item_size': m.get('item_size'),
        'audio_originals': by_fmt, 'with_track': sum(1 for f in orig_audio if f.get('track')),
        'with_title': sum(1 for f in orig_audio if f.get('title')), 'with_length': sum(1 for f in orig_audio if f.get('length')),
        'disc_prefixes': discs, 'sample_names': [f['name'] for f in orig_audio[:3]],
        'derivative_formats': sorted({x for f in orig_audio for x in derivs.get(f['name'], [])}),
        'video_originals': [f'{f.get("format")}: {f["name"]}' for f in files if f.get('source') == 'original' and VIDEO.search(f.get('format', ''))][:3],
        'pictures': sum(1 for f in files if f.get('source') == 'original' and PIC.match(f.get('format', ''))),
        'page_status': hs, 'page_has_js_ia_metadata': b'js-ia-metadata' in html,
    }


def main():
    """Probe the named items and the year searches; write and summarise."""
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    ids = list(NAMED)
    for y in YEARS:
        ids += [i for i in search_ids(y, n) if i not in ids]
    out = [probe(i) for i in ids]
    os.makedirs(os.path.join(ROOT, 'debug'), exist_ok=True)
    with open(os.path.join(ROOT, 'debug', 'ia-details-probe.json'), 'w', encoding='utf-8') as fh:
        json.dump(out, fh, indent=1)
    for r in out:
        if r.get('status') != 200:
            print(f"{r['id']}: HTTP {r.get('status')}")
            continue
        print(f"{r['id']}: {r['mediatype']}, {r['files']} files; audio {r['audio_originals']} "
              f"(track {r['with_track']}, title {r['with_title']}, length {r['with_length']}); discs {r['disc_prefixes']}; "
              f"derivs {r['derivative_formats']}; video {len(r['video_originals'])}; pics {r['pictures']}; "
              f"page {r['page_status']} js-ia-metadata {r['page_has_js_ia_metadata']}; e.g. {r['sample_names'][:2]}")


if __name__ == '__main__':
    main()
