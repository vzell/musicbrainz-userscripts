#!/usr/bin/env python3
"""Collects the data for Phase 11's mockup (org/brucebase.org, tag pages)
from the pages scripts/probe-bb-tag-pages.py saved in debug/, plus a few
signed-out AJAX calls 1 s apart:

  - the tag cloud: every tag, its font-size weight, its family as
    _bbTagFamily() sorts it without a page's context (a Python copy of the
    rules), the family totals;
  - %%total%% (pages) for a sample of tags across the weights, to show what
    the weight means;
  - one ListPages page (250) of storyteller with a plain template:
    fullname, title, created_at, updated_at, rating, comments, size, tags;
  - the pages-and-tags rows of p1.

Writes debug/bb-tags-mockup-data.json (gitignored; no member names are
asked for).

    python3 scripts/fetch-bb-tags-mockup-data.py
"""

import collections
import html
import json
import os
import re
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DBG = os.path.join(ROOT, 'debug')
BASE = 'https://brucebase.wikidot.com'
TOKEN = 'saprobe'
UA = 'ShowAllEntityData-probe/1.0 (+https://github.com/vzell/mb-userscripts)'
SEP = '␂'
_last = [0.0]

CATEGORIES = set('gig nogig recording rehearsal interview song venue relation retail bootleg lyrics ott playlist files '
                 'content info gignote news media gallery story eye recnote onstage offstage multi nobruce soundcheck'.split())
MATERIAL = set('audio bootleg eyewitness storyteller ticket livedl boxset private guest help cancelled rescheduled video '
               'prem setlist pass photo handwritten printed centermic debut tourpremiere memorabilia'.split())
MONTHS = set('january february march april may june july august september october november december'.split())
DAYS = set('monday tuesday wednesday thursday friday saturday sunday'.split())
COUNTRIES = re.compile(r'^(?:usa|england|scotland|wales|ireland|germany|canada|italy|france|spain|sweden|norway|denmark|'
                       r'finland|netherlands|belgium|switzerland|austria|australia|newzealand|japan|brazil|argentina|chile|'
                       r'mexico|poland|portugal|czechrepublic|hungary|greece|israel|southafrica|india)$')


def family(tag):
    """_bbTagFamily(tag) with no page context."""
    t = tag.lower()
    if re.match(r'^\d{4}$', t) or re.match(r'^\d{2}$', t) or t in MONTHS or t in DAYS:
        return 'date'
    if re.match(r'^(?:[a-z]|0-9)$', t):
        return 'letter'
    m = re.match(r'^(tour|r|ott|lbl|pl|key|toursnip)_', t)
    if m:
        return {'tour': 'tour', 'r': 'release', 'ott': 'ott', 'lbl': 'label', 'pl': 'playlist', 'key': 'key', 'toursnip': 'snippet'}[m.group(1)]
    if t in MATERIAL:
        return 'material'
    if t in CATEGORIES:
        return 'category'
    if re.search(r'\([a-z]{2,3}\)$', t) or COUNTRIES.match(t):
        return 'place'
    if '.' in t:
        return 'person'
    return 'other'


def post(params):
    """One module call 1 s after the previous one; the JSON answer."""
    wait = 1.0 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    body = urllib.parse.urlencode({**params, 'wikidot_token7': TOKEN}).encode()
    req = urllib.request.Request(BASE + '/ajax-module-connector.php', data=body, headers={
        'User-Agent': UA, 'Cookie': f'wikidot_token7={TOKEN}',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    })
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=90) as res:
        js = json.loads(res.read().decode('utf-8'))
    _last[0] = time.time()
    js['_secs'] = round(_last[0] - t0, 2)
    return js


def total(tag):
    """A tag's page count (%%total%%, perPage 1)."""
    js = post({'moduleName': 'list/ListPagesModule', 'tags': tag, 'category': '*', 'perPage': 1, 'module_body': '%%total%%'})
    m = re.search(r'<p>\s*(\d+)\s*</p>', js.get('body') or '')
    return int(m.group(1)) if m else None, js['_secs']


