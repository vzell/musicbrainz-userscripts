"""Probe the shapes of Discogs release tracklists and credits, for the
`dg-release` "Tracks" view (a sub-table per side or disc, credits as role
columns; org/foreign-detail-PTs.org, the Discogs step).

What it records, per release (anonymous, as a user without a token):
- the formats (name × qty, descriptions);
- the tracklist: how many tracks, headings and index tracks; the position
  patterns ("A1", "1-1", "CD1-1", "1", "3a" …) and the medium each pattern
  gives; whether positions restart under headings;
- tracks with their own artists (a compilation's), and the roles of the
  tracks' own credits;
- the release's credits: how many name tracks, and every distinct shape of
  their `tracks` spec ("A1 to A4, B2", "1-1 to 1-5" …);
- every role seen, with how often, across all releases.

The releases: the main releases of Bruce Springsteen's first masters, his
releases that are not on a master (mostly unofficial, multi-disc), and the
first compilations of "Various" — about 30 requests at Discogs' anonymous
rate (25 a minute). Each answer is kept in OUT_DIR for fixtures.

With --multi: multi-disc sets, boxes, DVDs, cassettes and CD-Rs from later pages
of his list instead, one per format string.

usage: python3 scripts/probe-dg-release-shapes.py OUT_DIR [max_releases] [--multi]
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


def pick_ids(limit):
    """Release ids of different shapes: Springsteen main releases and plain releases, Various compilations."""
    ids = []
    d = get(f'{API}/artists/219986/releases?per_page=100&page=1&sort=year&sort_order=asc')
    rel = [r for r in d.get('releases', []) if r.get('role') == 'Main']
    masters = [r for r in rel if r.get('type') == 'master' and r.get('main_release')]
    plain = [r for r in rel if r.get('type') == 'release']
    ids += [r['main_release'] for r in masters[:10]]
    ids += [r['id'] for r in plain[:8]]
    d = get(f'{API}/artists/219986/releases?per_page=100&page=8&sort=year&sort_order=asc')
    ids += [r['id'] for r in d.get('releases', []) if r.get('role') == 'Main' and r.get('type') == 'release'][:6]
    # Compilations: his appearances on other releases (Discogs answers 404 for
    # "Various"'s own list).
    d = get(f'{API}/artists/219986/releases?per_page=100&page=40&sort=year&sort_order=asc')
    apps = [r for r in d.get('releases', []) if r.get('role') in ('Appearance', 'TrackAppearance')]
    ids += [r.get('main_release') or r['id'] for r in apps][:4]
    seen = []
    for i in ids:
        if i not in seen:
            seen.append(i)
    return seen[:limit]


def pick_multi(limit):
    """Release ids of the larger shapes, from every fourth page of his list (sorted by year, so all of it is
    sampled): the main release of each of his own albums from 1984 on, and releases or compilations of more
    than one disc, a box, a DVD, a cassette or a CD-R, one per format string."""
    want = re.compile(r'(?:^|\s)(?:[2-9]|\d\d)x|Box|DVD|Cassette|CDr|Blu-ray|SACD', re.I)
    albums, multi, seen_fmt = [], [], set()
    for page in range(5, 69, 4):
        d = get(f'{API}/artists/219986/releases?per_page=100&page={page}&sort=year&sort_order=asc')
        for r in d.get('releases', []):
            f = str(r.get('format') or '')
            if r.get('type') == 'master' and r.get('role') == 'Main' and r.get('main_release'):
                albums.append(r['main_release'])
            elif r.get('type') == 'release' and want.search(f):
                key = (r.get('role'), re.sub(r'\d+x', 'Nx', f.split(',')[0]))
                if key not in seen_fmt:
                    seen_fmt.add(key)
                    multi.append(r['id'])
    half = limit // 2
    return (albums[::max(1, len(albums) // half)][:half] + multi)[:limit]


def main():
    """Fetch the releases, print one line per release and the totals."""
    out = sys.argv[1]
    multi = '--multi' in sys.argv
    args = [a for a in sys.argv[2:] if a != '--multi']
    limit = int(args[0]) if args else 28
    os.makedirs(out, exist_ok=True)
    roles = collections.Counter()
    track_roles = collections.Counter()
    specs = collections.Counter()
    shapes = collections.Counter()
    for rid in (pick_multi(limit) if multi else pick_ids(limit)):
        try:
            d = get(f'{API}/releases/{rid}')
        except Exception as e:  # noqa: BLE001 - report and go on
            print(rid, 'ERROR', e)
            continue
        json.dump(d, open(os.path.join(out, f'release-{rid}.json'), 'w', encoding='utf-8'))
        fmts = '; '.join(f"{f.get('qty')}×{f.get('name')} {','.join(f.get('descriptions') or [])}" for f in d.get('formats', []))
        tl = d.get('tracklist', [])
        kinds = collections.Counter(t.get('type_') for t in tl)
        subs = [s for t in tl for s in (t.get('sub_tracks') or [])]
        pos = [t.get('position', '') for t in tl if t.get('type_') == 'track'] + [s.get('position', '') for s in subs]
        sh = collections.Counter(shape(p) for p in pos)
        shapes.update(sh)
        heads = [t.get('title') for t in tl if t.get('type_') == 'heading']
        tart = sum(1 for t in tl if t.get('artists'))
        for t in tl + subs:
            for a in t.get('extraartists') or []:
                track_roles[a.get('role', '')] += 1
        ranged = [a for a in d.get('extraartists', []) if (a.get('tracks') or '').strip()]
        for a in d.get('extraartists', []):
            roles[a.get('role', '')] += 1
        for a in ranged:
            specs[re.sub(r'[A-Za-z]*\d+[a-z]?|[A-Z]{1,2}\b', 'P', a['tracks'].strip())] += 1
        print(f"{rid} | {d.get('title', '')[:40]} | {fmts[:70]} | tracks {kinds.get('track', 0)} head {kinds.get('heading', 0)} "
              f"index {kinds.get('index', 0)} subs {len(subs)} | pos {dict(sh)} | trackArtists {tart} | "
              f"credits {len(d.get('extraartists', []))} ranged {len(ranged)} {[a['tracks'] for a in ranged][:4]} | heads {heads[:4]}")
    print('\nposition shapes:', shapes.most_common())
    print('\nrange spec shapes:', specs.most_common())
    print('\nrelease credit roles:', roles.most_common(60))
    print('\ntrack credit roles:', track_roles.most_common(60))


if __name__ == '__main__':
    main()
