"""Round 2: the questions round 1 left open.

  - Does /instrument/<mbid>/recordings really list rows that WS2's instrument
    lookup cannot see? (round 1: 0 recording-rels for "harmonica")
  - What does the recording-releases page's "Length" column actually show —
    the per-release TRACK length, or the recording's own length?
  - Is there a pageable release-browse that carries track lengths?
  - Does the ISRC lookup carry lengths?
  - Can the search API serve a search-results page?
"""
import json
import re
import time
import urllib.error
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 ( volker.zell@opitz-consulting.com )'
_last = [0.0]


def fetch(url, accept='application/json'):
    wait = 1.1 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    _last[0] = time.time()
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': accept})
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            body = resp.read().decode('utf-8', 'replace')
            return resp.status, (json.loads(body) if accept == 'application/json' else body)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')[:400]
    except Exception as e:                                   # noqa: BLE001
        return 0, str(e)


def table_columns_and_rows(html):
    """Extracts the first table.tbl's header names and its first few Length cells."""
    m = re.search(r'<table[^>]*class="[^"]*\btbl\b[^"]*"[^>]*>(.*?)</table>', html, re.S)
    if not m:
        return None, []
    tbl = m.group(1)
    heads = [re.sub(r'<[^>]+>', '', h).strip()
             for h in re.findall(r'<th[^>]*>(.*?)</th>', tbl, re.S)]
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', tbl, re.S)
    return heads, rows


print('=== instrument-recordings: does the PAGE list rows? ===')
url = 'https://musicbrainz.org/instrument/63e37f1a-30b6-4746-8a49-dfb55be3cdd1/recordings'
st, html = fetch(url, accept='text/html')
print(f'    HTTP {st} for {url}')
if st == 200:
    heads, rows = table_columns_and_rows(html)
    print(f'    columns: {heads}')
    print(f'    <tr> count (incl. header): {len(rows)}')
    recs = set(re.findall(r'/recording/([a-f0-9-]{36})', html))
    print(f'    distinct /recording/ links on page: {len(recs)}')

print('\n=== recording-releases: what is in the Length column? ===')
url = 'https://musicbrainz.org/recording/875a6a0d-1fcc-416e-959f-433f96b0da17'
st, html = fetch(url, accept='text/html')
print(f'    HTTP {st} for {url}')
if st == 200:
    heads, rows = table_columns_and_rows(html)
    print(f'    columns: {heads}')
    for r in rows[1:6]:
        cells = [re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', c)).strip()
                 for c in re.findall(r'<td[^>]*>(.*?)</td>', r, re.S)]
        print(f'    row: {cells}')

print('\n=== release browse by recording, with media+recordings ===')
url = ('https://musicbrainz.org/ws/2/release?recording=875a6a0d-1fcc-416e-959f-433f96b0da17'
       '&inc=media+recordings&limit=100&offset=0&fmt=json')
st, data = fetch(url)
print(f'    HTTP {st}')
if st == 200:
    print(f'    release-count: {data.get("release-count")}, this page: {len(data.get("releases", []))}')
    for rel in data.get('releases', [])[:3]:
        for med in rel.get('media', []):
            for tr in med.get('tracks', []):
                print(f'      release {rel["id"][:8]} track "{tr.get("title")}" '
                      f'track-length={tr.get("length")} rec-length={(tr.get("recording") or {}).get("length")}')

print('\n=== isrc lookup ===')
st, data = fetch('https://musicbrainz.org/ws/2/recording/875a6a0d-1fcc-416e-959f-433f96b0da17?inc=isrcs&fmt=json')
isrc = None
if st == 200 and data.get('isrcs'):
    isrc = data['isrcs'][0]
print(f'    isrcs on the sample recording: {data.get("isrcs") if st == 200 else st}')
if not isrc:
    st, data = fetch('https://musicbrainz.org/ws/2/recording?query=isrc:USSM17300030&fmt=json&limit=1')
    isrc = 'USSM17300030'
if isrc:
    st, data = fetch(f'https://musicbrainz.org/ws/2/isrc/{isrc}?fmt=json')
    print(f'    HTTP {st} for /ws/2/isrc/{isrc}')
    if st == 200:
        recs = data.get('recordings', [])
        n = sum(1 for r in recs if isinstance(r.get('length'), int))
        print(f'    recordings: {len(recs)}, with length: {n}')

print('\n=== search API for a recording search page ===')
st, data = fetch('https://musicbrainz.org/ws/2/recording?query=thunder%20road&limit=100&offset=0&fmt=json')
print(f'    HTTP {st}')
if st == 200:
    recs = data.get('recordings', [])
    n = sum(1 for r in recs if isinstance(r.get('length'), int))
    print(f'    count: {data.get("count")}, this page: {len(recs)}, with length: {n}')
