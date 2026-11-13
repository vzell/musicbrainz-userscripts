#!/usr/bin/env python3
"""Checks the two ListPages orders Phase 11 uses (org/brucebase.org), signed
out, 1 s apart: "created_at desc" (a tag link's card: the newest pages) and
"fullname" (every page of the wiki, by category then name), plus a whole-wiki
%%total%%. Prints the first items of each answer.

    python3 scripts/probe-bb-listpages-order.py
"""

import json
import re
import time
import urllib.parse
import urllib.request

BASE = 'https://brucebase.wikidot.com'
TOKEN = 'saprobe'
UA = 'ShowAllEntityData-probe/1.0 (+https://github.com/vzell/mb-userscripts)'
_last = [0.0]


def post(params):
    """One module call, 1 s after the previous one; (body, seconds)."""
    wait = 1.0 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    body = urllib.parse.urlencode({**params, 'moduleName': 'list/ListPagesModule', 'wikidot_token7': TOKEN}).encode()
    req = urllib.request.Request(BASE + '/ajax-module-connector.php', data=body, headers={
        'User-Agent': UA, 'Cookie': f'wikidot_token7={TOKEN}',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    })
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=90) as res:
        js = json.loads(res.read().decode('utf-8'))
    _last[0] = time.time()
    return js.get('body') or '', _last[0] - t0


def show(label, body, secs):
    """Prints the items' text."""
    text = re.sub(r'<span class="odate time_(\d+)[^>]*>[^<]*</span>', r'@\1', body)
    text = re.sub(r'<[^>]+>', '', text)
    items = [x.strip() for x in text.split('␃') if '␂' in x]
    pager = re.search(r'page 1 of (\d+)', body)
    print(f'{label}: {len(items)} items, {secs:.1f} s, pages {pager.group(1) if pager else "-"}')
    for it in items:
        print('    ' + it.replace('␂', ' | ')[:200])


def main():
    """Runs the three calls."""
    tpl = '%%fullname%%␂@@%%title%%@@␂%%created_at%%␂%%total%%␃'
    show('storyteller, created_at desc', *post({'tags': 'storyteller', 'category': '*', 'perPage': 4, 'order': 'created_at desc',
                                                'separate': 'false', 'module_body': tpl, 'p': 1}))
    show('whole wiki, fullname', *post({'category': '*', 'perPage': 4, 'order': 'fullname', 'separate': 'false',
                                        'module_body': tpl, 'p': 1}))
    show('whole wiki, fullname, p 2', *post({'category': '*', 'perPage': 4, 'order': 'fullname', 'separate': 'false',
                                             'module_body': tpl, 'p': 2}))
    show('tag "&"', *post({'tags': '&', 'category': '*', 'perPage': 2, 'order': 'titleAsc', 'separate': 'false',
                           'module_body': tpl, 'p': 1}))


if __name__ == '__main__':
    main()
