#!/usr/bin/env python3
"""Groups the output of probe-mb-sl-urls.py into coarse URL kinds.

usage:
  python3 scripts/summarise-mb-sl-urls.py probe-mb-sl-urls.json
"""

import json
import re
import sys

KINDS = [
    ('item page: collection.php?item=N', r'^/collection\.php\?item'),
    ('item page: bootlegs.php?item=N', r'^/bootlegs\.php\?item'),
    ('item page: brucelegs.php?item=N', r'^/brucelegs\.php\?item'),
    ('song page: lyrics.php?song=SLUG', r'^/lyrics\.php\?.*\bsong\b'),
    ('song page by number: lyrics.php?item=N', r'^/lyrics\.php\?.*\bitem\b(?!.*cmd=)'),
    ('cover release: lyrics.php?cmd=displaycoverrelease', r'cmd=displaycoverrelease'),
    ('old song page: /lyrics/<l>/<slug>.php', r'^/lyrics/[^/]+/[^/]+\.php'),
    ('list page: *.php?cmd=list', r'cmd=list'),
    ('landing page: collection|bootlegs|brucelegs|lyrics.php', r'^/(?:collection|bootlegs|brucelegs|lyrics)\.php\?$'),
    ('home: / or index.php', r'^/(?:index\.php)?\?'),
]


def kind_of(shape):
    """The first matching kind's label, or the shape itself."""
    for label, rx in KINDS:
        if re.search(rx, shape):
            return label
    return 'other: ' + shape


def main():
    """Prints counts per kind for relationships and annotations."""
    d = json.load(open(sys.argv[1], encoding='utf-8'))
    print('started', d.get('started'), 'finished', d.get('finished'))
    for q, r in {**d['url_queries'], **d['annotation_queries']}.items():
        print(f'  query {q!r}: {r}')
    for part in ('relationship_urls', 'annotation_urls'):
        sec = d[part]
        agg = {}
        for shape, e in sec['shapes'].items():
            k = kind_of(shape)
            a = agg.setdefault(k, {'n': 0, 'examples': []})
            a['n'] += e['n']
            for x in e['examples']:
                if len(a['examples']) < 2:
                    a['examples'].append(x)
        print(f'\n== {part}: {sec["distinct"]} distinct' + (f', by entity type {sec.get("by_entity_type")}' if 'by_entity_type' in sec else ''))
        for k, a in sorted(agg.items(), key=lambda kv: -kv[1]['n']):
            print(f'  {a["n"]:5d}  {k}   e.g. {a["examples"]}')


if __name__ == '__main__':
    main()