def read(name):
    """One saved debug page."""
    with open(os.path.join(DBG, name), encoding='utf-8') as f:
        return f.read()


def main():
    """Builds the JSON."""
    cloud = read('bb-page-tags-raw.html')
    tags = [(urllib.parse.unquote(h), float(s), html.unescape(t)) for h, s, t in re.findall(
        r'<a class="tag" href="/system:page-tags/tag/([^"]+)"\s*style="font-size:\s*([\d.]+)%[^"]*"\s*>([^<]*)</a>', cloud)]
    fams = collections.Counter(family(t) for _, _, t in tags)
    sizes = collections.Counter(s for _, s, _ in tags)
    by_size = sorted(tags, key=lambda x: -x[1])
    sample = [by_size[0], by_size[3], by_size[20], by_size[100], by_size[400], by_size[1500]]
    sample += [x for x in tags if x[2] in ('storyteller', 'badlands', 'patti.scialfa', 'tour_rivertour', '1978', 'thepromise')]
    totals = []
    for h, s, t in sample:
        n, secs = total(h)
        totals.append({'tag': t, 'weight': s, 'pages': n, 'secs': secs, 'family': family(t)})
        print(f'{t}: weight {s}% → {n} pages ({secs} s)')
    tpl = SEP.join(['%%fullname%%', '%%title%%', '%%created_at%%', '%%updated_at%%', '%%rating%%', '%%comments%%', '%%size%%', '%%tags%%']) + '␃'
    js = post({'moduleName': 'list/ListPagesModule', 'tags': 'storyteller', 'category': '*', 'perPage': 250,
               'order': 'titleAsc', 'separate': 'false', 'module_body': tpl, 'p': 1})
    body = js.get('body') or ''
    text = html.unescape(re.sub(r'<span class="odate time_(\d+)[^>]*>[^<]*</span>', r'@\1', body))
    text = re.sub(r'<br\s*/?>', ' ', text)
    text = re.sub(r'<[^>]+>', '', text)
    items = []
    for chunk in text.split('␃'):
        f = chunk.strip().split(SEP)
        if len(f) == 8:
            items.append({'name': f[0], 'title': f[1], 'created': f[2], 'updated': f[3], 'rating': f[4],
                          'comments': f[5], 'size': f[6], 'tags': f[7].split()})
    print(f'storyteller ListPages: {len(items)} items, {len(json.dumps(js)):,} bytes, {js["_secs"]} s')
    pat = read('bb-pages-and-tags-p1-raw.html')
    tb = re.search(r'<table class="wiki-content-table">(.*?)</table>', pat, re.S).group(1)
    rows = []
    for r in re.findall(r'<tr>(.*?)</tr>', tb, re.S):
        a = re.search(r'<a href="([^"]+)">(.*?)</a>', r)
        tds = re.findall(r'<td>(.*?)</td>', r, re.S)
        if a and len(tds) == 2:
            rows.append({'href': a.group(1), 'title': html.unescape(a.group(2)), 'tags': tds[1].split()})
    st = read('bb-tag-storyteller-raw.html')
    tagged = [(h, html.unescape(t)) for h, t in re.findall(
        r'<div class="pages-list-item">\s*<div class="title">\s*<a href="([^"]+)">(.*?)</a>', st)]
    out = {
        'cloud': {'count': len(tags), 'families': fams.most_common(), 'sizes': sorted(sizes.items()),
                  'top': [{'tag': t, 'weight': s, 'family': family(t)} for _, s, t in by_size[:60]]},
        'totals': totals,
        'storyteller_listpages': items[:60], 'storyteller_listpages_n': len(items),
        'storyteller_tagged': tagged[:80], 'storyteller_tagged_n': len(tagged),
        'pages_and_tags_p1': rows,
    }
    with open(os.path.join(DBG, 'bb-tags-mockup-data.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f'families: {fams.most_common()}')
    if items:
        print(f'first item: {items[0]}')


if __name__ == '__main__':
    main()
