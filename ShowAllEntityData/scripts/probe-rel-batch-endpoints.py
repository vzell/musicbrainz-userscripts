"""Which WS/2 endpoints can feed the Relationships column in bulk?

PERFORMANCE.org Step 36 gates every batched source on this probe. Two questions:

1. Does the SEARCH endpoint (the millisecond-Length feature's `rid:` trick,
   here `reid:`) carry `relations` when asked with `inc=url-rels`? Expected no.
2. For each candidate BROWSE mapping, requested with EXACTLY the `inc` set
   `_relIncOptionsForEntityType()` uses for that entity type:
     - is the request accepted, and does `limit=100` return 100 per page?
     - what is the total-count key (drives the userscript's cost rule)?
     - PARITY: for a sample of entities from browse page 1, does the browse
       `relations` array equal the one the per-entity LOOKUP returns?
       The sample always includes the entities with the most relations on the
       page, because truncation would show up there first.

Browse answers are cached under the lookup's own ckey, so a mapping that fails
parity must NOT be declared -- a thinner record would be served as complete for
the whole TTL.

Every request is spaced >= 1.1 s (MusicBrainz allows 1 req/s) and 503s are
retried with a widening backoff, like the userscript's own batch source.

usage:
  python3 scripts/probe-rel-batch-endpoints.py
  python3 scripts/probe-rel-batch-endpoints.py --sample 8 --out debug/probe-rel-batch.json
"""
import argparse
import datetime
import json
import os
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 ( volker.zell@opitz-consulting.com )'
BASE = 'https://musicbrainz.org/ws/2'

ARTIST = '70248960-cb53-4ea4-943a-edb18f7d336f'      # Bruce Springsteen
LABEL = '011d1192-6f65-45bd-85c4-0400dd45693e'       # Columbia
RG_BTR = '39b22944-7503-3937-8bba-09b17281cc6a'      # Born to Run (release group)
REC_BTR = '875a6a0d-1fcc-416e-959f-433f96b0da17'     # Born to Run (recording)
AREA_NJ = 'a36544c1-cb40-4f44-9e0e-7a5a69e403a8'     # New Jersey
EDITOR = 'vzell'                                     # for public-collection discovery

# Mirrors _relIncOptionsForEntityType() in ShowAllEntityData.user.js.
INC = {
    'release': ['url-rels'],
    'release-group': ['url-rels', 'release-group-rels'],
    'work': ['url-rels', 'artist-rels'],
    'label': ['url-rels', 'label-rels'],
}

# (pageType, browsed entity type, browse param, param value)
MAPPINGS = [
    ('artist-releases', 'release', 'artist', ARTIST),
    ('artist-releasegroups', 'release-group', 'artist', ARTIST),
    ('artist-works', 'work', 'artist', ARTIST),
    ('label-releases', 'release', 'label', LABEL),
    ('releasegroup-releases', 'release', 'release-group', RG_BTR),
    ('recording-releases', 'release', 'recording', REC_BTR),
    ('area-releases', 'release', 'area', AREA_NJ),
    ('area-labels', 'label', 'area', AREA_NJ),
]

_last = [0.0]
_count = [0]


def _once(url):
    """One GET, spaced at least 1.1 s after the previous one."""
    wait = 1.1 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    _last[0] = time.time()
    _count[0] += 1
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, json.loads(resp.read().decode('utf-8', 'replace'))
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')[:300]
    except Exception as e:                                   # noqa: BLE001
        return 0, str(e)


def fetch(url, tries=6):
    """GET with retries on 503/502/429/transport failure."""
    st, body = 0, ''
    for attempt in range(tries):
        st, body = _once(url)
        if st not in (0, 429, 502, 503):
            return st, body
        print(f'    HTTP {st}, retry {attempt + 1}/{tries}', flush=True)
        time.sleep(2 * (attempt + 1))
    return st, body


