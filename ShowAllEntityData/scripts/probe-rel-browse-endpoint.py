"""Can the WS/2 BROWSE endpoint supply the Relationships column's data in bulk?

The column fetches `/ws/2/release/<mbid>?inc=url-rels` one MBID at a time with a
mandatory 1100 ms gap -- ~42 minutes for Bob Dylan's 2301-release page. Seeding
the `rel-ws2` IDB store for a perf arm needs that same data for every row, and
paying 42 minutes of live requests to build a test fixture is not acceptable.

This probes whether `/ws/2/release?artist=<mbid>&inc=url-rels&limit=100` returns
the SAME per-release `relations` arrays, which would cost ceil(2301/100) = 24
requests instead. Same trick `_msCollectRecordingMbids()`'s batch source uses.

Prints, for the first page only:
  - HTTP status and how many releases came back
  - how many carry a `relations` key at all
  - the distribution of url-rel counts per release
  - one worked example, so the shape can be eyeballed against _populateCells()

usage: python3 scripts/probe-rel-browse-endpoint.py
"""
import collections
import json
import time
import urllib.request

DYLAN = '72c536dc-7137-4477-a521-567eeb840fa8'
UA = 'ShowAllEntityData-perf-seed-probe/1.0 ( volker.zell@opitz-consulting.com )'
URL = (f'https://musicbrainz.org/ws/2/release?artist={DYLAN}'
       '&inc=url-rels&limit=100&offset=0&fmt=json')


def get(url, attempts=6):
    # MusicBrainz 503s under bot load in bursts -- the userscript's own batch
    # source retries three times with a widening backoff for the same reason.
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    last = None
    for i in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.status, json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            last = e
            if e.code not in (503, 502, 429):
                raise
            wait = 2 * (i + 1)
            print(f'  HTTP {e.code}, retry {i + 1}/{attempts} in {wait}s')
            time.sleep(wait)
        except Exception as e:            # transient transport failure
            last = e
            wait = 2 * (i + 1)
            print(f'  {type(e).__name__}, retry {i + 1}/{attempts} in {wait}s')
            time.sleep(wait)
    raise last


status, data = get(URL)
releases = data.get('releases', [])
print(f'HTTP {status}')
print(f'release-count (total for this artist): {data.get("release-count")}')
print(f'releases in this page: {len(releases)}')

with_key = [r for r in releases if 'relations' in r]
print(f'releases carrying a "relations" key: {len(with_key)} / {len(releases)}')

dist = collections.Counter()
url_types = collections.Counter()
for r in releases:
    rels = r.get('relations') or []
    urls = [x for x in rels if x.get('target-type') == 'url']
    dist[len(urls)] += 1
    for x in urls:
        url_types[x.get('type')] += 1

print('\nurl-rels per release (count -> how many releases):')
for k in sorted(dist):
    print(f'  {k:>3} url-rels : {dist[k]:>4} releases')

print('\nmost common url-rel types:')
for t, n in url_types.most_common(12):
    print(f'  {n:>5}  {t}')

example = next((r for r in releases if (r.get('relations') or [])), None)
if example:
    print(f'\nexample release {example["id"]}:')
    print(json.dumps({'relations': example['relations']}, indent=2)[:900])
else:
    print('\nNO release in this page carries any relation -- browse may not '
          'support inc=url-rels the way the per-entity endpoint does.')
