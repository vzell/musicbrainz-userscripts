"""Probe the shapes of Discogs masters, for the `dg-master` "Tracks" view
(a sub-table per side or disc, credits as role columns, the release's head;
org/discogs.org, "the discogs master release PT", vzell 2026-11-04).

What it records, per master (anonymous, as a user without a token):
- the master's own fields: which of the release fields it has (formats,
  labels, identifiers, extraartists, community) and which it lacks;
- the tracklist: tracks, headings, index tracks, sub-tracks, the position
  patterns ("A1", "1-1", "CD1-1", "1" …), tracks with their own artists;
- the tracks' own credits (count and roles);
- images and videos;
- page 1 of its versions: `pagination.items`, the count the head shows.

The masters: Bruce Springsteen's masters as Main artist (his albums, box
sets, live sets, compilations), sampled across his list sorted by year, plus
a few masters on which he appears (other artists' compilations). Two requests
per master at Discogs' anonymous rate (25 a minute). Each answer is kept in
OUT_DIR (master-<id>.json, master-<id>-versions-p1.json) for fixtures and for
`node scripts/check-dg-release-media.js OUT_DIR`, which runs the shipped
splitter on them.

usage: python3 scripts/probe-dg-master-shapes.py OUT_DIR [max_masters]
"""
import collections
import json
import os
import re
import sys
import time
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 (+https://github.com/vzell/mb-userscripts)'
API = 'https://api.discogs.com'


def get(url):
    """GET one API URL at Discogs' anonymous rate; returns the parsed JSON."""
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read()
    time.sleep(2.6)
    return json.loads(body)


def shape(pos):
    """A position's pattern: digits as 9, letters as A (case kept as a/A)."""
    return re.sub(r'[a-z]', 'a', re.sub(r'[A-Z]', 'A', re.sub(r'\d+', '9', pos)))


# Shapes the year spread may miss, by title: four sides, a box, a live set.
WANT_TITLES = re.compile(r'^(The River|Tracks|Live/1975-85|The Promise|The Essential Bruce Springsteen|Greatest Hits)$', re.I)


def pick_ids(limit):
    """Master ids: every master of his list as Main artist (the whole list is read: sorted by year, his
    own masters sit on the first pages and the later ones are releases and appearances), the named
    shapes first (WANT_TITLES), then an even spread over the years, then three masters he appears on."""
    own, apps = [], []
    for page in range(1, 80):
        try:
            d = get(f'{API}/artists/219986/releases?per_page=100&page={page}&sort=year&sort_order=asc')
        except Exception as e:  # noqa: BLE001 - a page past the end: stop
            print('list page', page, 'stop:', e)
            break
        for r in d.get('releases', []):
            if r.get('type') == 'master':
                (own if r.get('role') == 'Main' else apps).append(r)
        if page >= int(d.get('pagination', {}).get('pages') or 0):
            break
    named = [r['id'] for r in own if WANT_TITLES.match(str(r.get('title') or ''))]
    rest = [r['id'] for r in own if r['id'] not in named]
    n = max(0, limit - len(named) - 3)
    spread = rest[::max(1, len(rest) // n)][:n] if n else []
    print(f'his masters: {len(own)}, named {len(named)}, appearances {len(apps)}')
    seen = []
    for i in named + spread + [r['id'] for r in apps[::max(1, len(apps) // 3)][:3]]:
        if i not in seen:
            seen.append(i)
    return seen[:limit]


def main():
    """Fetch the masters and their first versions page, print one line per master and the totals."""
    out = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 16
    os.makedirs(out, exist_ok=True)
    shapes = collections.Counter()
    track_roles = collections.Counter()
    fields = collections.Counter()
    for mid in pick_ids(limit):
        try:
            d = get(f'{API}/masters/{mid}')
            v = get(f'{API}/masters/{mid}/versions?per_page=100&page=1')
        except Exception as e:  # noqa: BLE001 - report and go on
            print(mid, 'ERROR', e)
            continue
        json.dump(d, open(os.path.join(out, f'master-{mid}.json'), 'w', encoding='utf-8'))
        json.dump(v, open(os.path.join(out, f'master-{mid}-versions-p1.json'), 'w', encoding='utf-8'))
        fields.update(k for k in d)
        tl = d.get('tracklist', [])
        kinds = collections.Counter(t.get('type_') for t in tl)
        subs = [s for t in tl for s in (t.get('sub_tracks') or [])]
        pos = [t.get('position', '') for t in tl if t.get('type_') == 'track'] + [s.get('position', '') for s in subs]
        sh = collections.Counter(shape(p) for p in pos)
        shapes.update(sh)
        heads = [t.get('title') for t in tl if t.get('type_') == 'heading']
        tart = sum(1 for t in tl if t.get('artists'))
        credits = 0
        for t in tl + subs:
            for a in t.get('extraartists') or []:
                credits += 1
                track_roles[a.get('role', '')] += 1
        missing = [k for k in ('formats', 'labels', 'identifiers', 'extraartists', 'community', 'released', 'country') if k not in d]
        print(f"{mid} | {d.get('title', '')[:36]} | {d.get('year')} | tracks {kinds.get('track', 0)} head {kinds.get('heading', 0)} "
              f"index {kinds.get('index', 0)} subs {len(subs)} | pos {dict(sh)} | trackArtists {tart} | trackCredits {credits} | "
              f"images {len(d.get('images') or [])} videos {len(d.get('videos') or [])} | versions {v.get('pagination', {}).get('items')} | "
              f"forSale {d.get('num_for_sale')} | lacks {missing} | heads {heads[:4]}")
    print('\nfields seen (masters having each):', sorted(fields.items()))
    print('\nposition shapes:', shapes.most_common())
    print('\ntrack credit roles:', track_roles.most_common(60))


if __name__ == '__main__':
    main()
