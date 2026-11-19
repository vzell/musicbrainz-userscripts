#!/usr/bin/env python3
"""Find real MusicBrainz examples for the Apollo findings, batch 1.

org/majkinetor.org, TODO "Findings from Apollo / Group Therapy / First Contact /
Credit Hoarder", asks for a real example before each finding is coded. Batch 1
reads only a cell's own text:

- text-invisible: an invisible or odd space-like character in a title or a
  credited name (Apollo's CONFUSABLE invisibles: no-break, narrow no-break,
  thin, en and em spaces, zero-width space, byte-order mark, soft hyphen, tab).
  The ideographic space U+3000 and the zero-width (non-)joiners are counted
  apart: they can be right in CJK and joining scripts.
- text-spacing: a title or credited name with leading, trailing or doubled
  spaces (MusicBrainz may trim these on save; the probe says whether any exist).
- credit-join: a join phrase between two artists that lacks its space
  (Apollo's joinNeed(): a trailing space always; a leading one unless the
  phrase starts with "," or ";"); the last artist's empty join is right, and a
  CJK phrase or name on either side is exempt.

Sources, all /ws/2 (not behind musicbrainz.org's HTML browser check) except the
report page: an artist's releases and recordings browsed with
inc=artist-credits, a CJK artist found by search, and the report "Artist
credits with dubious trailing join phrases". Paced at one request per 2 s, a
503 retried six times (https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting).

Usage:
    python3 scripts/probe-apollo-findings-1.py [--pages N] [--cjk NAME]
        [--out debug/probe-apollo-findings-1.json]
"""
import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 (+https://github.com/vzell/mb-userscripts)'
WS = 'https://musicbrainz.org/ws/2/'
SPRINGSTEEN = '70248960-cb53-4ea4-943a-edb18f7d336f'
_last = [0.0]

INVISIBLE = {
    0x00A0: 'no-break space', 0x202F: 'narrow no-break space', 0x2009: 'thin space',
    0x2002: 'en space', 0x2003: 'em space', 0x200B: 'zero-width space',
    0xFEFF: 'byte-order mark', 0x00AD: 'soft hyphen', 0x0009: 'tab',
}
SCRIPT_DEPENDENT = {0x3000: 'ideographic space', 0x200C: 'zero-width non-joiner', 0x200D: 'zero-width joiner'}
CJK_RE = re.compile('[　-〿぀-ヿ㐀-䶿一-鿿豈-﫿︰-﹏＀-￯가-힯]')


def get(path, params):
    """GET one /ws/2 JSON document, paced at one request per 2 s; retries a 503."""
    url = WS + path + '?' + urllib.parse.urlencode({**params, 'fmt': 'json'})
    for attempt in range(7):
        wait = 2.0 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 503 and attempt < 6:
                time.sleep(5 + 5 * attempt)
                continue
            raise
    return None


def join_need(j):
    """Apollo's joinNeed(): which side of a join phrase lacks its space."""
    return {'lead': not re.match(r'\s', j) and not re.match(r'\s*[,;]', j), 'trail': not re.search(r'\s$', j)}


def scan_text(kind, url, field, text, found, cap):
    """Record invisible characters and odd spacing in one title or name."""
    def add(key, item):
        if len(found[key]) < cap:
            found[key].append(item)
        found['_counts'][key] = found['_counts'].get(key, 0) + 1

    if not text:
        return
    for ch in set(text):
        cp = ord(ch)
        if cp in INVISIBLE:
            add('text-invisible', {'kind': kind, 'url': url, 'field': field, 'text': text,
                                   'char': f'U+{cp:04X} {INVISIBLE[cp]}'})
        elif cp in SCRIPT_DEPENDENT:
            add('script-dependent', {'kind': kind, 'url': url, 'field': field, 'text': text,
                                     'char': f'U+{cp:04X} {SCRIPT_DEPENDENT[cp]}', 'cjk': bool(CJK_RE.search(text))})
    if text != text.strip(' ') or '  ' in text:
        add('text-spacing', {'kind': kind, 'url': url, 'field': field, 'text': repr(text)})


def scan_credit(kind, url, credit, found, cap):
    """Record join phrases that lack their space in one artist credit."""
    if not credit:
        return
    for i, c in enumerate(credit):
        scan_text(kind, url, 'credited name', c.get('name') or '', found, cap)
        if i == len(credit) - 1:
            continue
        j = c.get('joinphrase') or ''
        nxt = credit[i + 1].get('name') or ''
        if CJK_RE.search(j) or CJK_RE.search(c.get('name') or '') or CJK_RE.search(nxt):
            continue
        need = join_need(j)
        if j == '' or need['lead'] or need['trail']:
            item = {'kind': kind, 'url': url, 'credit': ''.join((x.get('name') or '') + (x.get('joinphrase') or '') for x in credit),
                    'join': repr(j), 'missing': [k for k, v in need.items() if v] if j else ['phrase']}
            if len(found['credit-join']) < cap:
                found['credit-join'].append(item)
            found['_counts']['credit-join'] = found['_counts'].get('credit-join', 0) + 1


def browse(entity, artist, pages, found, cap, label):
    """Browse an artist's releases or recordings with their credits and scan them."""
    seen = 0
    for page in range(pages):
        try:
            doc = get(entity, {'artist': artist, 'inc': 'artist-credits', 'limit': 100, 'offset': page * 100})
        except urllib.error.HTTPError as e:
            print(f'{label} page {page + 1}: gave up ({e.code})', file=sys.stderr)
            break
        items = doc.get(entity + 's', [])
        for it in items:
            url = f'https://musicbrainz.org/{entity}/{it["id"]}'
            scan_text(entity, url, 'title', it.get('title') or '', found, cap)
            scan_credit(entity, url, it.get('artist-credit'), found, cap)
        seen += len(items)
        print(f'{label} page {page + 1}: {seen} {entity}s; ' + json.dumps(found['_counts']), file=sys.stderr)
        if len(items) < 100:
            break
    return seen


def main():
    """Run the probe and write the JSON report."""
    ap = argparse.ArgumentParser()
    ap.add_argument('--pages', type=int, default=15)
    ap.add_argument('--cap', type=int, default=8)
    ap.add_argument('--cjk', default='宇多田ヒカル')
    ap.add_argument('--out', default='debug/probe-apollo-findings-1.json')
    a = ap.parse_args()

    found = {'text-invisible': [], 'script-dependent': [], 'text-spacing': [], 'credit-join': [], '_counts': {}}
    checked = {}
    checked['springsteen releases'] = browse('release', SPRINGSTEEN, a.pages, found, a.cap, 'BS releases')
    checked['springsteen recordings'] = browse('recording', SPRINGSTEEN, a.pages, found, a.cap, 'BS recordings')

    cjk = get('artist', {'query': f'artist:"{a.cjk}"', 'limit': 1}).get('artists', [])
    if cjk:
        checked['cjk artist'] = {'name': cjk[0].get('name'), 'mbid': cjk[0]['id']}
        checked['cjk releases'] = browse('release', cjk[0]['id'], max(1, a.pages // 3), found, a.cap, 'CJK releases')

    report_hits = []
    req = urllib.request.Request('https://musicbrainz.org/report/ArtistCreditsWithDubiousTrailingPhrases',
                                 headers={'User-Agent': UA})
    time.sleep(2.0)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            html = r.read().decode('utf-8', 'replace')
        if 'Verifying your browser' in html:
            report_hits = ['(the page answered with the browser check)']
        else:
            for row in html.split('<tr')[1:40]:
                txt = re.sub(r'<[^>]+>', '', row)
                txt = re.sub(r'\s+', ' ', txt).strip()
                if txt:
                    report_hits.append(txt[:200])
    except urllib.error.HTTPError as e:
        report_hits = [f'(HTTP {e.code})']

    report = {'when': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'checked': checked,
              'counts': found.pop('_counts'), 'examples': found, 'dubious_trailing_report': report_hits}
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
