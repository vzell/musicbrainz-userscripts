#!/usr/bin/env python3
"""Fetch the real data the History round-2 mockups show (org/brucebase.org).

    python3 scripts/fetch-bb-history-mockup-data.py [page] [out.json]

For one page (default song:streets-of-minneapolis), signed out: the whole
revision list (history/PageRevisionListModule, 100 a page, as the mockups
propose) — number, flags, epoch, member, comment — and the sources of two
revision pairs (PageSourceModule): the newest against the revision 15 back
(an arbitrary pair) and the newest tags-only revision against the one before
it, plus PageDiffModule's compare table for both pairs. Writes JSON (default
debug/bb-history-mockup-data.json), gitignored: the members are the wiki's
public user names, kept out of the repository. 1.1 s between requests.
"""

import html as htmlmod
import json
import os
import re
import secrets
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://brucebase.wikidot.com'
UA = 'Mozilla/5.0 (mockup data; ShowAllEntityData)'
TOKEN = secrets.token_hex(4)


def get(url):
    """GET a page's text."""
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30) as r:
        return r.read().decode('utf-8')


def post(module, params):
    """POST a Wikidot module; returns its body."""
    body = urllib.parse.urlencode(dict(params, moduleName=module, wikidot_token7=TOKEN)).encode()
    req = urllib.request.Request(BASE + '/ajax-module-connector.php', data=body, headers={
        'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Cookie': f'wikidot_token7={TOKEN}'})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read().decode('utf-8'))
    time.sleep(1.1)
    return data.get('body', '')


def text(s):
    """Plain text of an HTML fragment."""
    return re.sub(r'\s+', ' ', htmlmod.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()


def source(rid):
    """A revision's source as lines (as _bbHistParseSource())."""
    b = post('history/PageSourceModule', {'revision_id': rid})
    m = re.search(r'<div class="page-source">(.*)</div>', b, re.S)
    t = htmlmod.unescape(re.sub(r'<[^>]+>', '', re.sub(r'<br\s*/?>', '', m.group(1))))
    ls = t.replace('\r', '').split('\n')
    if ls and ls[0] == '':
        ls.pop(0)
    while ls and ls[-1].strip() == '':
        ls.pop()
    return ls


def compare(a, b):
    """PageDiffModule's compare table rows for (older, newer)."""
    body = post('history/PageDiffModule', {'from_revision_id': a, 'to_revision_id': b, 'show_type': 'inline'})
    t = re.search(r'<table class="page-compare">(.*?)</table>', body, re.S)
    return [[text(c) for c in re.findall(r'<t[hd][^>]*>(.*?)</t[hd]>', tr, re.S)]
            for tr in re.findall(r'<tr>(.*?)</tr>', t.group(1), re.S)] if t else []


def main():
    page = sys.argv[1] if len(sys.argv) > 1 else 'song:streets-of-minneapolis'
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'debug', 'bb-history-mockup-data.json')
    pid = re.search(r'WIKIREQUEST\.info\.pageId\s*=\s*(\d+)', get(f'{BASE}/{page}')).group(1)
    time.sleep(1.1)
    body = post('history/PageRevisionListModule', {'page_id': pid, 'page': '1', 'perpage': '100', 'options': json.dumps({'all': True})})
    revs = []
    for rid, tr in re.findall(r'<tr id="revision-row-(\d+)">(.*?)</tr>', body, re.S):
        tds = re.findall(r'<td[^>]*>(.*?)(?=<td|$)', tr, re.S)
        at = re.search(r'time_(\d+)', tr)
        user = re.findall(r'<span class="printuser[^"]*">.*?<a [^>]*>([^<]+)</a>', tr, re.S)
        revs.append({'id': rid, 'n': int(re.search(r'<td>(\d+)\.</td>', tr).group(1)),
                     'flags': ''.join(re.findall(r'class="spantip"[^>]*>(\w)<', tr)),
                     'at': int(at.group(1)) if at else 0, 'user': user[-1].strip() if user else '',
                     'comment': text(tds[-1]) if tds else ''})
    by_n = {r['n']: r for r in revs}
    newest = revs[0]
    back = by_n.get(newest['n'] - 15)
    tags_only = next(r for r in revs if r['flags'] == 'A')
    before = by_n[tags_only['n'] - 1]
    data = {'page': page, 'revs': revs, 'pairs': {
        'far': {'old': back['n'], 'new': newest['n'], 'compare': compare(back['id'], newest['id']),
                'oldLines': source(back['id']), 'newLines': source(newest['id'])},
        'tags': {'old': before['n'], 'new': tags_only['n'], 'compare': compare(before['id'], tags_only['id'])},
    }}
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print('wrote', out, len(revs), 'revisions')


if __name__ == '__main__':
    main()
