#!/usr/bin/env python3
"""Build the Brucebase feed mockup page from its template and data.

  python3 scripts/build-bb-feed-mockup.py debug/bb-feed-mockup.template.html \
      debug/bb-feed-mockup.json debug/bb-feed-mockup.html "<env line>"

The template carries the literal markers /*DATA*/ and /*ENV*/; the data is the
output of scripts/extract-bb-feed-mockup.py, cut to what the views show.
"""
import json
import sys


def main():
    template, data_path, out_path, env = sys.argv[1:5]
    d = json.load(open(data_path, encoding='utf-8'))
    keep = {
        'run': d['run'],
        'counts': d['counts'],
        'relations': [{'name': r['name'], 'title': r['title'], 'feed': r['feed']} for r in d['relations']],
        'songs': [{'name': r['name'], 'title': r['title'], 'feed': r['feed']} for r in d['songs']],
        'stories': [{'name': r['name'], 'title': r['title']} for r in d['stories']],
        'year': [{'name': e['name'], 'title': e['title'], 'dependents': e['dependents']} for e in d['year1975nov']],
    }
    page = open(template, encoding='utf-8').read()
    page = page.replace('/*DATA*/', json.dumps(keep, ensure_ascii=False).replace('</', '<\\/'))
    page = page.replace('/*ENV*/', json.dumps(env, ensure_ascii=False))
    open(out_path, 'w', encoding='utf-8').write(page)
    print(f'{out_path}: {len(page)} bytes')


if __name__ == '__main__':
    main()
