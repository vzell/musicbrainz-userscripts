"""Probe the release browse behind the release-group link preview.

org/live-bootleg.org item 4a: the rewritten "N versions available in <RG>"
link on a release page previews the release group's releases. The page's
embedded JSON already carries the RG's name, type, artist and cover flag; only
the list of releases needs a request:

    /ws/2/release?release-group=<mbid>&inc=media+labels&limit=100&fmt=json

https://musicbrainz.org/doc/MusicBrainz_API (checked 2026-10-05) allows
`media` and `labels` on a release browse, a limit of at most 100, and caps
the result at 500 tracks. This confirms against the live endpoint what the
preview reads: `release-count`, and per release `title`, `date`, `country`,
`status`, `media[].format` / `track-count`, `label-info[].label.name` /
`catalog-number` — and whether the count can exceed the releases returned.

Writes the raw answer to tests/fixtures/ws2-rg-release-browse.json so the
spec's canned response is the real one.

Since the popup engine (org/iframe.org, Phase 1) the pinned release-group
window also shows the group's own facts, from one lookup made on pin:

    /ws/2/release-group/<mbid>?inc=artist-credits+genres+ratings+url-rels+annotation&fmt=json

(every one of those includes is valid on a release-group lookup per the same
docs page, checked 2026-10-07; scripts/probe-mb-entity-lookups.py R1). With
--lookup the probe fetches ONLY that answer and saves it as
tests/fixtures/ws2-rg-lookup.json, leaving the browse fixture as it was (the
specs pin its five releases).

usage: python3 scripts/probe-rg-release-browse.py [rg-mbid] [--lookup]
"""
import json
import pathlib
import sys
import urllib.request

UA = 'ShowAllEntityData-rg-preview-probe/1.0 (info@volkerzell.de)'
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
RG = ARGS[0] if ARGS else 'fa9c43a7-2592-3336-a09b-1414b4b6ee68'
URL = f'https://musicbrainz.org/ws/2/release?release-group={RG}&inc=media+labels&limit=100&fmt=json'
LOOKUP = f'https://musicbrainz.org/ws/2/release-group/{RG}?inc=artist-credits+genres+ratings+url-rels+annotation&fmt=json'
FIXTURES = pathlib.Path(__file__).resolve().parent.parent / 'tests' / 'fixtures'
OUT = FIXTURES / 'ws2-rg-release-browse.json'
OUT_LOOKUP = FIXTURES / 'ws2-rg-lookup.json'


def fetch(url):
    """GETs one Web Service URL as JSON."""
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))


def save_lookup():
    """Fetches the release group's own facts and saves them as a fixture."""
    data = fetch(LOOKUP)
    rels = data.get('relations') or []
    print(f'lookup: {data.get("title")} | {data.get("primary-type")} {data.get("secondary-types")} | '
          f'first {data.get("first-release-date")} | rating {data.get("rating")} | '
          f'genres {[g.get("name") for g in data.get("genres") or []]} | {len(rels)} url rels | '
          f'annotation {"present" if data.get("annotation") else "none"}')
    OUT_LOOKUP.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'wrote {OUT_LOOKUP.name}')


def main():
    """Fetches the browse once, prints what the preview would show, saves it
    (or, with --lookup, saves the release group's lookup instead)."""
    if '--lookup' in sys.argv:
        save_lookup()
        return
    data = fetch(URL)
    rels = data.get('releases', [])
    print(f'release-count={data.get("release-count")} returned={len(rels)} offset={data.get("release-offset")}')
    for r in rels:
        media = r.get('media') or []
        fmt = ' + '.join(f'{m.get("format") or "?"}({m.get("track-count")})' for m in media)
        labels = '; '.join(f'{(li.get("label") or {}).get("name")} {li.get("catalog-number") or ""}'.strip()
                           for li in r.get('label-info') or [])
        print(f'  {r.get("id")} | {r.get("title")} | {r.get("date")} | {r.get("country")} | '
              f'{r.get("status")} | {fmt} | {labels} | caa front={(r.get("cover-art-archive") or {}).get("front")}')
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'wrote {OUT.name}')


if __name__ == '__main__':
    main()