def plural_key(entity_type):
    """WS/2 browse list key: 'release' -> 'releases', 'release-group' -> 'release-groups'."""
    return entity_type + 's'


def rel_key(rel):
    """A comparable identity for one relation, independent of array order."""
    target_type = rel.get('target-type') or ''
    target = rel.get(target_type.replace('_', '-')) or rel.get(target_type) or {}
    target_id = target.get('id') or target.get('resource') or ''
    return json.dumps([
        rel.get('type'), rel.get('type-id'), target_type, rel.get('direction'),
        target_id, bool(rel.get('ended')), rel.get('begin'), rel.get('end'),
        sorted(rel.get('attributes') or []),
    ])


def rel_multiset(rels):
    """Counts of rel_key() over a relations array."""
    out = {}
    for r in rels or []:
        k = rel_key(r)
        out[k] = out.get(k, 0) + 1
    return out


def probe_search():
    """Question 1: does reid: search carry relations with inc=url-rels?"""
    print('\n== SEARCH endpoint (reid: batch, inc=url-rels) ==', flush=True)
    st, data = fetch(f'{BASE}/release?release-group={RG_BTR}&limit=5&fmt=json')
    if st != 200:
        return {'ok': False, 'detail': f'could not collect release ids: HTTP {st}'}
    ids = [r['id'] for r in data.get('releases', [])]
    q = urllib.parse.quote('reid:(' + ' OR '.join(ids) + ')')
    st, data = fetch(f'{BASE}/release?query={q}&inc=url-rels&limit=25&fmt=json')
    if st != 200:
        print(f'  HTTP {st}: {str(data)[:160]}')
        return {'ok': False, 'status': st, 'detail': str(data)[:300]}
    rels = data.get('releases', [])
    with_rel = sum(1 for r in rels if 'relations' in r)
    print(f'  HTTP 200, {len(rels)} releases returned, {with_rel} carry a "relations" key')
    return {'ok': True, 'status': st, 'returned': len(rels), 'withRelations': with_rel,
            'usable': with_rel == len(rels) and len(rels) > 0}


def discover_collections():
    """Adds collections-releases mappings from the editor's public collections."""
    st, data = fetch(f'{BASE}/collection?editor={EDITOR}&limit=100&fmt=json')
    found = []
    if st != 200:
        print(f'  collection discovery failed: HTTP {st}')
        return found
    by_type = {}
    for c in data.get('collections', []):
        et = c.get('entity-type')
        count = c.get(f'{et}-count', 0)
        if et in ('release', 'release_group', 'release-group') and count >= 5:
            et = 'release-group' if et != 'release' else 'release'
            if et not in by_type or count < by_type[et][1]:
                by_type[et] = (c['id'], count)
    for et, (cid, count) in by_type.items():
        print(f'  using public {et} collection {cid} ({count} entities)')
        found.append((f'collections-releases [{et}]', et, 'collection', cid))
    return found


