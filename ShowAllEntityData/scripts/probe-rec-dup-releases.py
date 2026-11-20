#!/usr/bin/env python3
"""Find real releases that hold two recordings of one duplicate group, for the rec-dup browser check.

Input: a group list written by `node scripts/check-fusion-port.js --dump … --groups-out FILE` (each group: its
member recording MBIDs and titles, at the strict cutoff). For every member, one release browse
(/ws/2/release?recording=<MBID>&limit=100&fmt=json; browse by recording per
https://musicbrainz.org/doc/MusicBrainz_API, checked 2026-11-20), spaced >= 1.5 s, retried on 429/502/503.
A release that appears for two members of one group carries both on its tracklist: a real page where the
finding should mark two tracks.

Output (gitignored): debug/probe-rec-dup/releases-<artist>.json, and one line per hit on stdout with the
release URL.

usage: python3 scripts/probe-rec-dup-releases.py debug/probe-rec-dup/groups-<artist>.json [max groups]
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 (+https://github.com/vzell/mb-userscripts)'
BASE = 'https://musicbrainz.org/ws/2'
_last = [0.0]


def fetch(url, tries=10):
    """GET JSON, spaced >= 1.5 s, retried on 429/502/503 with backoff; None on failure."""
    for attempt in range(tries):
        wait = 1.5 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code not in (429, 502, 503):
                return None
        except Exception:                                        # noqa: BLE001
            pass
        time.sleep(min(60, 3 * 2 ** attempt))
    return None


def main():
    """Browse each member's releases and report releases shared within a group."""
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    src = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 40
    data = json.load(open(src, encoding='utf-8'))
    hits = []
    for g in data['groups'][:limit]:
        seen = {}
        for m in g['members']:
            j = fetch(f"{BASE}/release?recording={m['gid']}&limit=100&fmt=json") or {}
            for r in j.get('releases') or []:
                seen.setdefault(r['id'], {'title': r.get('title'), 'members': []})['members'].append(m['gid'])
        for rid, v in seen.items():
            if len(v['members']) >= 2:
                hit = {'release': rid, 'title': v['title'], 'members': v['members'], 'group': g['title'], 'isrc': g.get('isrc')}
                hits.append(hit)
                print(f"https://musicbrainz.org/release/{rid}  {v['title']!r}: {g['title']!r} x{len(v['members'])} (ISRC {g.get('isrc')})", flush=True)
    out = os.path.join(os.path.dirname(src), 'releases-' + os.path.basename(src).replace('groups-', ''))
    json.dump({'source': src, 'hits': hits}, open(out, 'w', encoding='utf-8'), indent=2)
    print(f'{len(hits)} release(s) -> {out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
