"""Finds a real ISRC and checks whether /ws/2/isrc/<isrc> carries lengths.

The `isrc` pageType lists the recordings sharing one ISRC; if that lookup
returns them with lengths it is a one-request source, no batching needed.
"""
import json
import time
import urllib.error
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 ( volker.zell@opitz-consulting.com )'
_last = [0.0]


def _once(url):
    wait = 1.1 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    _last[0] = time.time()
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            return resp.status, json.loads(resp.read().decode('utf-8', 'replace'))
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')[:200]
    except Exception as e:                                   # noqa: BLE001
        return 0, str(e)


def fetch(url, tries=6):
    for attempt in range(tries):
        st, body = _once(url)
        if st != 503:
            return st, body
        time.sleep(2 * (attempt + 1))
    return st, body


ARTIST = '70248960-cb53-4ea4-943a-edb18f7d336f'
found = None
for offset in (0, 100, 200, 300):
    st, data = fetch(f'https://musicbrainz.org/ws/2/recording?artist={ARTIST}'
                     f'&limit=100&offset={offset}&inc=isrcs&fmt=json')
    print(f'browse offset {offset}: HTTP {st}')
    if st != 200:
        continue
    for r in data['recordings']:
        if r.get('isrcs'):
            found = (r['isrcs'][0], r['id'], r.get('length'), r.get('title'))
            break
    if found:
        break

if not found:
    print('no ISRC found in the sampled recordings')
    raise SystemExit(0)

isrc, rid, length, title = found
print(f'\nsample ISRC {isrc} from recording {rid} ({title!r}, length={length})')
st, data = fetch(f'https://musicbrainz.org/ws/2/isrc/{isrc}?fmt=json')
print(f'/ws/2/isrc/{isrc} -> HTTP {st}')
if st == 200 and isinstance(data, dict):
    recs = data.get('recordings', [])
    with_len = [r for r in recs if isinstance(r.get('length'), int)]
    print(f'    recordings: {len(recs)}, with length: {len(with_len)}')
    for r in recs[:5]:
        print(f'      {r["id"]} length={r.get("length")} {r.get("title")!r}')
