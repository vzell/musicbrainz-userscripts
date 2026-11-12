#!/usr/bin/env python3
"""Captures the Wikidot ListPages answers the Phase 11 specs replay
(org/brucebase.org, tag pages), signed out, 1 s apart, into
tests/fixtures/bb-tags/ — with the userscript's own template
(`_BB_LP_TEMPLATE`, read from ShowAllEntityData.user.js so the two cannot
drift apart). Page titles and tags only: ListPages is never asked for who
made or edited a page.

    lp-storyteller-p1.json     tag storyteller, title order, 30 a page, page 1
    lp-storyteller-p2.json     the same, page 2
    lp-storyteller-card.json   tag storyteller, newest first, 6 (the card)
    lp-wiki-p1.json            every page, by name, 30 a page, page 1
    lp-wiki-p2.json            the same, page 2
    total-content.json         tag content, %%total%% (the cloud's biggest)
    total-wiki.json            every page, %%total%%

    python3 scripts/capture-bb-tag-answers.py
"""

import json
import os
import re
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tests', 'fixtures', 'bb-tags')
BASE = 'https://brucebase.wikidot.com'
TOKEN = 'saprobe'
UA = 'ShowAllEntityData-probe/1.0 (+https://github.com/vzell/mb-userscripts)'
_last = [0.0]


def template():
    """`_BB_LP_TEMPLATE` as the userscript builds it."""
    with open(os.path.join(ROOT, 'ShowAllEntityData.user.js'), encoding='utf-8') as f:
        src = f.read()
    m = re.search(r"const _BB_LP_TEMPLATE = \[(.*?)\]\.join\(_BB_LP_SEP\) \+ _BB_LP_END;", src, re.S)
    if not m:
        raise SystemExit('_BB_LP_TEMPLATE not found in the userscript')
    fields = re.findall(r"'([^']*)'", m.group(1))
    return '␂'.join(fields) + '␃'


def post(params):
    """One ListPages call, 1 s after the previous one; the JSON answer."""
    wait = 1.0 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    body = urllib.parse.urlencode({**params, 'moduleName': 'list/ListPagesModule', 'wikidot_token7': TOKEN}).encode()
    req = urllib.request.Request(BASE + '/ajax-module-connector.php', data=body, headers={
        'User-Agent': UA, 'Cookie': f'wikidot_token7={TOKEN}',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    })
    with urllib.request.urlopen(req, timeout=90) as res:
        js = json.loads(res.read().decode('utf-8'))
    _last[0] = time.time()
    if js.get('status') != 'ok':
        raise SystemExit(f'{params}: {js.get("status")} {js.get("message")}')
    return js


def main():
    """Captures every answer."""
    os.makedirs(OUT, exist_ok=True)
    tpl = template()
    base = {'category': '*', 'separate': 'false'}
    calls = {
        'lp-storyteller-p1': {**base, 'tags': 'storyteller', 'perPage': 30, 'order': 'titleAsc', 'module_body': tpl, 'p': 1},
        'lp-storyteller-p2': {**base, 'tags': 'storyteller', 'perPage': 30, 'order': 'titleAsc', 'module_body': tpl, 'p': 2},
        'lp-storyteller-card': {**base, 'tags': 'storyteller', 'perPage': 6, 'order': 'created_at desc', 'module_body': tpl, 'p': 1},
        'lp-wiki-p1': {**base, 'perPage': 30, 'order': 'fullname', 'module_body': tpl, 'p': 1},
        'lp-wiki-p2': {**base, 'perPage': 30, 'order': 'fullname', 'module_body': tpl, 'p': 2},
        'total-content': {**base, 'tags': 'content', 'perPage': 1, 'order': 'titleAsc', 'module_body': '%%total%%', 'p': 1},
        'total-wiki': {**base, 'perPage': 1, 'order': 'fullname', 'module_body': '%%total%%', 'p': 1},
    }
    print(f'capture started {time.strftime("%Y-%m-%dT%H:%M:%S%z")}')
    for name, params in calls.items():
        js = post(params)
        with open(os.path.join(OUT, f'{name}.json'), 'w', encoding='utf-8', newline='\n') as f:
            json.dump({'status': js['status'], 'body': js['body']}, f, ensure_ascii=False)
        print(f'{name}: {len(js["body"]):,} bytes, {js["body"].count(chr(0x2403))} items')


if __name__ == '__main__':
    main()
