"""Probe the Web Service browses behind the MusicBrainz windows' List tables
(org/MB-POH-sync-withDiscogs.org, Phase 3b), and the series lookup's key for
a release-group item (Phase 3a).

https://musicbrainz.org/doc/MusicBrainz_API (checked 2026-10-27) lists the
three browses (release by recording, event by place, release-group by
artist), a limit of at most 100, `offset` growing by the rows returned (the
release browse's 500-track cap), and says the ORDER of browse results
"depends on what linked entity you are browsing by (however it will always be
consistent)" without saying which. That order is what a List table shows
before any column is sorted (its "initial order"), so it is probed here:

  1. /ws/2/release?recording=<Thunder Road>&inc=media+labels: the order
     (dates, titles), the count, and whether each release carries the
     `cover-art-archive` block the release-group window already relies on;
  2. /ws/2/event?place=<The Stone Pony>: the order (begin dates), the count;
  3. /ws/2/release-group?artist=<Bruce Springsteen>&inc=artist-credits: the
     order (first-release-dates, titles), the count, types;
  4. a release-group series' lookup with release-group-rels: the key its
     relations hold the target under (`release_group` or `release-group`)
     and the `target-type`.

One request every 1.1 s, as the userscript's rate gate; a 503 is tried again.
With --save the page-1 answers are written as fixtures for the specs:
tests/fixtures/ws2-pop-recording-thunder-releases.json,
ws2-pop-place-sp-events.json (the committed one, of 2026-10-07, was kept: it
has the same count, 110, and 100 events; the lists were not compared),
ws2-pop-artist-bruce-rgs-album-p1.json,
ws2-pop-artist-bruce-rgs-single-p1.json and ws2-pop-series-rg.json. The
unfiltered artist browse is printed, not saved.

Result 2026-10-27 (NB-3641, n/a browser): all three orders by neither date
nor title; 100 of 100 releases carry cover-art-archive (97 a front); the
unfiltered release-group browse starts with Albums only (100 of 2,146), a
type filter has its own count (album 1,924, single 178, ep 28); a series'
release-group item is target-type 'release_group' under the key
'release_group'.

usage: python3 scripts/probe-mb-window-browses.py [--save]
"""
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-window-browse-probe/1.0 (info@volkerzell.de)'
BASE = 'https://musicbrainz.org/ws/2/'
REC = 'bbcedc0f-2fff-42f4-9ca6-6d2263d1a042'      # the studio "Thunder Road"
PLACE = '6a59a67c-fcc5-491f-949c-bfc45bc97463'    # The Stone Pony
ARTIST = '70248960-cb53-4ea4-943a-edb18f7d336f'   # Bruce Springsteen
FIX = pathlib.Path(__file__).resolve().parent.parent / 'tests' / 'fixtures'
SAVE = '--save' in sys.argv
_last = [0.0]


def get(path, tries=4):
    """GET one /ws/2 path as JSON, at most one request per 1.1 s; a 503
    (MusicBrainz's answer under load) is tried again after 3 s, 6 s, …"""
    for attempt in range(tries):
        wait = 1.1 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        req = urllib.request.Request(BASE + path, headers={'User-Agent': UA, 'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                return json.loads(res.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code != 503 or attempt == tries - 1:
                raise
            time.sleep(3 * (attempt + 1))
    return None


def save(name, data):
    """Write a fixture when --save was given."""
    if SAVE:
        (FIX / name).write_text(json.dumps(data, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
        print(f'  saved tests/fixtures/{name}')


def is_sorted(vals):
    """Whether a list of strings is in ascending order ('' last)."""
    keyed = [v or '9999' for v in vals]
    return keyed == sorted(keyed)


def main():
    """Run the four probes and print what each answered."""
    print('1. release?recording=')
    d = get(f'release?recording={REC}&inc=media+labels&limit=100&offset=0&fmt=json')
    rels = d['releases']
    print(f'  release-count {d.get("release-count")}, returned {len(rels)}')
    print(f'  ordered by date: {is_sorted([r.get("date", "") for r in rels])}; by title: {is_sorted([r["title"] for r in rels])}')
    print('  first 6:', [(r.get('date', ''), r['title'], r.get('status')) for r in rels[:6]])
    caa = [('cover-art-archive' in r) for r in rels]
    print(f'  cover-art-archive block on {sum(caa)} of {len(rels)}; front true on '
          f'{sum(1 for r in rels if (r.get("cover-art-archive") or {}).get("front"))}')
    print('  statuses:', sorted({r.get('status') or '' for r in rels}))
    save('ws2-pop-recording-thunder-releases.json', d)

    print('2. event?place=')
    d = get(f'event?place={PLACE}&limit=100&offset=0&fmt=json')
    evs = d['events']
    begins = [(e.get('life-span') or {}).get('begin', '') for e in evs]
    print(f'  event-count {d.get("event-count")}, returned {len(evs)}')
    print(f'  ordered by begin: {is_sorted(begins)}; reverse: {is_sorted(begins[::-1])}')
    print('  first 6 begins:', begins[:6], ' last 3:', begins[-3:])
    print('  types:', sorted({e.get('type') or '' for e in evs}))
    save('ws2-pop-place-sp-events.json', d)

    print('3. release-group?artist=')
    d = get(f'release-group?artist={ARTIST}&inc=artist-credits&limit=100&offset=0&fmt=json')
    rgs = d['release-groups']
    dates = [g.get('first-release-date', '') for g in rgs]
    print(f'  release-group-count {d.get("release-group-count")}, returned {len(rgs)}')
    print(f'  ordered by first-release-date: {is_sorted(dates)}; by title: {is_sorted([g["title"] for g in rgs])}')
    print('  first 6:', [(g.get('first-release-date', ''), g['title'], g.get('primary-type')) for g in rgs[:6]])
    print('  primary types:', sorted({g.get('primary-type') or '' for g in rgs}))
    print('  keys of one:', sorted(rgs[0].keys()))
    # The browse runs Album first (the probe of 2026-10-27: 100 of 2,146,
    # all Albums): a type filter gives each type its own count and list.
    for t in ('album', 'single', 'ep'):
        d = get(f'release-group?artist={ARTIST}&type={t}&inc=artist-credits&limit=100&offset=0&fmt=json')
        print(f'  type={t}: release-group-count {d.get("release-group-count")}, returned {len(d["release-groups"])}, '
              f'types {sorted({g.get("primary-type") or "" for g in d["release-groups"]})}, '
              f'secondary {sorted({"+".join(g.get("secondary-types") or []) for g in d["release-groups"]})}')
        if t in ('album', 'single'):
            save(f'ws2-pop-artist-bruce-rgs-{t}-p1.json', d)

    print('4. a release-group series')
    q = urllib.parse.quote('type:"Release group series"')
    s = get(f'series?query={q}&limit=5&fmt=json')
    for cand in s.get('series', []):
        d = get(f'series/{cand["id"]}?inc=release-group-rels&fmt=json')
        rgrels = [r for r in d.get('relations', []) if 'group' in r.get('target-type', '')]
        if not rgrels:
            continue
        r = rgrels[0]
        print(f'  series {cand["id"]} "{d["name"]}": {len(rgrels)} release-group relations')
        print(f'  target-type {r["target-type"]!r}; keys holding an entity: {[k for k in r if isinstance(r[k], dict) and "id" in r[k]]}')
        save('ws2-pop-series-rg.json', d)
        break
    else:
        print('  no release-group series with items among the first 5 hits')


if __name__ == '__main__':
    main()
