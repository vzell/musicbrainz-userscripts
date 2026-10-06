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

usage: python3 scripts/probe-rg-release-browse.py [rg-mbid]
"""
import json
import pathlib
import sys
import urllib.request

UA = 'ShowAllEntityData-rg-preview-probe/1.0 (info@volkerzell.de)'
RG = sys.argv[1] if len(sys.argv) > 1 else 'fa9c43a7-2592-3336-a09b-1414b4b6ee68'
URL = f'https://musicbrainz.org/ws/2/release?release-group={RG}&inc=media+labels&limit=100&fmt=json'
OUT = pathlib.Path(__file__).resolve().parent.parent / 'tests' / 'fixtures' / 'ws2-rg-release-browse.json'


def main():
    """Fetches the browse once, prints what the preview would show, saves it."""
    req = urllib.request.Request(URL, headers={'User-Agent': UA, 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode('utf-8'))
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
