#!/usr/bin/env python3
"""Probes whether Wikidot's ListPages module answers an AJAX call for one
tag's pages on Brucebase, signed out (Phase 11 of org/brucebase.org): a tag
link's card and window would then cost a small JSON answer instead of the
tag page (1.6 MB of tag cloud plus the list: 2.2 MB for storyteller, 6.2 MB
for content).

POSTs to /ajax-module-connector.php, 1 s apart, the token in body and
cookie as scripts/probe-bb-recent-changes.py does:

    moduleName=list/ListPagesModule  tags=<tag>  category=*  perPage=<n>
    order=titleAsc  separate=false  module_body=<a template>  p=<page>

and reports status, bytes, seconds, the item count, and whether the pager
gives a total. Saves each answer as debug/bb-tag-listpages-<tag>-<n>.json.

    python3 scripts/probe-bb-tag-listpages.py [tag ...]
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
BASE = 'https://brucebase.wikidot.com'
TOKEN = 'saprobe'
UA = 'ShowAllEntityData-probe/1.0 (+https://github.com/vzell/mb-userscripts)'
BODY = '[[div class="sa-it"]]%%fullname%%|%%title%%|%%created_at%%|%%updated_at%%|%%rating%%|%%comments%%|%%size%%[[/div]]'
_last = [0.0]


def post(params):
    """POST one module call 1 s after the previous one; (status, text, secs)."""
    wait = 1.0 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    body = urllib.parse.urlencode({**params, 'wikidot_token7': TOKEN}).encode()
    req = urllib.request.Request(BASE + '/ajax-module-connector.php', data=body, headers={
        'User-Agent': UA, 'Cookie': f'wikidot_token7={TOKEN}',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    })
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=90) as res:
            text, status = res.read().decode('utf-8'), res.status
    except urllib.error.HTTPError as e:
        text, status = e.read().decode('utf-8', 'replace'), e.code
    _last[0] = time.time()
    return status, text, _last[0] - t0


def one(tag, per_page, page=1, body=BODY, label=''):
    """One call; prints and saves what came back."""
    st, text, secs = post({
        'moduleName': 'list/ListPagesModule', 'tags': tag, 'category': '*',
        'perPage': per_page, 'order': 'titleAsc', 'separate': 'false',
        'module_body': body, 'p': page,
    })
    try:
        js = json.loads(text)
    except ValueError:
        print(f'{tag} {label}perPage={per_page} p={page}: HTTP {st}, not JSON: {text[:200]}')
        return None
    html = js.get('body') or ''
    items = re.findall(r'<div class="sa-it">(.*?)</div>', html, re.S)
    pager = re.search(r'<span class="pager-no">([^<]*)</span>', html)
    print(f'{tag} {label}perPage={per_page} p={page}: HTTP {st}, status "{js.get("status")}", {len(text):,} bytes, {secs:.1f} s, '
          f'{len(items)} items, pager "{pager.group(1) if pager else "-"}"')
    if js.get('status') != 'ok':
        print('    message: ' + str(js.get('message'))[:300])
    for it in items[:3]:
        print('    item: ' + re.sub(r'\s+', ' ', it)[:240])
    if not items:
        print('    body: ' + re.sub(r'\s+', ' ', html)[:500])
    safe = re.sub(r'[^a-z0-9-]', '_', tag)
    with open(os.path.join(ROOT, 'debug', f'bb-tag-listpages-{safe}-{per_page}-p{page}.json'), 'w', encoding='utf-8') as f:
        json.dump(js, f)
    return js


def main():
    """Small and big tag, small and large pages, a count-only body."""
    tags = sys.argv[1:] or ['storyteller', 'content']
    print(f'probe started {time.strftime("%Y-%m-%dT%H:%M:%S%z")}')
    for tag in tags:
        one(tag, 20)
        one(tag, 250)
        one(tag, 250, 2)
    one(tags[0], 1, body='%%total%%', label='count-only ')


if __name__ == '__main__':
    main()
