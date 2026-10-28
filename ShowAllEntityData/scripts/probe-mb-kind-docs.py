"""Probe which MusicBrainz documentation pages exist for each entity kind
(org/POH-headerline.org, Step 2): the window's path puts a glyph before
every step, and the glyph links the kind's documentation page
(`/doc/<Page>`) with its style guide (`/doc/Style/<Page>`) in the card's
foot. The documentation pages are the MusicBrainz wiki's pages of the same
title, so ONE request to the wiki's API (`action=query&titles=…`, up to 50
titles, `redirects`) says which exist, which redirect where, and which are
missing — no page is guessed.

Result 2026-10-28T14:55:40+01:00 (NB-3641, browser n/a): every kind's page
exists (artist, release, release-group as Release_Group, recording, work,
label, area, place, event, series, instrument, genre, collection as
Collections, editor as Editor); a style guide exists for artist, release,
release group, recording, work, place, event and series only — Style/Label,
Style/Area, Style/Instrument, Style/Genre, Style/Collections and
Style/Editor are missing. The userscript's `_MB_KIND_DOCS` holds exactly
these titles.

usage: python3 scripts/probe-mb-kind-docs.py
"""
import json
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-kind-docs-probe/1.0 (info@volkerzell.de)'
# The kinds with a glyph (`_MB_KIND_ICON`) and the page names to try.
KINDS = {
    'artist': 'Artist', 'release': 'Release', 'release-group': 'Release_Group', 'recording': 'Recording',
    'work': 'Work', 'label': 'Label', 'area': 'Area', 'place': 'Place', 'event': 'Event', 'series': 'Series',
    'instrument': 'Instrument', 'genre': 'Genre', 'collection': 'Collections', 'user': 'Editor',
}


def main():
    """Asks the wiki about every page and its style guide, prints a table."""
    titles = []
    for page in KINDS.values():
        titles += [page.replace('_', ' '), f'Style/{page}'.replace('_', ' ')]
    url = 'https://wiki.musicbrainz.org/api.php?' + urllib.parse.urlencode({
        'action': 'query', 'format': 'json', 'redirects': '1', 'titles': '|'.join(titles),
    })
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as res:
        d = json.loads(res.read().decode('utf-8'))
    q = d.get('query', {})
    norm = {x['from']: x['to'] for x in q.get('normalized', [])}
    redir = {x['from']: x['to'] for x in q.get('redirects', [])}
    pages = {p['title']: p for p in q.get('pages', {}).values()}

    def state(title):
        t = norm.get(title, title)
        to = redir.get(t)
        p = pages.get(to or t, {})
        if 'missing' in p:
            return 'MISSING'
        return f'redirects to {to}' if to else 'exists'

    print(f"{'kind':<14} {'page':<16} {'doc':<34} style")
    for kind, page in KINDS.items():
        print(f"{kind:<14} {page:<16} {state(page.replace('_', ' ')):<34} {state(f'Style/{page}'.replace('_', ' '))}")


if __name__ == '__main__':
    main()
