"""Capture the real WS/2 relationship data for a perf fixture's rows, in bulk.

── Why this exists ──────────────────────────────────────────────────────────

PERFORMANCE.org Step 35 shipped the on-demand Relationships column but could
not measure its INTERACTION latency, because `perfDescriptors.js`'s
`applyPicardArm()` forbids an arm re-enabling that column -- "that would put
thousands of live requests inside a measurement bracket" -- and it is right.
The column issues ONE request per distinct MBID with a mandatory 1100 ms gap,
so Bob Dylan's 2301-release page costs ~42 minutes.

The way out is a warm cache: pre-seed the `rel-ws2` IndexedDB store so Phase 1
hits on every MBID and the Phase-2 network queue is empty. This script captures
the data for that seed.

── Why the BROWSE endpoint, and why that is not a shortcut ─────────────────

Fetching 2301 entities one at a time to build a test fixture would mean 42
minutes of hammering MusicBrainz. `/ws/2/release?artist=<mbid>&inc=url-rels
&limit=100` returns the SAME per-release `relations` arrays 100 at a time --
24 requests. Verified by `scripts/probe-rel-browse-endpoint.py`: every release
in the first page carried a `relations` key, and the objects are byte-shaped
exactly as `_populateCells()` reads them (`target-type`, `type`,
`url.resource`, `ended`).

This is the same reasoning `_msCollectRecordingMbids()`'s batch source records
for the search endpoint, in the opposite direction: there the browse endpoint
was rejected because it costs the artist's whole catalogue; here the whole
catalogue is exactly what is wanted.

**The data written is REAL, not synthesized.** A fabricated distribution would
make the arm's numbers meaningless -- the DOM cost being measured is driven by
how many `<a><img>` + `.mb-rel-filter-key` triples land in each cell.

── Coverage is verified, not assumed ───────────────────────────────────────

The seed is only useful if it covers EVERY MBID the fixture renders; one miss
means one live request inside a measurement bracket, which is the exact thing
this avoids. So the script extracts the fixture's own MBIDs, diffs them against
what browse returned, and fetches any stragglers individually (rate-limited).
It refuses to write a seed with gaps unless --allow-gaps is passed.

usage:
  python3 scripts/capture-rel-ws2-seed.py                      # dylan (default)
  python3 scripts/capture-rel-ws2-seed.py --dry-run            # probe + coverage only
"""
import argparse
import collections
import gzip
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

UA = 'ShowAllEntityData-perf-seed/1.0 ( volker.zell@opitz-consulting.com )'

# One entry per instrumented pageType whose rows carry an injected
# Relationships column. `entity_type`/`inc` must match what
# `buildActiveInjectedColumns()` derives for that pageType, or the ckey this
# writes will never be read back.
TARGETS = {
    'artist-releases-dylan': {
        'artist_mbid': '72c536dc-7137-4477-a521-567eeb840fa8',
        'fixture': 'tests/fixtures/saved-data/artist-releases-dylan.json.gz',
        'out': 'tests/fixtures/saved-data/rel-ws2-artist-releases-dylan.json.gz',
        'entity_type': 'release',
        'inc': 'url-rels',
        'browse_key': 'releases',
        'browse_param': 'artist',
    },
}

MBID_RE = r'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'


def get(url, attempts=6):
    """GET with backoff. MusicBrainz 503s in bursts under bot load."""
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    last = None
    for i in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            last = e
            if e.code not in (503, 502, 429):
                raise
            wait = 2 * (i + 1)
            print(f'    HTTP {e.code}; retry {i + 1}/{attempts} in {wait}s', flush=True)
            time.sleep(wait)
        except Exception as e:
            last = e
            wait = 2 * (i + 1)
            print(f'    {type(e).__name__}; retry {i + 1}/{attempts} in {wait}s', flush=True)
            time.sleep(wait)
    raise last


