"""Lists the entity ids of the Discogs release fixture (tests/fixtures/
ext-discogs-release.json) and the first master-version ids, for seeding the
MusicBrainz column's specs (tests/fixtures/discogs-mb-column.spec.js).

usage: python3 scripts/inspect-dg-release-fixture.py
"""
import json
import os

HERE = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures')


def load(name):
    """A capture's parsed body."""
    with open(os.path.join(HERE, name), encoding='utf-8') as f:
        return json.loads(json.load(f)['body'])


def main():
    d = load('ext-discogs-release.json')
    print('release', d['id'], d['title'], 'master', d.get('master_id'))
    print('companies:')
    for c in d.get('companies', []):
        print('  ', c.get('entity_type_name'), '|', c.get('name'), '|', c.get('id'))
    print('extraartists:')
    for a in d.get('extraartists', [])[:20]:
        print('  ', a.get('role'), '|', a.get('name'), '|', a.get('id'))
    v = load('ext-discogs-master-versions-p1.json')
    print('versions p1:', [(x['id'], x.get('title')) for x in v['versions'][:6]])


if __name__ == '__main__':
    main()
