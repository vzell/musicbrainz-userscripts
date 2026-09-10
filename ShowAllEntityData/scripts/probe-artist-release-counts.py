"""Size candidate artists for an instrumented `artist-releases` perf fixture.

Resolves each name to an MBID via the WS/2 search endpoint, then reads
`release-count` from a `limit=1` release browse. That count is an UPPER BOUND
on the pageType's own row count: the fixture URL carries `?va=0`, which
excludes various-artist releases, while the browse endpoint counts every
release the artist appears in the credit of. So use this to RANK candidates,
then confirm the chosen one exactly by loading the real page.

Target band is 1500-4000 rows: `artist-events`, the existing perf arm, is 4174
rows and 700 KB gzipped, and a committed fixture should stay in that class
(capture-fixture.js marks multi-MB captures `local: true` for a reason).

MusicBrainz's WS is rate-limited to ~1 req/s; this sleeps accordingly.

usage: python3 scripts/probe-artist-release-counts.py
"""
import json
import time
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-perf-fixture-sizing/1.0 (volker.zell@opitz-consulting.com)'

# Springsteen-connected first, per PAGETYPES-TESTING-REFERENCE.org's
# identifier-selection criteria, then a few unconnected mid-size acts as
# fallbacks in case nothing connected lands in the target band.
CANDIDATES = [
    # Springsteen-connected first, per PAGETYPES-TESTING-REFERENCE.org's
    # identifier-selection criteria. MEASURED 2026-09-10: none of them come
    # close to the 1500-4000 band — Patti Scialfa 6, Clarence Clemons 15, Joe
    # Grushecky 24, Little Steven 50, Southside Johnny 71, Nils Lofgren 163,
    # and Springsteen himself 8125. So the band can only be hit by an
    # unconnected act, and these are the peers checked for it.
    ('Bruce Springsteen', 'reference point, 82 pages'),
    ('Neil Young', 'closest to band from batch 1 (1463)'),
    ('Johnny Cash', 'batch 1 (1360)'),
    ('Bob Dylan', 'peer'),
    ('Van Morrison', 'peer'),
    ('Elvis Costello', 'peer'),
    ('Tom Waits', 'peer'),
    ('John Mellencamp', 'peer'),
    ('Bob Seger', 'peer'),
    ('Willie Nelson', 'peer'),
    ('Eric Clapton', 'peer'),
    ('David Bowie', 'peer'),
    ('Fleetwood Mac', 'peer'),
    ('Creedence Clearwater Revival', 'peer'),
]


def get(url, tries=4):
    """GET with widening backoff.

    MusicBrainz's WS fails in BURSTS rather than uniformly — measured at
    roughly one request in three during the millisecond-Length work, which is
    why `_msFetchWs2RecordingLengths()` retries a 503 three times with a
    widening backoff instead of caching the failure. A single-shot probe here
    reported 8 of 14 candidates as unknown on its first run, all 503, so it
    does the same.
    """
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    last = None
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=30) as fh:
                return json.load(fh)
        except Exception as e:                  # noqa: BLE001 - retry, then report
            last = e
            if attempt < tries - 1:
                time.sleep(2 ** attempt * 1.5)
    raise last


def resolve(name):
    q = urllib.parse.quote(f'artist:"{name}"')
    d = get(f'https://musicbrainz.org/ws/2/artist?query={q}&limit=1&fmt=json')
    arts = d.get('artists') or []
    return (arts[0]['id'], arts[0]['name']) if arts else (None, None)


rows = []
for name, why in CANDIDATES:
    try:
        mbid, real = resolve(name)
        time.sleep(1.1)
        if not mbid:
            rows.append((name, why, None, None, 'not found'))
            continue
        d = get(f'https://musicbrainz.org/ws/2/release?artist={mbid}&limit=1&fmt=json')
        rows.append((real, why, mbid, d.get('release-count'), ''))
    except Exception as e:                      # noqa: BLE001 - report, keep going
        rows.append((name, why, None, None, f'error: {e}'))
    time.sleep(1.1)

rows_ok = [r for r in rows if isinstance(r[3], int)]
rows_ok.sort(key=lambda r: r[3])

print(f'{"artist":42} {"releases":>9}  {"pages@100":>9}  mbid')
print('-' * 110)
for name, why, mbid, n, err in rows_ok:
    band = '  <-- in 1500-4000 band' if 1500 <= n <= 4000 else ''
    print(f'{name[:42]:42} {n:>9}  {-(-n // 100):>9}  {mbid}  ({why}){band}')
for name, why, mbid, n, err in rows:
    if err:
        print(f'{name[:42]:42} {"?":>9}  {"?":>9}  {err}')
