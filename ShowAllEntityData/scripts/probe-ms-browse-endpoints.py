"""Session 3 fact-finding: which WS2 endpoint can serve millisecond lengths for
each of the pageTypes still without a source?

Establishes, per pageType, whether a real endpoint exists, what shape its
answer has, and whether it needs paging. Run rate-limited at 1 req/s.
"""
import json
import sys
import time
import urllib.error
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 ( volker.zell@opitz-consulting.com )'
BASE = 'https://musicbrainz.org/ws/2'
_last = [0.0]


def get(path):
    """One rate-limited WS2 GET. Returns (status, parsed-json-or-text)."""
    wait = 1.1 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    _last[0] = time.time()
    url = f'{BASE}/{path}'
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')[:300]
    except Exception as e:                                   # noqa: BLE001
        return 0, str(e)


def probe(label, path, describe):
    print(f'\n=== {label} ===\n    GET /{path}')
    status, data = get(path)
    print(f'    HTTP {status}')
    if status != 200 or not isinstance(data, dict):
        print(f'    -> {str(data)[:300]}')
        return None
    describe(data)
    return data


def count_lengths(items, key='length'):
    n = sum(1 for i in items if isinstance(i, dict) and isinstance(i.get(key), int))
    return f'{n}/{len(items)} carry a numeric "{key}"'


ARTIST = '70248960-cb53-4ea4-943a-edb18f7d336f'      # Bruce Springsteen


def main():
    # 1. artist-recordings — the paged browse the session is named after.
    def d_browse(data):
        recs = data.get('recordings', [])
        print(f'    recording-count: {data.get("recording-count")}, this page: {len(recs)}')
        print(f'    {count_lengths(recs)}')
        if recs:
            print(f'    sample: {recs[0].get("id")} {recs[0].get("length")} {recs[0].get("title")!r}')
    probe('artist-recordings: browse ?artist=', f'recording?artist={ARTIST}&limit=100&offset=0&fmt=json', d_browse)

    # 2. Do area / instrument support recording-rels the way work/artist/place do?
    #    (that is the EXISTING single-request path, not a browse loop)
    for label, path in (
        ('area lookup ?inc=recording-rels', 'area/{mbid}?inc=recording-rels&fmt=json'),
        ('instrument lookup ?inc=recording-rels', 'instrument/{mbid}?inc=recording-rels&fmt=json'),
    ):
        mbid = MBIDS.get(label)
        if not mbid:
            print(f'\n=== {label} === SKIPPED (no mbid resolved)')
            continue

        def d_rels(data):
            rels = data.get('relations', [])
            recs = [r.get('recording') for r in rels if r.get('recording')]
            print(f'    relations: {len(rels)}, recording targets: {len(recs)}')
            print(f'    {count_lengths(recs)}')
        probe(label, path.format(mbid=mbid), d_rels)

    # 3. isrc — a lookup, not a browse.
    if MBIDS.get('isrc'):
        def d_isrc(data):
            recs = data.get('recordings', [])
            print(f'    recordings: {len(recs)}; {count_lengths(recs)}')
        probe('isrc lookup', f'isrc/{MBIDS["isrc"]}?fmt=json', d_isrc)

    # 4. recording-releases — the page lists RELEASES; each row's Length is the
    #    TRACK length on that release, which can differ per release.
    if MBIDS.get('recording'):
        def d_recrel(data):
            print(f'    recording length: {data.get("length")}')
            rels = data.get('releases', [])
            print(f'    releases: {len(rels)}')
            shown = 0
            for rel in rels:
                for med in rel.get('media', []):
                    for tr in med.get('tracks', []):
                        if shown < 6:
                            print(f'      release {rel.get("id")[:8]} track length={tr.get("length")}')
                            shown += 1
        probe('recording-releases: ?inc=releases+media',
              f'recording/{MBIDS["recording"]}?inc=releases+media&fmt=json', d_recrel)


MBIDS = {}


def discover():
    """Resolves the sample MBIDs the probes above need."""
    print('=== discovery ===')
    st, data = get('area?query=Asbury%20Park&fmt=json&limit=3')
    if st == 200:
        for a in data.get('areas', [])[:3]:
            print(f'    area {a.get("id")} {a.get("name")!r}')
        if data.get('areas'):
            MBIDS['area lookup ?inc=recording-rels'] = data['areas'][0]['id']
    st, data = get('instrument?query=harmonica&fmt=json&limit=3')
    if st == 200:
        for i in data.get('instruments', [])[:3]:
            print(f'    instrument {i.get("id")} {i.get("name")!r}')
        if data.get('instruments'):
            MBIDS['instrument lookup ?inc=recording-rels'] = data['instruments'][0]['id']
    st, data = get(f'recording?artist={ARTIST}&limit=3&offset=0&inc=isrcs&fmt=json')
    if st == 200:
        for r in data.get('recordings', [])[:3]:
            print(f'    recording {r.get("id")} {r.get("length")} {r.get("title")!r} isrcs={r.get("isrcs")}')
        recs = data.get('recordings', [])
        if recs:
            MBIDS['recording'] = recs[0]['id']
        for r in recs:
            if r.get('isrcs'):
                MBIDS['isrc'] = r['isrcs'][0]
                break
    print(f'    resolved: {json.dumps(MBIDS, indent=6)}')


if __name__ == '__main__':
    discover()
    main()
    sys.exit(0)
