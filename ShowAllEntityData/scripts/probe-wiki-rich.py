#!/usr/bin/env python3
"""Probe what the rich Wikidata and Wikipedia windows would ask (branch B).

The approved mockup (https://claude.ai/artifact/URrn3dps1EMtnkjKBvsvag, tabs
"Wikidata" and "Wikipedia") keeps the hover card at ONE small request and
lets Space ask more. Before any code depends on it, this records:

1. Wikidata `wbgetentities props=claims` for an item: bytes, time, how many
   properties, how many are external identifiers, how many items the
   statements point to (each needs a name: `wbgetentities props=labels`, at
   most 50 ids a request);
2. one such label request for the first 50 of them: bytes, time;
3. the identifiers' address patterns (P1630 "formatter URL"): asked per
   property through `wbgetentities ids=P…|… props=claims` (bytes for 50), and
   through one SPARQL query on query.wikidata.org (bytes, time) — whichever
   is smaller decides;
4. Wikipedia `action=parse` of the opening section with its language
   links (`prop=text|langlinks`, `section=0`, `redirects=1`,
   `formatversion=2`): bytes, time, languages, whether the infobox is in
   section 0; then the section list on its own (`prop=sections`, no
   `section`: with `section=0` the list holds only that section, which the
   first run of this probe showed as "0 sections");
5. one later section the same way (`section=N`, `prop=text`).

One request per 1.2 s per host. Run: python3 scripts/probe-wiki-rich.py

`--save` also writes the answers the windows read as fixtures (raw bodies,
tests/fixtures/ext-wd-*.json and ext-wp-*.json): the item's claims with
labels and sitelinks, the properties' SPARQL answer (labels, formatter URL,
whether an authority file), the items' labels in English and German, and
Wikipedia's section 0, section list and section 1. The specs answer the
windows' requests from these by URL pattern (`__gmXhrResponder`), so a
query's exact text may change without a new capture.
"""

