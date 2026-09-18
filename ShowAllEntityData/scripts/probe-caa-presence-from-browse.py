"""Can the WS/2 release JSON tell us which releases have NO cover art, so the
CAA fetch can skip them?

Hypothesis (PERFORMANCE candidate, unverified): every release in a WS/2 JSON
response carries a `cover-art-archive` block -- {artwork, count, front, back,
darkened} -- so a browse response the Relationships column already pays for
could stand in for one coverartarchive.org request per release with `count: 0`.
archive.org throughput (~1.2 req/s) is the documented artwork bottleneck.

The direction that matters is FALSE NEGATIVES: a release MusicBrainz says has
`count: 0` that the archive nevertheless serves images for would lose artwork if
skipped. A release with `count > 0` but no archive index only wastes one
request, as today. So the verdict is decided by section 3's "count 0 but
archive has images" line, not by the overall match rate.

Sections printed:
  1. browse response: HTTP status, total, page size, how many releases carry the
     `cover-art-archive` block, and the count distribution
  2. whether release-group browse carries it too (expected: no)
  3. sampled cross-check against coverartarchive.org/release/<mbid>
     (404 = archive has no index): agreement matrix + every disagreement

Only ONE browse page (100 releases, at --offset) is fetched, and the archive is hit at
most --sample * 2 times at one request per second, so this is polite to both.

usage: python3 scripts/probe-caa-presence-from-browse.py [artist-mbid] [--sample N] [--offset N]
       default artist: Bob Dylan; default sample: 15 per bucket
"""
import argparse
import collections
import json
import time
import urllib.error
import urllib.request

DYLAN = '72c536dc-7137-4477-a521-567eeb840fa8'
UA = 'ShowAllEntityData-caa-presence-probe/1.0 ( volker.zell@opitz-consulting.com )'
MB = 'https://musicbrainz.org/ws/2'
CAA = 'https://coverartarchive.org/release'


def get(url, attempts=6, missing_ok=False):
    """GET JSON with the same burst-retry idea the userscript's _ws2GetJson() uses.

    Returns (status, parsed-json-or-None). With missing_ok a 404 returns
    (404, None) instead of raising -- the archive answers 404 for "no index".
    """
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    last = None
    for i in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.status, json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code == 404 and missing_ok:
                return 404, None
            last = e
            if e.code not in (500, 502, 503, 429):
                raise
        except Exception as e:  # transient transport failure
            last = e
        wait = 2 * (i + 1)
        print(f'  {type(last).__name__}, retry {i + 1}/{attempts} in {wait}s')
        time.sleep(wait)
    raise last


def evenly(items, n):
    """Up to n items spread across the list, so a sample is not just the first page head."""
    if len(items) <= n:
        return list(items)
    step = len(items) / n
    return [items[int(i * step)] for i in range(n)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('artist', nargs='?', default=DYLAN)
    ap.add_argument('--sample', type=int, default=15)
    ap.add_argument('--offset', type=int, default=0, help='browse offset, to reach a page with zero-count releases')
    args = ap.parse_args()

    print('== 1. release browse ==')
    status, data = get(f'{MB}/release?artist={args.artist}&limit=100&offset={args.offset}&fmt=json')
    releases = data.get('releases', [])
    print(f'HTTP {status}; release-count (whole catalogue): {data.get("release-count")}; '
          f'page size: {len(releases)}')

    with_block = [r for r in releases if isinstance(r.get('cover-art-archive'), dict)]
    print(f'releases carrying "cover-art-archive": {len(with_block)} / {len(releases)}')
    if not with_block:
        print('NO release carries the block -- the hypothesis is dead for browse without inc=; '
              'stopping. (Try a single lookup before giving up: it may need an inc.)')
        return

    dist = collections.Counter()
    for r in with_block:
        dist['count 0' if r['cover-art-archive'].get('count', 0) == 0 else 'count > 0'] += 1
    for k, v in sorted(dist.items()):
        print(f'  {k:<10}: {v}')
    print('example block:', json.dumps(with_block[0]['cover-art-archive']))

    print('\n== 2. release-group browse ==')
    time.sleep(1.1)
    _, rg = get(f'{MB}/release-group?artist={args.artist}&limit=5&fmt=json')
    groups = rg.get('release-groups', [])
    print(f'"cover-art-archive" on release-groups: '
          f'{sum(1 for g in groups if "cover-art-archive" in g)} / {len(groups)}')

    print('\n== 3. cross-check against coverartarchive.org ==')
    zero = [r for r in with_block if r['cover-art-archive'].get('count', 0) == 0]
    some = [r for r in with_block if r['cover-art-archive'].get('count', 0) > 0]
    sample = [('count 0', r) for r in evenly(zero, args.sample)] + \
             [('count > 0', r) for r in evenly(some, args.sample)]
    print(f'{len(zero)} zero-count and {len(some)} non-zero releases on this page; '
          f'checking {len(sample)} at 1 req/s (~{len(sample)} s)')

    matrix = collections.Counter()
    disagreements = []
    for bucket, r in sample:
        time.sleep(1.0)
        try:
            st, idx = get(f'{CAA}/{r["id"]}', missing_ok=True)
        except Exception as e:  # persistent archive failure: unknown, not evidence either way
            matrix[(bucket, 'ERROR')] += 1
            print(f'  archive error for {r["id"]}: {e}')
            continue
        images = (idx or {}).get('images', [])
        archive = 'index' if st == 200 and images else ('empty index' if st == 200 else '404')
        matrix[(bucket, archive)] += 1
        block_count = r['cover-art-archive'].get('count', 0)
        if bucket == 'count 0' and archive != '404':
            disagreements.append(f'FALSE NEGATIVE  {r["id"]}  block count 0 but archive {archive} '
                                 f'({len(images)} images)')
        elif bucket == 'count > 0' and len(images) != block_count:
            disagreements.append(f'count mismatch   {r["id"]}  block count {block_count}, '
                                 f'archive {len(images)} images ({archive})')

    print('\nmatrix (MusicBrainz block -> archive answer):')
    for (bucket, archive), n in sorted(matrix.items()):
        print(f'  {bucket:<10} -> {archive:<12} {n}')

    print(f'\ndisagreements: {len(disagreements)}')
    for d in disagreements:
        print(' ', d)

    false_neg = sum(1 for d in disagreements if d.startswith('FALSE NEGATIVE'))
    checked_zero = sum(n for (bucket, archive), n in matrix.items()
                       if bucket == 'count 0' and archive != 'ERROR')
    if checked_zero == 0:
        verdict = 'INCONCLUSIVE -- no count-0 release was checked; try another --offset or artist'
    elif false_neg:
        verdict = f'NOT safe -- {false_neg} count-0 release(s) have archive images'
    else:
        verdict = f'no false negatives in {checked_zero} count-0 release(s) checked'
    print('\nVERDICT:', verdict)
    print('(A sample is evidence, not proof: rerun with another artist and a larger --sample.)')


main()