def probe_mapping(page_type, entity_type, param, value, sample):
    """Question 2 for one browse mapping."""
    inc = '+'.join(INC[entity_type])
    print(f'\n== {page_type}: {entity_type}?{param}=… inc={inc} ==', flush=True)
    url = f'{BASE}/{entity_type}?{param}={value}&inc={inc}&limit=100&offset=0&fmt=json'
    st, data = fetch(url)
    result = {'pageType': page_type, 'entityType': entity_type, 'param': param,
              'value': value, 'inc': inc, 'status': st}
    if st != 200:
        print(f'  REJECTED: HTTP {st}: {str(data)[:200]}')
        result['detail'] = str(data)[:300]
        result['verdict'] = 'rejected'
        return result

    items = data.get(plural_key(entity_type), [])
    count_key = f'{entity_type}-count'
    total = data.get(count_key)
    with_key = sum(1 for e in items if 'relations' in e)
    result.update({'countKey': count_key, 'total': total, 'pageSize': len(items),
                   'withRelationsKey': with_key})
    print(f'  HTTP 200, {count_key}={total}, page 1 returned {len(items)}, '
          f'{with_key} carry "relations"')
    if not items:
        result['verdict'] = 'empty'
        return result

    ranked = sorted(items, key=lambda e: len(e.get('relations') or []), reverse=True)
    heaviest = ranked[:max(1, sample // 2)]
    step = max(1, len(items) // max(1, sample - len(heaviest)))
    spread = [items[i] for i in range(0, len(items), step)]
    chosen, seen = [], set()
    for e in heaviest + spread:
        if e['id'] not in seen:
            seen.add(e['id'])
            chosen.append(e)
        if len(chosen) >= sample:
            break

    mismatches = []
    for e in chosen:
        st2, full = fetch(f'{BASE}/{entity_type}/{e["id"]}?inc={inc}&fmt=json')
        if st2 != 200:
            mismatches.append({'id': e['id'], 'lookupStatus': st2})
            print(f'  {e["id"]}: lookup HTTP {st2}')
            continue
        b = rel_multiset(e.get('relations'))
        l = rel_multiset(full.get('relations'))
        nb, nl = sum(b.values()), sum(l.values())
        same = b == l
        mark = 'equal' if same else 'DIFFERENT'
        print(f'  {e["id"]}: browse {nb} rels, lookup {nl} rels — {mark}')
        if not same:
            only_b = [k for k in b if b[k] != l.get(k, 0)]
            only_l = [k for k in l if l[k] != b.get(k, 0)]
            mismatches.append({'id': e['id'], 'browse': nb, 'lookup': nl,
                               'browseOnly': only_b[:5], 'lookupOnly': only_l[:5]})
    result.update({'sampled': len(chosen),
                   'maxRelationsOnPage': len(ranked[0].get('relations') or []),
                   'mismatches': mismatches})
    result['verdict'] = 'pass' if not mismatches and with_key == len(items) else 'fail'
    print(f'  verdict: {result["verdict"]}')
    return result


def main():
    """Runs every probe and prints a summary; optionally writes JSON."""
    ap = argparse.ArgumentParser()
    ap.add_argument('--sample', type=int, default=8, help='lookups per mapping (default 8)')
    ap.add_argument('--out', help='optional JSON output path')
    args = ap.parse_args()

    started = datetime.datetime.now(datetime.timezone.utc)
    print(f'host {socket.gethostname()}, started {started.isoformat(timespec="seconds")}')

    report = {'machine': {'hostname': socket.gethostname()},
              'startedAt': started.isoformat(timespec='seconds')}
    report['search'] = probe_search()

    print('\n== collection discovery ==', flush=True)
    mappings = MAPPINGS + discover_collections()
    report['browse'] = [probe_mapping(*m, args.sample) for m in mappings]

    finished = datetime.datetime.now(datetime.timezone.utc)
    report['finishedAt'] = finished.isoformat(timespec='seconds')
    report['requests'] = _count[0]

    print('\n== SUMMARY ==')
    s = report['search']
    print(f'search reid: usable = {s.get("usable")} ({s.get("withRelations")}/{s.get("returned")} with relations)')
    for r in report['browse']:
        print(f'{r["verdict"]:>8}  {r["pageType"]:<36} {r["entityType"]}?{r["param"]}= '
              f'inc={r["inc"]}  total={r.get("total")} page={r.get("pageSize")} '
              f'sampled={r.get("sampled")} mismatches={len(r.get("mismatches") or [])}')
    print(f'{_count[0]} requests, {started.isoformat(timespec="seconds")} -> '
          f'{finished.isoformat(timespec="seconds")}')

    if args.out:
        os.makedirs(os.path.dirname(args.out) or '.', exist_ok=True)
        with open(args.out, 'w', encoding='utf-8') as fh:
            json.dump(report, fh, indent=2)
        print(f'wrote {args.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