import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 (https://github.com/vzell/mb-userscripts)'
ITEM = 'Q1225'
ARTICLE = ('en', 'Bruce_Springsteen')
_last = {}


def get(url, accept='application/json'):
    """GET with the per-host gap; returns (status, bytes, seconds, body)."""
    host = urllib.parse.urlsplit(url).hostname
    wait = 1.2 - (time.time() - _last.get(host, 0))
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Api-User-Agent': UA, 'Accept': accept})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
            status = r.status
    except urllib.error.HTTPError as e:
        body, status = e.read(), e.code
    _last[host] = time.time()
    return status, len(body), round(time.time() - t0, 2), body


OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures')
SAVE = '--save' in sys.argv


def save(name, body):
    """Write a raw answer as tests/fixtures/<name>.json when --save is given."""
    if SAVE:
        with open(os.path.join(OUT, f'{name}.json'), 'wb') as fh:
            fh.write(body)


def main():
    """Run the five probes and print one line each."""
    wd = 'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json'
    st, n, s, body = get(f'{wd}&ids={ITEM}&props=claims')
    claims = json.loads(body)['entities'][ITEM]['claims']
    if SAVE:
        save(f'ext-wd-claims-{ITEM}', get(f'{wd}&ids={ITEM}&props=claims%7Clabels%7Csitelinks')[3])
    ext = [p for p, cs in claims.items() if cs and cs[0]['mainsnak'].get('datatype') == 'external-id']
    items = []
    for cs in claims.values():
        for c in cs:
            v = c['mainsnak'].get('datavalue', {}).get('value')
            if isinstance(v, dict) and v.get('entity-type') == 'item':
                items.append(v['id'])
            for qs in (c.get('qualifiers') or {}).values():
                for q in qs:
                    qv = q.get('datavalue', {}).get('value')
                    if isinstance(qv, dict) and qv.get('entity-type') == 'item':
                        items.append(qv['id'])
    items = list(dict.fromkeys(items))
    print(f'1. claims {ITEM}: {st} {n} B {s} s; {len(claims)} properties, {len(ext)} external ids, '
          f'{len(items)} items named (labels: {-(-len(items) // 50)} requests of 50)')

    st, n, s, _ = get(f'{wd}&ids={"|".join(items[:50])}&props=labels&languages=en|de')
    print(f'2. labels of 50 items (en|de): {st} {n} B {s} s')
    if SAVE:
        for lang in ('en', 'de'):
            q = ('SELECT ?i ?l WHERE { VALUES ?i { ' + ' '.join(f'wd:{x}' for x in items) + ' } '
                 f'?i rdfs:label ?l . FILTER(LANG(?l) = "{lang}") }}')
            save(f'ext-wd-items-{ITEM}-{lang}', get('https://query.wikidata.org/sparql?format=json&query=' + urllib.parse.quote(q),
                                                    accept='application/sparql-results+json')[3])

    st, n, s, body = get(f'{wd}&ids={"|".join(ext[:50])}&props=claims')
    d = json.loads(body).get('entities', {})
    have = sum(1 for e in d.values() if (e.get('claims') or {}).get('P1630'))
    print(f'3a. claims of 50 identifier properties: {st} {n} B {s} s; {have} with P1630')

    if SAVE:
        allp = ' '.join(f'wd:{p}' for p in claims)
        q = ('SELECT ?p ?l ?f ?a WHERE { VALUES ?p { ' + allp + ' } '
             'OPTIONAL { ?p rdfs:label ?l . FILTER(LANG(?l) = "en") } OPTIONAL { ?p wdt:P1630 ?f } '
             # Most authority-control properties are instances of a SUBCLASS
             # of Q18614948 ("... for people", "... for works"): the direct
             # P31 found 5 of Q1225's 267 (first run, 2026-10-29).
             'OPTIONAL { ?p wdt:P31/wdt:P279* wd:Q18614948 . BIND(1 AS ?a) } }')
        save(f'ext-wd-props-{ITEM}-en', get('https://query.wikidata.org/sparql?format=json&query=' + urllib.parse.quote(q),
                                           accept='application/sparql-results+json')[3])
    values = ' '.join(f'wd:{p}' for p in ext)
    q = f'SELECT ?p ?f WHERE {{ VALUES ?p {{ {values} }} ?p wdt:P1630 ?f . }}'
    st, n, s, body = get('https://query.wikidata.org/sparql?format=json&query=' + urllib.parse.quote(q),
                         accept='application/sparql-results+json')
    rows = json.loads(body)['results']['bindings'] if st == 200 else []
    print(f'3b. SPARQL formatter URLs of all {len(ext)}: {st} {n} B {s} s; {len({r["p"]["value"] for r in rows})} properties have one')

    lang, title = ARTICLE
    api = f'https://{lang}.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2&redirects=1&page={title}'
    st, n, s, body = get(f'{api}&prop=text|langlinks&section=0')
    save(f'ext-wp-{lang}-{title}-s0', body)
    p = json.loads(body).get('parse', {})
    html = p.get('text', '')
    print(f'4a. parse section 0 ({lang}:{title}): {st} {n} B {s} s; '
          f'{len(p.get("langlinks", []))} languages, infobox in section 0: {"infobox" in html}, '
          f'paragraphs: {len(re.findall(r"<p>", html))}')
    st, n, s, body = get(f'{api}&prop=sections')
    save(f'ext-wp-{lang}-{title}-sections', body)
    secs = json.loads(body).get('parse', {}).get('sections', [])
    print(f'4b. parse sections: {st} {n} B {s} s; {len(secs)} sections, '
          f'{sum(1 for x in secs if x.get("toclevel") == 1)} at the top level')

    pick = next((x for x in secs if x.get('toclevel') == 1 and 'Early' in x.get('line', '')), secs[0] if secs else None)
    if pick:
        st, n, s, body = get(f'{api}&prop=text&section={pick["index"]}')
        save(f'ext-wp-{lang}-{title}-s{pick["index"]}', body)
        t = json.loads(body).get('parse', {}).get('text', '')
        print(f'5. parse section {pick["index"]} "{pick["line"]}": {st} {n} B {s} s; paragraphs: {len(re.findall(r"<p>", t))}, '
              f'tables: {len(re.findall(r"<table", t))}, references: {len(re.findall(r"class=\"reference\"", t))}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
