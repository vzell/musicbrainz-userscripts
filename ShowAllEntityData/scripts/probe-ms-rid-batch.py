"""Is a batched `rid:` search a viable alternative to a per-page browse loop?

A browse loop's cost is set by the ENTITY's total catalog (Bruce Springsteen:
74,540 recordings = 746 requests), not by how many rows the page actually
shows. A batched lookup keyed on the MBIDs already rendered costs
ceil(rows / batch) instead — and works on pageTypes that have no browse
endpoint at all (instrument-recordings, isrc, search).

This probes whether the recording search index answers `rid:(a OR b OR ...)`
with lengths, and how large a batch survives.
"""
import json
import time
import urllib.error
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 ( volker.zell@opitz-consulting.com )'
_last = [0.0]


def fetch(url, tries=5):
    """WS2 503s under bot load; retry with backoff rather than call it a verdict."""
    for attempt in range(tries):
        st, body, n = _fetch_once(url)
        if st != 503:
            return st, body, n
        time.sleep(2 * (attempt + 1))
    return st, body, n


def _fetch_once(url):
    wait = 1.1 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    _last[0] = time.time()
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            return resp.status, json.loads(resp.read().decode('utf-8', 'replace')), len(url)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')[:300], len(url)
    except Exception as e:                                   # noqa: BLE001
        return 0, str(e), len(url)


ARTIST = '70248960-cb53-4ea4-943a-edb18f7d336f'

print('=== collecting sample recording MBIDs (with known lengths) ===')
st, data, _ = fetch(f'https://musicbrainz.org/ws/2/recording?artist={ARTIST}&limit=100&offset=0&fmt=json')
if st != 200:
    raise SystemExit(f'browse failed: {st} {data}')
truth = {r['id']: r.get('length') for r in data['recordings']}
have = [mbid for mbid, ln in truth.items() if isinstance(ln, int)]
print(f'    {len(truth)} recordings, {len(have)} with a length')

for batch in (10, 25, 50, 100):
    ids = have[:batch]
    if len(ids) < batch:
        print(f'\n=== batch {batch}: only {len(ids)} available, skipping ===')
        continue
    q = 'rid:(' + ' OR '.join(ids) + ')'
    url = ('https://musicbrainz.org/ws/2/recording?query='
           + urllib.parse.quote(q) + f'&limit={batch}&fmt=json')
    st, data, urllen = fetch(url)
    print(f'\n=== batch {batch} (URL {urllen} chars) ===')
    print(f'    HTTP {st}')
    if st != 200 or not isinstance(data, dict):
        print(f'    -> {str(data)[:300]}')
        continue
    recs = data.get('recordings', [])
    got = {r['id']: r.get('length') for r in recs}
    returned = [i for i in ids if i in got]
    with_len = [i for i in returned if isinstance(got[i], int)]
    agree = [i for i in with_len if got[i] == truth[i]]
    print(f'    count={data.get("count")} returned={len(recs)} '
          f'of-our-ids={len(returned)}/{batch} with-length={len(with_len)} '
          f'agree-with-browse={len(agree)}')
    missing = [i for i in ids if i not in got]
    if missing:
        print(f'    MISSING: {len(missing)} e.g. {missing[:3]}')
