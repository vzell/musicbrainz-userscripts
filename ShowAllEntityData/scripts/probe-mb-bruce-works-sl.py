#!/usr/bin/env python3
"""Read-only probe: which springsteenlyrics.com songs map to a MusicBrainz work?

Source: Bruce Springsteen's works, browsed
`/ws/2/work?artist=70248960-cb53-4ea4-943a-edb18f7d336f&inc=aliases+annotation`
(https://musicbrainz.org/doc/MusicBrainz_API, "Browse": a work browse by
`artist` takes `inc=aliases` and `annotation`; checked live 2026-11-05 with
`limit=5`: 1,587 works, each with an `annotation` field). 100 per request,
1.1 s apart (https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting).

MusicBrainz keeps its SL song links in WORK ANNOTATIONS (DEBUG-NOTES.md
2026-11-04, scripts/probe-mb-sl-urls.py), in two forms:
  /lyrics/<letter>/<slug>.php     (old, 404 today)
  lyrics.php?song=<slug>          (current)

For every SL base title of the index JSON (scripts/probe-sl-song-index.py)
this reports how it would be matched:
  annot   a work's annotation links the song's base slug (exact)
  title   no annotation, but exactly one work whose title or alias
          normalises to the same text
  ambig   several works normalise to it
  none    nothing

Then the precise per-release path for one collection item: a url lookup of
`https://www.springsteenlyrics.com/collection.php?item=N` with
`inc=release-rels`, and that release's works per track
(`inc=recordings+recording-level-rels+work-rels`).

Usage:
    python3 scripts/probe-mb-bruce-works-sl.py [index.json] [out.json] [item]
"""

import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

WS = 'https://musicbrainz.org/ws/2/'
UA = 'ShowAllEntityData-probe/1.0 ( https://github.com/vzell/mb-userscripts )'
BRUCE = '70248960-cb53-4ea4-943a-edb18f7d336f'
GAP_S = 1.1
SL_SONG_RE = re.compile(r'springsteenlyrics\.com/(?:lyrics/[^/\s]+/([\w.-]+?)\.php|lyrics\.php\?song=([\w.-]+))', re.I)
_last = [0.0]


def get(path, params):
    """One WS/2 request; returns the parsed JSON, or {'error': ...}."""
    wait = _last[0] + GAP_S - time.time()
    if wait > 0:
        time.sleep(wait)
    url = WS + path + '?' + urllib.parse.urlencode({**params, 'fmt': 'json'})
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            _last[0] = time.time()
            return json.loads(r.read().decode('utf-8'))
    except Exception as e:  # noqa: BLE001 - a probe reports, it does not crash
        _last[0] = time.time()
        return {'error': str(e)}


def norm(title):
    """Case, accents, punctuation and quotes away; '&' as 'and'."""
    t = unicodedata.normalize('NFD', title or '')
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn').lower()
    t = t.replace('&', ' and ')
    return re.sub(r'[^a-z0-9]', '', t)


def variants(title):
    """The title, and without a leading or trailing parenthetical."""
    out = {norm(title)}
    out.add(norm(re.sub(r'\s*\([^()]*\)\s*$', '', title)))
    out.add(norm(re.sub(r'^\s*\([^()]*\)\s*', '', title)))
    return {v for v in out if v}


def main():
    """Browses the works, matches, prints and writes the report."""
    index_path = sys.argv[1] if len(sys.argv) > 1 else 'debug/sl-song-index.json'
    out = sys.argv[2] if len(sys.argv) > 2 else 'debug/mb-bruce-works-sl.json'
    item = sys.argv[3] if len(sys.argv) > 3 else '10163'
    with open(index_path, encoding='utf-8') as f:
        lines = json.load(f)['lines']
    works = []
    offset, count = 0, None
    while count is None or offset < count:
        d = get('work', {'artist': BRUCE, 'inc': 'aliases annotation', 'limit': 100, 'offset': offset})
        if 'error' in d:
            print(f'offset {offset}: {d["error"]}; retrying once')
            d = get('work', {'artist': BRUCE, 'inc': 'aliases annotation', 'limit': 100, 'offset': offset})
            if 'error' in d:
                sys.exit(f'offset {offset}: {d["error"]}')
        count = d.get('work-count', 0)
        works.extend(d.get('works', []))
        print(f'  offset {offset}: {len(d.get("works", []))} works (of {count})', flush=True)
        offset += 100
        if not d.get('works'):
            break
    by_slug = {}
    annotated = 0
    for w in works:
        slugs = {(a or b).lower() for a, b in SL_SONG_RE.findall(w.get('annotation') or '')}
        if slugs:
            annotated += 1
        for s in slugs:
            by_slug.setdefault(s, set()).add(w['id'])
    by_norm = {}
    for w in works:
        names = [w.get('title', '')] + [a.get('name', '') for a in (w.get('aliases') or [])]
        for n in {v for name in names for v in variants(name)}:
            by_norm.setdefault(n, set()).add(w['id'])
    print(f'\n{len(works)} works, {annotated} with an SL song link in the annotation, '
          f'{len(by_slug)} distinct SL slugs linked')
    base = {}
    for ln in lines:
        if '_' not in ln['slug']:
            base.setdefault(ln['slug'], ln['title'])
    tally = {'annot': 0, 'title': 0, 'ambig': 0, 'none': 0}
    rows = []
    for slug, title in sorted(base.items()):
        stem = re.sub(r'\d+$', '', slug) if re.search(r'[a-z]\d+$', slug) else slug
        ids = by_slug.get(slug) or by_slug.get(stem)
        if ids and len(ids) == 1:
            how = 'annot'
        else:
            cand = set()
            for v in variants(title):
                cand |= by_norm.get(v, set())
            how = 'title' if len(cand) == 1 else 'ambig' if cand else 'none'
            ids = cand
        tally[how] += 1
        rows.append({'slug': slug, 'title': title, 'how': how, 'works': sorted(ids or [])})
    print('SL base songs:', ', '.join(f'{k} {v}' for k, v in tally.items()))
    print('\nambiguous examples:')
    names = {w['id']: (w.get('title'), w.get('disambiguation')) for w in works}
    for r in [r for r in rows if r['how'] == 'ambig'][:12]:
        print(f'  {r["title"]!r}: {[names[i] for i in r["works"]]}')
    print('\nnone examples:', [r['title'] for r in rows if r['how'] == 'none'][:40])
    # The precise path for one collection item.
    res = f'https://www.springsteenlyrics.com/collection.php?item={item}'
    u = get('url', {'resource': res, 'inc': 'release-rels'})
    rels = [r['release']['id'] for r in (u.get('relations') or []) if r.get('target-type') == 'release']
    print(f'\nurl lookup {res}: {"error " + u["error"] if "error" in u else rels}')
    per_track = []
    if rels:
        rel = get(f'release/{rels[0]}', {'inc': 'recordings recording-level-rels work-rels'})
        for m in rel.get('media', []):
            for t in m.get('tracks', []):
                ws = [r['work']['id'] for r in (t.get('recording', {}).get('relations') or []) if r.get('target-type') == 'work']
                per_track.append({'pos': t.get('number'), 'title': t.get('title'), 'works': ws})
                print(f'  {t.get("number")} {t.get("title")}: {ws}')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump({'fetched': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'works': len(works), 'annotated': annotated,
                   'tally': tally, 'rows': rows, 'item': {'url': res, 'releases': rels, 'tracks': per_track}},
                  f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
