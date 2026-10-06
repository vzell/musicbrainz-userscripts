"""Probe the release-group search behind the "#" event tooltip.

A release-tracklist track's "#" cell previews the release group (RG) named
after the track's event — the recording comment without "<type>, " and
"; info" ("live, 1996‐04‐22: Royal Albert Hall, …" → "1996‐04‐22: Royal
Albert Hall, …"). https://musicbrainz.org/doc/MusicBrainz_API/Search
(checked 2026-10-05) says: fields `releasegroup` (title, the default) and
`arid` (artist MBID), full Lucene syntax, special characters escaped with a
backslash, limit 25 by default / 100 at most, a `score` per result, and per
release group `id`, `title`, `primary-type`, `secondary-types`,
`artist-credit`, `releases`.

What the live index does (re-run this to re-check):
  1. phrase + artist, exact title        → the RG at score 100
  2. the same with a plain "-"            → the same RG ("‐"/"-" index alike)
  3. phrase + artist, venue reordered     → 0 (a phrase is the exact title)
  4. phrase + artist, an event with no RG → 0
  5. terms + artist (the website's "indexed search" without the artist
     scope finds 23,542 for case 4)       → the closest titles, for hints

Writes the answers the spec replays to tests/fixtures/ws2-rg-search-*.json.

usage: python3 scripts/probe-rg-event-search.py
"""
import json
import pathlib
import time
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-rg-search-probe/1.0 (info@volkerzell.de)'
ARID = '70248960-cb53-4ea4-943a-edb18f7d336f'  # Bruce Springsteen
OUT = pathlib.Path(__file__).resolve().parent.parent / 'tests' / 'fixtures'

CASES = [
    ('found', f'releasegroup:"1996‐04‐19: ICC Berlin, Saal 1, Berlin, Germany" AND arid:{ARID}'),
    ('found-ascii', f'releasegroup:"1996-04-19: ICC Berlin, Saal 1, Berlin, Germany" AND arid:{ARID}'),
    ('reordered', f'releasegroup:"1996‐04‐19: Saal 1, ICC Berlin, Berlin, Germany" AND arid:{ARID}'),
    ('none', f'releasegroup:"1996‐04‐22: Royal Albert Hall, London, England, UK" AND arid:{ARID}'),
    ('terms', f'releasegroup:(1996 04 22 Royal Albert Hall London England UK) AND arid:{ARID}'),
]


def search(query, limit=10):
    """One release-group search; returns the parsed JSON."""
    url = 'https://musicbrainz.org/ws/2/release-group?' + urllib.parse.urlencode(
        {'query': query, 'limit': limit, 'fmt': 'json'})
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))


def main():
    """Runs every case, prints the hits, saves the answers."""
    for name, query in CASES:
        data = search(query)
        print(f'== {name}: count={data.get("count")}  [{query}]')
        for rg in data.get('release-groups', [])[:8]:
            print(f'   {rg.get("score"):>3} {rg.get("id")} {rg.get("title")} '
                  f'({rg.get("primary-type")}; {", ".join(rg.get("secondary-types") or [])})')
        (OUT / f'ws2-rg-search-{name}.json').write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
        time.sleep(1.2)


if __name__ == '__main__':
    main()
