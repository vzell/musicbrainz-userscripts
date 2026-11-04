#!/usr/bin/env python3
"""Census of the springsteenlyrics.com URLs MusicBrainz carries (read-only).

Two places, both through the WS/2 search API
(https://musicbrainz.org/doc/MusicBrainz_API/Search, read 2026-11-04):

- URL entities (relationships): /ws/2/url?query=..., field `url` ("the actual
  URL string"), `url_descendent` (the URL and every path below it);
- annotations: /ws/2/annotation?query=..., field `text` ("the annotation's
  content (includes wiki formatting)").

The docs promise "the full Lucene Search syntax" but say nothing about
wildcards on these fields, so the probe tries several query forms and reports
what each returns, rather than assuming one works. limit is at most 100;
paging is by `offset`. One request per 1.1 s (the documented rate limit is
about 1/s per client).

Each URL found is classified by shape (item page, song page, list, ...),
counted, and written with a few examples to the JSON given as the first
argument (default: the scratch file below).

usage:
  python3 scripts/probe-mb-sl-urls.py [out.json]
"""

import json
import re
import sys
import time
import urllib.parse
import urllib.request

WS = 'https://musicbrainz.org/ws/2/'
UA = 'ShowAllEntityData-probe/1.0 ( https://github.com/vzell/mb-userscripts )'
GAP_S = 1.1
MAX_PAGES = 30

_last = [0.0]


def get(resource, query, offset=0):
    """One search request; returns the parsed JSON, or {'error': ...}."""
    wait = _last[0] + GAP_S - time.time()
    if wait > 0:
        time.sleep(wait)
    url = f'{WS}{resource}?' + urllib.parse.urlencode({'query': query, 'fmt': 'json', 'limit': 100, 'offset': offset})
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            _last[0] = time.time()
            return json.loads(r.read().decode('utf-8'))
    except Exception as e:  # noqa: BLE001 - a probe reports, it does not crash
        _last[0] = time.time()
        return {'error': str(e)}


SL_RE = re.compile(r'https?://(?:www\.)?springsteenlyrics\.com[^\s\]\[|<>"\')]*', re.I)


def shape(u):
    """A URL's shape: the path plus the query's parameter names, values elided."""
    p = urllib.parse.urlsplit(u)
    names = sorted(urllib.parse.parse_qs(p.query, keep_blank_values=True).keys())
    q = urllib.parse.parse_qs(p.query)
    cmd = q.get('cmd', [''])[0]
    return f"{p.path or '/'}?{'&'.join(names)}" + (f' (cmd={cmd})' if cmd else '')


def search_all(resource, query, pick):
    """Pages through one query; returns (count, [found strings], error)."""
    first = get(resource, query)
    if 'error' in first:
        return 0, [], first['error']
    count = first.get('count', 0)
    found = pick(first)
    off = 100
    pages = 1
    while off < count and pages < MAX_PAGES:
        page = get(resource, query, off)
        if 'error' in page:
            return count, found, page['error']
        found += pick(page)
        off += 100
        pages += 1
    return count, found, None


def pick_urls(js):
    """URL resources: their `resource` strings that are SL URLs."""
    return [u['resource'] for u in js.get('urls', []) if SL_RE.match(u.get('resource', ''))]


def pick_annotations(js):
    """Annotations: every SL URL inside their text, with the entity type."""
    out = []
    for a in js.get('annotations', []):
        for m in SL_RE.findall(a.get('text', '') or ''):
            out.append((a.get('type', ''), m.rstrip('.,;:')))
    return out


def summarise(urls):
    """{shape: {'n': count, 'examples': [...]}} sorted by count."""
    by = {}
    for u in urls:
        s = shape(u)
        e = by.setdefault(s, {'n': 0, 'examples': []})
        e['n'] += 1
        if len(e['examples']) < 3 and u not in e['examples']:
            e['examples'].append(u)
    return dict(sorted(by.items(), key=lambda kv: -kv[1]['n']))


def main():
    """Runs every query form, prints a summary and writes the JSON."""
    out_path = sys.argv[1] if len(sys.argv) > 1 else 'probe-mb-sl-urls.json'
    started = time.strftime('%Y-%m-%dT%H:%M:%S%z')
    result = {'started': started, 'url_queries': {}, 'annotation_queries': {}}

    url_forms = [
        'url_descendent:"https://www.springsteenlyrics.com/"',
        'url_descendent:"http://www.springsteenlyrics.com/"',
        'url_descendent:"https://springsteenlyrics.com/"',
        'url:*springsteenlyrics*',
        'springsteenlyrics',
    ]
    all_urls = set()
    for q in url_forms:
        count, found, err = search_all('url', q, pick_urls)
        result['url_queries'][q] = {'count': count, 'sl_urls': len(found), 'error': err}
        all_urls.update(found)
        print(f'url  {q!r}: count={count} sl={len(found)} err={err}')

    ann_forms = ['text:springsteenlyrics', 'text:"springsteenlyrics.com"', 'text:springsteenlyrics*', 'springsteenlyrics']
    ann_hits = set()
    for q in ann_forms:
        count, found, err = search_all('annotation', q, pick_annotations)
        result['annotation_queries'][q] = {'count': count, 'sl_urls': len(found), 'error': err}
        ann_hits.update(found)
        print(f'ann  {q!r}: count={count} sl={len(found)} err={err}')

    result['finished'] = time.strftime('%Y-%m-%dT%H:%M:%S%z')
    result['relationship_urls'] = {'distinct': len(all_urls), 'shapes': summarise(sorted(all_urls))}
    types = {}
    for t, _u in ann_hits:
        types[t] = types.get(t, 0) + 1
    result['annotation_urls'] = {'distinct': len(ann_hits), 'by_entity_type': types,
                                 'shapes': summarise(sorted(u for _t, u in ann_hits))}
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(json.dumps({k: result[k] for k in ('relationship_urls', 'annotation_urls')}, indent=1, ensure_ascii=False)[:6000])


if __name__ == '__main__':
    main()
