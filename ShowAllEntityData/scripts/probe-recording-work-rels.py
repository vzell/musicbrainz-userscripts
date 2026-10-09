"""Can the "Recording of" column be fed in bulk, and what does a work-rel look like?

Gates the artist-recordings "Recording of" / "Performance attributes" columns
(docs/claude/deferred-columns-picard-relationships.md, "Recording of column").
Questions:

1. BROWSE /ws/2/recording?artist=<mbid>&inc=work-rels&limit=100: accepted?
   100 per page? Total-count key and value (drives the browse-vs-lookup cost
   rule)? Does every record carry a `relations` array?
2. PARITY: for a sample of recordings from browse page 1 (always including the
   ones with the most relations), does the browse `relations` array equal the
   one the LOOKUP /ws/2/recording/<mbid>?inc=work-rels returns? Browse answers
   are cached under the lookup's key, so a thinner browse record would be
   served as complete for the whole TTL.
3. Shape of one work relation: which keys (type, type-id, direction,
   attributes, attribute-ids, attribute-values, begin, end, ended, work{...}),
   and which relation `type`s occur at all (only "performance" is wanted).
4. BROWSE /ws/2/work?artist=<mbid>&inc=aliases&limit=100: total-count key,
   page size (the cached work list behind the suggestions).
5. SEARCH (the millisecond feature's rid: trick) with inc=work-rels: does it
   carry relations? Expected no (CLAUDE.md: search results omit relations).

Every request is spaced >= 1.1 s and 503s are retried with a widening backoff.

usage:
  python3 scripts/probe-recording-work-rels.py
  python3 scripts/probe-recording-work-rels.py --sample 6 --out debug/probe-recording-work-rels.json
"""
import argparse
import datetime
import json
import socket
import time
import urllib.error
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 ( volker.zell@opitz-consulting.com )'
BASE = 'https://musicbrainz.org/ws/2'
ARTIST = '70248960-cb53-4ea4-943a-edb18f7d336f'      # Bruce Springsteen

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


def rel_key(rel):
    """A comparable identity for one work relation, independent of array order."""
    work = rel.get('work') or {}
    return json.dumps([
        rel.get('type'), rel.get('type-id'), rel.get('direction'), work.get('id'),
        bool(rel.get('ended')), rel.get('begin'), rel.get('end'),
        sorted(rel.get('attributes') or []),
    ])


def multiset(rels):
    """Counts of rel_key() over a relations array."""
    out = {}
    for r in rels or []:
        k = rel_key(r)
        out[k] = out.get(k, 0) + 1
    return out


def main():
    """Runs the five questions and prints/saves the findings."""
    ap = argparse.ArgumentParser()
    ap.add_argument('--sample', type=int, default=5)
    ap.add_argument('--out', default='')
    args = ap.parse_args()
    started = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    res = {'started': started, 'host': socket.gethostname(), 'artist': ARTIST}

    print('== 1. recording browse, inc=work-rels ==', flush=True)
    st, data = fetch(f'{BASE}/recording?artist={ARTIST}&inc=work-rels&limit=100&offset=0&fmt=json')
    recs = data.get('recordings', []) if isinstance(data, dict) else []
    res['browse'] = {
        'status': st,
        'count_keys': [k for k in (data or {}) if 'count' in k] if isinstance(data, dict) else [],
        'recording-count': data.get('recording-count') if isinstance(data, dict) else None,
        'page_size': len(recs),
        'records_without_relations_key': sum(1 for r in recs if 'relations' not in r),
        'records_with_a_performance_rel': sum(1 for r in recs if any(x.get('type') == 'performance' for x in r.get('relations') or [])),
    }
    print(json.dumps(res['browse'], indent=2), flush=True)

    types, keys, attrs, attr_values = {}, set(), {}, set()
    for r in recs:
        for rel in r.get('relations') or []:
            types[rel.get('type')] = types.get(rel.get('type'), 0) + 1
            keys.update(rel.keys())
            for a in rel.get('attributes') or []:
                attrs[a] = attrs.get(a, 0) + 1
            for k, v in (rel.get('attribute-values') or {}).items():
                attr_values.add(f'{k}={v}')
    example = next((rel for r in recs for rel in r.get('relations') or [] if rel.get('attributes')), None)
    res['shape'] = {'types': types, 'rel_keys': sorted(keys), 'attributes': attrs,
                    'attribute_values': sorted(attr_values), 'example': example}
    print('== 3. relation shape ==', flush=True)
    print(json.dumps(res['shape'], indent=2, ensure_ascii=False), flush=True)

    print('== 2. parity browse vs lookup ==', flush=True)
    by_rels = sorted(recs, key=lambda r: -len(r.get('relations') or []))
    sample = by_rels[:max(1, args.sample // 2)] + recs[:args.sample - max(1, args.sample // 2)]
    seen, parity = set(), []
    for r in sample:
        if r['id'] in seen:
            continue
        seen.add(r['id'])
        st2, look = fetch(f'{BASE}/recording/{r["id"]}?inc=work-rels&fmt=json')
        same = isinstance(look, dict) and multiset(look.get('relations')) == multiset(r.get('relations'))
        parity.append({'id': r['id'], 'title': r.get('title'), 'browse_rels': len(r.get('relations') or []),
                       'lookup_rels': len(look.get('relations') or []) if isinstance(look, dict) else None,
                       'status': st2, 'equal': same})
        print(f'  {r["id"]} {r.get("title")!r}: browse {parity[-1]["browse_rels"]} lookup {parity[-1]["lookup_rels"]} equal={same}', flush=True)
    res['parity'] = parity

    print('== 4. work browse ==', flush=True)
    st, wdata = fetch(f'{BASE}/work?artist={ARTIST}&inc=aliases&limit=100&offset=0&fmt=json')
    works = wdata.get('works', []) if isinstance(wdata, dict) else []
    res['works'] = {'status': st, 'work-count': wdata.get('work-count') if isinstance(wdata, dict) else None,
                    'page_size': len(works), 'example': works[0] if works else None}
    print(json.dumps({k: v for k, v in res['works'].items() if k != 'example'}, indent=2), flush=True)

    print('== 5. search rid: with inc=work-rels ==', flush=True)
    ids = [r['id'] for r in recs[:5]]
    q = urllib.parse.quote(f'rid:({" OR ".join(ids)})')
    st, sdata = fetch(f'{BASE}/recording?query={q}&inc=work-rels&limit=5&fmt=json')
    srecs = sdata.get('recordings', []) if isinstance(sdata, dict) else []
    res['search'] = {'status': st, 'returned': len(srecs), 'with_relations': sum(1 for r in srecs if r.get('relations'))}
    print(json.dumps(res['search'], indent=2), flush=True)

    res['finished'] = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    res['requests'] = _count[0]
    print(f'== done: {_count[0]} requests, {started} → {res["finished"]} on {res["host"]} ==')
    if args.out:
        with open(args.out, 'w', encoding='utf-8') as f:
            json.dump(res, f, indent=2, ensure_ascii=False)


if __name__ == '__main__':
    main()
