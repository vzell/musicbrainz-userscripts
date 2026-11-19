#!/usr/bin/env python3
"""Find real MusicBrainz examples for the Apollo findings, batch 3: format roles.

org/majkinetor.org, "Batch 3", the one item vzell picked (2026-11-19): a release
relationship whose ROLE does not fit the release's FORMAT. The rules come from
Group Therapy (majkinetor, group_therapy.user.js, FORMAT_EXCLUDE_DEFAULT /
FORMAT_ONLY_DEFAULT):

- "pressed" / "printed" / "manufactured" on a release whose media are all digital;
- "lacquer cut" on a release with no vinyl medium;
- "glass mastered" on a release with no CD / DVD / SACD / Blu-ray medium.

Source (/ws/2, not behind musicbrainz.org's HTML browser check). The search
server answered 503 on every request on 2026-11-19 evening while lookups
worked, so the probe crawls instead of searching:

1. the seed labels and places (taken from the local fixtures and debug
   snapshots: a "manufactured by" / "pressed at" target each) are looked up
   with inc=release-rels (https://musicbrainz.org/doc/MusicBrainz_API:
   relationship includes on a lookup, no documented limit or paging);
2. a bounded random sample of their related releases is looked up with
   inc=media+label-rels+place-rels+artist-rels+area-rels: one request gives the
   format of every medium AND every release-level role;
3. every label or place met there with a role the rules read is queued in its
   turn (lacquer and glass first: the rarer roles), until --budget requests.

The output tallies type x format family and lists every rule break, with the
target's kind and the formats as MusicBrainz names them, so the family edge
cases (Shellac, CD-R, Download Card, ...) are decided on data.

Paced at one request per 1.1 s, a 503 retried six times (5 s, 10 s, … 30 s apart)
(https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting).

Usage:
    python3 scripts/probe-apollo-findings-3.py [--budget N] [--per-entity N]
        [--out debug/probe-apollo-findings-3.json]
"""
import argparse
import json
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 (+https://github.com/vzell/mb-userscripts)'
WS = 'https://musicbrainz.org/ws/2/'
_last = [0.0]
_count = [0]

# From tests/fixtures/*.html and debug/*.html (a role row each), 2026-11-19.
SEEDS = [
    ('label', 'd903b263-a45d-4d3d-9fc8-89bdbb143b1e', 'DADC Austria'),
    ('label', '92c8f8c5-52ce-43ea-86a7-33b3389c3b9a', 'OOO Infosystem'),
    ('label', '1aa983f4-f268-4cb8-88dc-5d6d7b31f1a1', 'CBS Records Australia Limited'),
    ('place', 'f79fb0c6-5a89-4b4e-bede-b49635fd7f43', 'Columbia Records Pressing Plant, Pitman'),
]

# The relationship types the three rules read (MusicBrainz's type names).
ROLE_RE = re.compile(r'press|print|manufactur|lacquer|glass', re.I)
RARE_RE = re.compile(r'lacquer|glass', re.I)


def get(path, params):
    """One paced /ws/2 GET, JSON; None on a 404, retries a 503 six times."""
    q = dict(params, fmt='json')
    url = WS + path + '?' + urllib.parse.urlencode(q)
    for attempt in range(7):
        wait = 1.1 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        _count[0] += 1
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code in (503, 429) and attempt < 6:
                time.sleep(5 * (attempt + 1))
                continue
            print(f'[error] {e.code} {url}', flush=True)
            return None
        except (urllib.error.URLError, TimeoutError):
            if attempt < 6:
                time.sleep(3)
                continue
            print(f'[error] network {url}', flush=True)
            return None
    return None


def family(fmt):
    """Rough family of a MusicBrainz medium format name, for the tally only."""
    f = (fmt or '').lower()
    if not f:
        return 'none'
    if f == 'digital media':
        return 'digital'
    if 'vinyl' in f:
        return 'vinyl'
    if re.search(r'shellac|flexi|lathe', f):
        return 'disc-other:' + f
    if re.search(r'\bcd\b|cd-r|sacd|dvd|blu-ray|hd-dvd|hdcd|shm|blu-spec|dualdisc|minidisc|umd|vcd|laserdisc|disc', f):
        return 'optical:' + f
    return 'other:' + f


def rule_breaks(type_name, formats):
    """Which of GT's three rules the (type, formats) pair breaks, as SAED would read them."""
    t = type_name.lower()
    fams = [family(x) for x in formats]
    if not formats or any(x == 'none' for x in fams):
        return []
    out = []
    if re.search(r'press|print|manufactur', t) and all(x == 'digital' for x in fams):
        out.append('physical-on-digital')
    if 'lacquer' in t and not any(x == 'vinyl' for x in fams):
        out.append('lacquer-no-vinyl')
    if 'glass' in t and not any(x.startswith('optical:') for x in fams):
        out.append('glass-no-optical')
    return out


def main():
    """Run the probe and write its JSON."""
    ap = argparse.ArgumentParser()
    ap.add_argument('--budget', type=int, default=800, help='requests in all')
    ap.add_argument('--per-entity', type=int, default=25, help='releases sampled per label/place')
    ap.add_argument('--out', default='debug/probe-apollo-findings-3.json')
    ap.add_argument('--seed', type=int, default=3)
    a = ap.parse_args()
    random.seed(a.seed)

    queue = [(k, i, n, 'seed') for k, i, n in SEEDS]
    queued = {i for _, i, _, _ in queue}
    done_rel = set()
    entities, samples = [], []
    start = time.strftime('%Y-%m-%dT%H:%M:%S%z')
    while queue and _count[0] < a.budget:
        # The rarer roles first.
        queue.sort(key=lambda e: 0 if RARE_RE.search(e[3]) else 1)
        kind, mbid, name, via = queue.pop(0)
        look = get(f'{kind}/{mbid}', {'inc': 'release-rels'})
        rels = [r for r in (look or {}).get('relations', []) if r.get('target-type') == 'release' and ROLE_RE.search(r.get('type', ''))]
        types = {}
        for r in rels:
            types[r['type']] = types.get(r['type'], 0) + 1
        print(f'[entity] {kind} {name} ({via}): {len(rels)} role rels {types}; requests {_count[0]}', flush=True)
        entities.append({'kind': kind, 'mbid': mbid, 'name': name, 'via': via, 'types': types})
        # Sample across types, the rare ones fully first.
        rare = [r for r in rels if RARE_RE.search(r['type'])]
        common = [r for r in rels if not RARE_RE.search(r['type'])]
        pick = random.sample(rare, min(a.per_entity, len(rare)))
        pick += random.sample(common, min(max(0, a.per_entity - len(pick)), len(common)))
        for r in pick:
            if _count[0] >= a.budget:
                break
            rid = r['release']['id']
            if rid in done_rel:
                continue
            done_rel.add(rid)
            rel = get(f'release/{rid}', {'inc': 'media+label-rels+place-rels+artist-rels+area-rels'})
            if not rel:
                continue
            formats = [m.get('format') or '' for m in rel.get('media', [])]
            roles = []
            for x in rel.get('relations', []):
                t = x.get('type', '')
                if not ROLE_RE.search(t):
                    continue
                tk = x.get('target-type')
                tgt = x.get(tk) or {}
                roles.append({'type': t, 'target_type': tk, 'target': tgt.get('name'), 'target_id': tgt.get('id'),
                              'breaks': rule_breaks(t, formats)})
                if tk in ('label', 'place') and tgt.get('id') and tgt['id'] not in queued:
                    queued.add(tgt['id'])
                    queue.append((tk, tgt['id'], tgt.get('name'), t))
            s = {'release': rid, 'title': rel.get('title'), 'formats': formats, 'roles': roles}
            samples.append(s)
            for ro in roles:
                if ro['breaks']:
                    print(f'  BREAK {ro["breaks"]} {ro["type"]} ({ro["target_type"]}: {ro["target"]}) '
                          f'[{" + ".join(formats)}] https://musicbrainz.org/release/{rid} {rel.get("title")!r}', flush=True)

    tally, fmt_names = {}, {}
    for s in samples:
        for ro in s['roles']:
            k = f'{ro["type"]} ({ro["target_type"]})'
            tally.setdefault(k, {})
            for f in (s['formats'] or ['']):
                fam = family(f)
                tally[k][fam] = tally[k].get(fam, 0) + 1
        for f in s['formats']:
            fmt_names[f] = fmt_names.get(f, 0) + 1
    breaks = [dict(s, roles=[r for r in s['roles'] if r['breaks']]) for s in samples if any(r['breaks'] for r in s['roles'])]
    out = {
        'started': start,
        'finished': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
        'requests': _count[0],
        'releases': len(samples),
        'entities': entities,
        'tally_role_by_format_family': tally,
        'format_names': fmt_names,
        'breaks': breaks,
        'samples': samples,
    }
    with open(a.out, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print(f'[done] {_count[0]} requests, {len(samples)} releases, {len(breaks)} with a rule break -> {a.out}', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
