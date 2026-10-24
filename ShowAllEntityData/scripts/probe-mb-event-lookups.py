"""MusicBrainz ws/2 answers for the Brucebase MB-Event column (org/TODO.org
"Some enhancements" 3c, f, g; plan in ~/.claude/plans/act-on-the-synchronous-flame.md).

The documentation pages (musicbrainz.org/doc/…, wiki.musicbrainz.org) answer
scripts with a browser check (2026-10-24), so the indexed event fields were
taken from the search server's own schema (github.com/metabrainz/mbsssss,
event/conf/schema.xml): arid (mbid, multi), begin/end (date), eid, event,
place, pid, type, … This probe checks, against the live service, what the
column will rely on:

  1. the year search: `arid:<Bruce> AND begin:[Y-01-01 TO Y-12-31]`, paged by
     100 — how many events a year has, whether `life-span.begin` is the day,
     how often two events share a date;
  2. the name search for one row (`"1985-01-13: Carolina Coliseum, Columbia,
     SC"`), its top hits and scores;
  3. the url lookup of a Brucebase anchor URL (`/ws/2/url?resource=…
     &inc=event-rels`): which spelling matches (http/https, www), whether the
     `#` fragment is kept, and whether several `resource=` go in one request;
  4. the event lookup with `inc=url-rels`: the Brucebase links an event has,
     and their relationship type.

Requests are 1.1 s apart, one at a time, with a User-Agent naming the
script. Answers go to debug/probe-mb-event-lookups.json (raw) and a summary
is printed.

usage: python3 -I scripts/probe-mb-event-lookups.py [YEAR]
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'debug', 'probe-mb-event-lookups.json')
UA = 'ShowAllEntityData-mb-event-probe/1.0 ( info@volkerzell.de )'
WS = 'https://musicbrainz.org/ws/2/'
BRUCE = '70248960-cb53-4ea4-943a-edb18f7d336f'
SPACING_S = 1.1
EVENT_1985_01_13 = 'ac02932d-631a-47e8-a8fe-5d793f605fc8'

_last = [0.0]


def get(path, params):
    """GET a ws/2 JSON answer; returns (status, data or text)."""
    d = _last[0] + SPACING_S - time.time()
    if d > 0:
        time.sleep(d)
    _last[0] = time.time()
    if isinstance(params, list):
        q = urllib.parse.urlencode(params + [('fmt', 'json')])
    else:
        q = urllib.parse.urlencode({**params, 'fmt': 'json'})
    url = WS + path + '?' + q
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode('utf-8')), url
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', 'replace')[:300]
        return e.code, body, url
    except Exception as e:  # noqa: BLE001
        return 0, type(e).__name__, url


def lucene(s):
    """Escapes Lucene's special characters (as `_dgMbLucene()` does)."""
    out = ''
    for ch in s:
        if ch in '+-&|!(){}[]^"~*?:\\/':
            out += '\\' + ch
        else:
            out += ch
    return out


def main(argv):
    """Run the four probes; print a summary, write the raw answers."""
    year = argv[0] if argv else '1985'
    raw = {}
    # 1. Year search, paged.
    events, total, offset = [], None, 0
    while True:
        st, data, url = get('event', {'query': f'arid:{BRUCE} AND begin:[{year}-01-01 TO {year}-12-31]', 'limit': 100, 'offset': offset})
        raw.setdefault('year', []).append({'url': url, 'status': st, 'data': data})
        if st != 200:
            print('year search failed', st, str(data)[:200])
            break
        total = data.get('count')
        batch = data.get('events', [])
        events += batch
        offset += len(batch)
        if not batch or offset >= (total or 0):
            break
    by_date = {}
    for ev in events:
        by_date.setdefault((ev.get('life-span') or {}).get('begin'), []).append(ev)
    print(f'1. year {year}: count {total}, read {len(events)}, distinct dates {len(by_date)}, '
          f'shared dates {sum(1 for v in by_date.values() if len(v) > 1)}, '
          f'begin not a day {sum(1 for k in by_date if not k or len(k) != 10)}')
    for k in sorted(by_date)[:6]:
        print('   ', k, ' | '.join(f"{e.get('name')} [{e.get('type')}] {e.get('score')}" for e in by_date[k]))
    jan13 = by_date.get(f'{year}-01-13', [])
    print('    on 1985-01-13:', [(e['id'], e.get('name')) for e in jan13])
    # 2. Name search for one row.
    q = lucene('1985-01-13: Carolina Coliseum, Columbia, SC')
    st, data, url = get('event', {'query': q, 'limit': 5})
    raw['name'] = {'url': url, 'status': st, 'data': data}
    if st == 200:
        print('2. name search:', [(e.get('score'), e.get('name'), (e.get('life-span') or {}).get('begin')) for e in data.get('events', [])])
    else:
        print('2. name search failed', st)
    # 3. url lookups: spellings, and a batch of two.
    spellings = ['http://brucebase.wikidot.com/1985#130185', 'https://brucebase.wikidot.com/1985#130185',
                 'http://www.brucebase.wikidot.com/1985#130185', 'http://brucebase.wikidot.com/1985']
    raw['url'] = []
    for sp in spellings:
        st, data, url = get('url', {'resource': sp, 'inc': 'event-rels'})
        raw['url'].append({'url': url, 'status': st, 'data': data})
        if st == 200:
            rels = [(r.get('type'), (r.get('event') or {}).get('id')) for r in data.get('relations', [])]
            print(f'3. url {sp}: {st}, resource {data.get("resource")!r}, rels {rels}')
        else:
            print(f'3. url {sp}: {st} {str(data)[:80]}')
    st, data, url = get('url', [('resource', 'http://brucebase.wikidot.com/1985#130185'),
                                ('resource', 'http://brucebase.wikidot.com/1985#040185'), ('inc', 'event-rels')])
    raw['url_batch'] = {'url': url, 'status': st, 'data': data}
    if st == 200:
        urls = data.get('urls', [data]) if isinstance(data, dict) else []
        print('3. batch of two:', st, 'url-count' in data and data.get('url-count'),
              [(u.get('resource'), [(r.get('event') or {}).get('id') for r in u.get('relations', [])]) for u in urls])
    else:
        print('3. batch of two:', st, str(data)[:120])
    # 4. Event lookup with url-rels.
    st, data, url = get(f'event/{EVENT_1985_01_13}', {'inc': 'url-rels'})
    raw['event'] = {'url': url, 'status': st, 'data': data}
    if st == 200:
        print('4. event url-rels:', [(r.get('type'), (r.get('url') or {}).get('resource')) for r in data.get('relations', [])])
    else:
        print('4. event lookup failed', st)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(raw, f, ensure_ascii=False, indent=1)
    print('raw answers:', os.path.relpath(OUT, ROOT))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
