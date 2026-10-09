"""Lists the areas a Web Service fixture names where a card shows them: the
entity's own `area`, `begin-area`, `end-area`, and the `area` of every
place a relation targets — with name, type and id. Used to know which area
chains (org/event-GPE.org) a fixture spec needs answers for.

usage: python3 scripts/list-fixture-areas.py FIXTURE.json [...]
"""
import json
import sys


def main():
    """Prints one line per area found in each fixture."""
    for path in sys.argv[1:]:
        with open(path, encoding='utf-8') as f:
            d = json.load(f)
        print(f'# {path}')
        for k in ('area', 'begin-area', 'end-area'):
            a = d.get(k)
            if a:
                print(f'   {k:<11} {a.get("name")} ({a.get("type")}) {a.get("id")}')
        for r in d.get('relations') or []:
            p = r.get('place')
            if r.get('target-type') == 'place' and p:
                a = p.get('area') or {}
                print(f'   place       {p.get("name")} [{r.get("type")}] -> {a.get("name")} ({a.get("type")}) {a.get("id")}')


if __name__ == '__main__':
    main()
