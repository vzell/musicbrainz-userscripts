"""How many of a Brucebase year's entries MusicBrainz links back (a
`http://brucebase.wikidot.com/<page>#<anchor>` URL relationship on the
event), measured with batched `/ws/2/url?resource=…&inc=event-rels`
lookups, 100 a request, 1.1 s apart (org/TODO.org "Some enhancements" g).
The entries come from the cached year page in debug/bb-year-cache/.

Prints the entries, the anchors MusicBrainz knows, and how many of the
year's events (scripts/probe-mb-event-lookups.py's year search, re-asked
here) carry no anchor of the year: what the column would need one event
lookup each for.

usage: python3 -I scripts/probe-mb-event-anchor-coverage.py [YEAR]
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'ShowAllEntityData-mb-event-probe/1.0 ( info@volkerzell.de )'
BRUCE = '70248960-cb53-4ea4-943a-edb18f7d336f'
_last = [0.0]


def get(url):
    """GET JSON 1.1 s after the previous request; (status, data)."""
    d = _last[0] + 1.1 - time.time()
    if d > 0:
        time.sleep(d)
    _last[0] = time.time()
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return e.code, None


def main(argv):
    """Measure one year."""
    year = argv[0] if argv else '1985'
    page = year if year >= '1965' else '1949-64'
    with open(os.path.join(ROOT, 'debug', 'bb-year-cache', f'{page}.html'), encoding='utf-8', errors='replace') as f:
        text = f.read()
    anchors = re.findall(r'<a name="(\d{6})"></a>\s*(?:<br\s*/?>)?\s*<strong>', text)
    urls = [f'http://brucebase.wikidot.com/{page}#{a}' for a in anchors]
    known = {}
    for i in range(0, len(urls), 100):
        batch = urls[i:i + 100]
        q = '&'.join('resource=' + urllib.parse.quote(u, safe='') for u in batch)
        st, data = get(f'https://musicbrainz.org/ws/2/url?{q}&inc=event-rels&fmt=json')
        if st == 404:
            continue
        items = (data.get('urls') if 'urls' in data else [data]) if data else []
        for u in items:
            known[u['resource']] = [r['event']['id'] for r in u.get('relations', []) if r.get('event')]
    events, offset = [], 0
    while True:
        q = urllib.parse.quote(f'arid:{BRUCE} AND begin:[{year}-01-01 TO {year}-12-31]')
        st, data = get(f'https://musicbrainz.org/ws/2/event?query={q}&limit=100&offset={offset}&fmt=json')
        if st != 200:
            break
        events += data.get('events', [])
        offset += len(data.get('events', []))
        if offset >= data.get('count', 0) or not data.get('events'):
            break
    linked = {e for ids in known.values() for e in ids}
    print(f'{year}: {len(anchors)} entries, {len(known)} anchors known to MusicBrainz, '
          f'{len(events)} MusicBrainz events, {sum(1 for e in events if e["id"] not in linked)} with no anchor of the year')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
