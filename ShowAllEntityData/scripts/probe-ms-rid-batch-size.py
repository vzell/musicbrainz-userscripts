"""How large can a `rid:` batch get before the search endpoint refuses it?

Batch size sets the request count for every pageType the batched lookup will
serve, so the ceiling is worth knowing exactly rather than guessing.
"""
import json
import time
import urllib.error
import urllib.parse
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
truth = {}
for offset in (0, 100, 200):
    st, data = fetch(f'https://musicbrainz.org/ws/2/recording?artist={ARTIST}'
                     f'&limit=100&offset={offset}&fmt=json')
    if st != 200:
        print(f'browse offset {offset} failed: {st}')
        continue
    for r in data['recordings']:
        if isinstance(r.get('length'), int):
            truth[r['id']] = r['length']
have = list(truth)
print(f'collected {len(have)} recordings with lengths')

for batch in (100, 150, 200):
    if len(have) < batch:
        print(f'\nbatch {batch}: only {len(have)} available, skipping')
        continue
    ids = have[:batch]
    q = 'rid:(' + ' OR '.join(ids) + ')'
    url = ('https://musicbrainz.org/ws/2/recording?query=' + urllib.parse.quote(q)
           + f'&limit={min(batch, 100)}&fmt=json')
    st, data = fetch(url)
    print(f'\nbatch {batch} (URL {len(url)} chars) -> HTTP {st}')
    if st != 200 or not isinstance(data, dict):
        print(f'    {str(data)[:200]}')
        continue
    got = {r['id']: r.get('length') for r in data.get('recordings', [])}
    returned = [i for i in ids if i in got]
    agree = [i for i in returned if got[i] == truth[i]]
    print(f'    count={data.get("count")} returned={len(data.get("recordings", []))} '
          f'of-our-ids={len(returned)}/{batch} agree={len(agree)}')
