#!/usr/bin/env python3
"""Probes Brucebase's "Recent changes" list (`system:recent-changes`) the way
the `bb-recent-changes` pageType reads it, and saves what it read into
`debug/` (gitignored) for scripts/build-bb-fixtures.py.

The page's list is not paginated by URL. Its pager and its "Update list"
button call `WIKIDOT.modules.SiteChangesModule.listeners.updateList(n)`
(common--modules/js/changes/SiteChangesModule.js), which POSTs to
`/ajax-module-connector.php`:

    moduleName=changes/SiteChangesListModule
    page=<n>  perpage=<10|20|50|100|200>  categoryId=<id or ''>
    options={"all":true} (or the ticked revision types)
    wikidot_token7=<the wikidot_token7 cookie's value>

and puts the JSON answer's `body` (HTML) into `#site-changes-list`. Wikidot
accepts any token whose value matches the cookie sent with it.

Reads: the page itself (server HTML, 20 changes), and AJAX pages 1 and 2 at
200 per page; reports items per page, the pager, the flag letters seen, the
date range and the time each request took. Writes:

    debug/bb-recent-changes-raw.html      the page as the server sends it
    debug/bb-recent-changes-ajax-p1.json  AJAX page 1, perpage 200
    debug/bb-recent-changes-ajax-p2.json  AJAX page 2, perpage 200
    debug/bb-relations-raw.html           stats:relations as the server sends it

    python3 scripts/probe-bb-recent-changes.py
"""

import json
import os
import re
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://brucebase.wikidot.com'
TOKEN = 'saprobe'
UA = 'ShowAllEntityData-probe/1.0 (+https://github.com/vzell/mb-userscripts)'


def get(path):
    """GET one page; returns (text, seconds)."""
    t0 = time.time()
    req = urllib.request.Request(BASE + path, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read().decode('utf-8'), time.time() - t0


def ajax_page(page, perpage=200):
    """POST one SiteChangesListModule page; returns (json, seconds)."""
    body = urllib.parse.urlencode({
        'moduleName': 'changes/SiteChangesListModule',
        'page': page, 'perpage': perpage, 'categoryId': '',
        'options': json.dumps({'all': True}), 'wikidot_token7': TOKEN,
    }).encode()
    req = urllib.request.Request(BASE + '/ajax-module-connector.php', data=body, headers={
        'User-Agent': UA, 'Cookie': f'wikidot_token7={TOKEN}',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    })
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=60) as res:
        return json.loads(res.read().decode('utf-8')), time.time() - t0


def describe(label, html, secs):
    """Prints what one list of changes holds."""
    items = html.count('class="changes-list-item"')
    flags = sorted(set(re.findall(r'class="spantip" title="([^"]*)"[^>]*>([A-Z])<', html)), key=lambda f: f[1])
    dates = re.findall(r'class="odate time_(\d+)', html)
    pager = re.search(r'<span class="pager-no">([^<]*)</span>', html)
    span = ''
    if dates:
        lo, hi = min(map(int, dates)), max(map(int, dates))
        span = f'{time.strftime("%Y-%m-%d %H:%M", time.gmtime(lo))} .. {time.strftime("%Y-%m-%d %H:%M", time.gmtime(hi))} UTC'
    print(f'{label}: {items} items, pager "{pager.group(1) if pager else "-"}", {span}, {secs:.1f} s')
    for title, letter in flags:
        print(f'    flag {letter}: {title}')


def save(name, text):
    """Writes one file under debug/."""
    path = os.path.join(ROOT, 'debug', name)
    with open(path, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(text)
    print(f'    -> debug/{name} ({len(text)} chars)')


def main():
    """Reads the pages, prints what they hold, and saves them."""
    print('Env:', time.strftime('%Y-%m-%dT%H:%MZ', time.gmtime()), os.uname().nodename)
    html, secs = get('/system:recent-changes')
    describe('page (server HTML)', html, secs)
    save('bb-recent-changes-raw.html', html)
    for page in (1, 2):
        time.sleep(2)
        data, secs = ajax_page(page)
        if data.get('status') != 'ok':
            raise SystemExit(f'AJAX page {page}: status {data.get("status")!r}: {data.get("message")}')
        describe(f'AJAX page {page} (perpage 200)', data['body'], secs)
        save(f'bb-recent-changes-ajax-p{page}.json', json.dumps(data, ensure_ascii=False))
    time.sleep(2)
    html, secs = get('/stats:relations')
    print(f'stats:relations: {html.count("href=\"/relation:")} relation links, {secs:.1f} s')
    save('bb-relations-raw.html', html)


if __name__ == '__main__':
    main()