def fixture_mbids(path, entity_type):
    """The distinct MBIDs the fixture's rows actually link, in the same shape
    `_extractMbidFromRow()` looks for."""
    with gzip.open(path, 'rt', encoding='utf-8') as f:
        blob = json.dumps(json.load(f))
    return set(re.findall(rf'/{entity_type}/{MBID_RE}', blob))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--target', default='artist-releases-dylan', choices=sorted(TARGETS))
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--allow-gaps', action='store_true')
    args = ap.parse_args()

    t = TARGETS[args.target]
    want = fixture_mbids(t['fixture'], t['entity_type'])
    print(f'{args.target}: fixture renders {len(want)} distinct '
          f'/{t["entity_type"]}/<mbid>')

    found = {}
    offset, total = 0, None
    while total is None or offset < total:
        url = (f'https://musicbrainz.org/ws/2/{t["entity_type"]}'
               f'?{t["browse_param"]}={t["artist_mbid"]}&inc={t["inc"]}'
               f'&limit=100&offset={offset}&fmt=json')
        data = get(url)
        if total is None:
            total = data.get(f'{t["entity_type"]}-count', 0)
            print(f'  browse reports {total} entities -> '
                  f'{-(-total // 100)} requests')
        batch = data.get(t['browse_key'], [])
        for e in batch:
            # Store exactly what the per-entity endpoint would have cached:
            # the parsed response object, of which _populateCells() reads
            # `relations`. Keeping the full relation objects rather than a
            # trimmed subset is deliberate -- a warm cache holds the real
            # response, and a trimmed one would understate IDB read cost.
            found[e['id']] = {'relations': e.get('relations') or []}
        offset += 100
        print(f'  {min(offset, total)}/{total} ...', flush=True)
        if offset < total:
            time.sleep(1.1)           # the same rate limit the userscript honours

    missing = sorted(want - set(found))
    extra = len(set(found) - want)
    print(f'\ncoverage: {len(want) - len(missing)}/{len(want)} fixture MBIDs '
          f'covered by browse; {len(missing)} missing, {extra} returned but unused')

    if missing and not args.dry_run:
        print(f'fetching {len(missing)} straggler(s) individually at 1 req/1.1s '
              f'(~{len(missing) * 1.1 / 60:.1f} min)')
        for i, mbid in enumerate(missing, 1):
            url = (f'https://musicbrainz.org/ws/2/{t["entity_type"]}/{mbid}'
                   f'?inc={t["inc"]}&fmt=json')
            try:
                d = get(url)
                found[mbid] = {'relations': d.get('relations') or []}
            except Exception as e:
                print(f'  {mbid}: FAILED ({e}) -- left uncovered')
            if i % 25 == 0:
                print(f'  {i}/{len(missing)}', flush=True)
            time.sleep(1.1)
        missing = sorted(want - set(found))

    covered = {m: found[m] for m in want if m in found}
    dist = collections.Counter(
        len([r for r in v['relations'] if r.get('target-type') == 'url'])
        for v in covered.values())
    print('\nurl-rels per entity (what each cell will render):')
    for k in sorted(dist):
        print(f'  {k:>3} -> {dist[k]:>5} entities')
    icons = sum(k * n for k, n in dist.items())
    print(f'total url-rels across the page: {icons} '
          f'({icons / max(len(covered), 1):.2f} per row)')
    print('  NOTE: this is an UPPER BOUND on icons rendered, not the count. '
          '_populateCells()\n'
          '  de-dupes by target URL within an entity, and renders only relation '
          'types it has\n'
          '  an icon class for -- and those maps are user-overridable settings '
          '(sa_rel_url_icon_classes\n'
          '  et al), so the rendered number is the script\'s to decide, not '
          'this script\'s to predict.\n'
          '  Measured once on the Dylan seed: 2329 url-rels -> 131 duplicates, '
          '108 unmapped -> 2090 icons.')

    if args.dry_run:
        print('\nDry run -- nothing written.')
        return 0

    if missing and not args.allow_gaps:
        print(f'\nREFUSING to write: {len(missing)} MBID(s) uncovered. Each one '
              'is a live request inside a measurement bracket, which is the '
              'whole thing this seed exists to prevent. Re-run, or pass '
              '--allow-gaps deliberately.')
        return 1

    payload = {
        'schema': 1,
        'target': args.target,
        'entityType': t['entity_type'],
        'inc': t['inc'],
        'capturedAt': time.strftime('%Y-%m-%d'),
        'source': 'ws2-browse',
        'entityCount': len(covered),
        # url-rels present in the data. NOT the number of icons the page will
        # render -- see the NOTE printed above.
        'urlRelTotal': icons,
        'data': covered,
    }
    os.makedirs(os.path.dirname(t['out']), exist_ok=True)
    with gzip.open(t['out'], 'wt', encoding='utf-8') as f:
        json.dump(payload, f, separators=(',', ':'))
    print(f'\nwrote {t["out"]} ({os.path.getsize(t["out"]):,} bytes, '
          f'{len(covered)} entities)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
