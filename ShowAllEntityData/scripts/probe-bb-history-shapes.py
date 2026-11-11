#!/usr/bin/env python3
"""Probe the Wikidot history answers the History section's next round needs
(org/brucebase.org, "History round 2"): signed out, as the probe of
2026-11-11 found every history module answers so.

    python3 scripts/probe-bb-history-shapes.py [page] [out.json]

For one page (default song:streets-of-minneapolis) it asks:
  1. history/PageRevisionListModule with each revision type the site's own
     checkboxes send (rev-type-all/source/title/move/tags/meta/files →
     options {"all":true}, {"source":true}, …): how many rows, which flags,
     the pager;
  2. history/PageDiffModule for two pairs: the newest tags-only revision
     against the one before it, and the newest against a revision 15 back
     (an arbitrary pair, as the site's "Compare versions" allows): the
     `table.page-compare` rows (label → both cells), whether the inline diff
     reconstructs both sources exactly (text outside <ins> = the older
     source, outside <del> = the newer, checked against PageSourceModule),
     and the marks' counts.
Writes a JSON summary (default debug/bb-history-shapes-<date>.json) and
prints it. Members' names are not written (the list's are counted). 1.1 s
between requests, about 14 requests.
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
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://brucebase.wikidot.com'
UA = 'Mozilla/5.0 (probe; ShowAllEntityData)'
TOKEN = secrets.token_hex(4)
SPACING = 1.1
TYPES = ['all', 'source', 'title', 'move', 'tags', 'meta', 'files']


def get(url):
    """GET a page's text."""
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30) as r:
        return r.read().decode('utf-8')


def post(module, params):
    """POST a Wikidot module; returns (seconds, parsed JSON)."""
    body = urllib.parse.urlencode(dict(params, moduleName=module, wikidot_token7=TOKEN)).encode()
    req = urllib.request.Request(BASE + '/ajax-module-connector.php', data=body, headers={
        'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Cookie': f'wikidot_token7={TOKEN}'})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read().decode('utf-8'))
    dt = round(time.time() - t0, 3)
    time.sleep(SPACING)
    return dt, data


def rows_of(body):
    """The revision rows: (id, number, flags)."""
    out = []
    for rid, tr in re.findall(r'<tr id="revision-row-(\d+)">(.*?)</tr>', body, re.S):
        n = re.search(r'<td>(\d+)\.</td>', tr)
        flags = ''.join(re.findall(r'class="spantip"[^>]*>(\w)<', tr))
        out.append((rid, int(n.group(1)) if n else None, flags))
    return out


def text_of(fragment, drop):
    """The text of an inline diff with every <drop> element removed, lines at <br>."""
    s = re.sub(rf'<{drop}\b[^>]*>.*?</{drop}>', '', fragment, flags=re.S)
    s = re.sub(r'<br\s*/?>', '', s)
    s = re.sub(r'<[^>]+>', '', s)
    return htmlmod.unescape(s)


def lines(text):
    """Lines as _bbHistParseSource() makes them."""
    ls = text.replace('\r', '').split('\n')
    if ls and ls[0] == '':
        ls.pop(0)
    while ls and ls[-1].strip() == '':
        ls.pop()
    return ls


def source(rid):
    """A revision's source lines (PageSourceModule)."""
    _, d = post('history/PageSourceModule', {'revision_id': rid})
    m = re.search(r'<div class="page-source">(.*)</div>', d['body'], re.S)
    return lines(text_of(m.group(1), 'nothing')) if m else None


def compare(old, new):
    """PageDiffModule for (old, new) and what it holds."""
    dt, d = post('history/PageDiffModule', {'from_revision_id': old[0], 'to_revision_id': new[0], 'show_type': 'inline'})
    b = d.get('body', '')
    table = re.search(r'<table class="page-compare">(.*?)</table>', b, re.S)
    rows = []
    if table:
        for tr in re.findall(r'<tr>(.*?)</tr>', table.group(1), re.S):
            cells = [re.sub(r'\s+', ' ', htmlmod.unescape(re.sub(r'<[^>]+>', ' ', c))).strip()
                     for c in re.findall(r'<t[hd][^>]*>(.*?)</t[hd]>', tr, re.S)]
            rows.append(cells)
    inline = re.search(r'<div class="inline-diff page-source">(.*?)</div>\s*(?:</div>|$)', b, re.S)
    out = {'pair': f'rev {old[1]} ({old[2]}) vs rev {new[1]} ({new[2]})', 'seconds': dt, 'status': d.get('status'),
           'compareRows': rows, 'h3': re.findall(r'<h3>(.*?)</h3>', b), 'identicalNote': 'identical' in b.lower()}
    if inline:
        frag = inline.group(1)
        out['marks'] = {'ins': frag.count('<ins'), 'del': frag.count('<del')}
        old_rebuilt = lines(text_of(frag, 'ins'))
        new_rebuilt = lines(text_of(frag, 'del'))
        old_src = source(old[0])
        new_src = source(new[0])
        out['rebuildsOld'] = old_rebuilt == old_src
        out['rebuildsNew'] = new_rebuilt == new_src
        if not out['rebuildsOld'] or not out['rebuildsNew']:
            for name, a, b2 in (('old', old_rebuilt, old_src), ('new', new_rebuilt, new_src)):
                for i, (x, y) in enumerate(zip(a, b2 or [])):
                    if x != y:
                        out[f'firstMismatch_{name}'] = {'line': i + 1, 'rebuilt': x[:120], 'source': y[:120]}
                        break
                out[f'lines_{name}'] = [len(a), len(b2 or [])]
    else:
        out['inline'] = None
    return out


def main():
    page = sys.argv[1] if len(sys.argv) > 1 else 'song:streets-of-minneapolis'
    out_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'debug', f'bb-history-shapes-{datetime.now():%Y%m%d}.json')
    pid = re.search(r'WIKIREQUEST\.info\.pageId\s*=\s*(\d+)', get(f'{BASE}/{page}')).group(1)
    time.sleep(SPACING)
    res = {'page': page, 'at': datetime.now().astimezone().isoformat(timespec='seconds'), 'types': {}, 'compare': []}
    lists = {}
    for t in TYPES:
        dt, d = post('history/PageRevisionListModule', {'page_id': pid, 'page': '1', 'perpage': '100', 'options': json.dumps({t: True})})
        rs = rows_of(d.get('body', ''))
        lists[t] = rs
        pager = re.search(r'<span class="pager-no">(.*?)</span>', d.get('body', ''))
        res['types'][t] = {'seconds': dt, 'status': d.get('status'), 'rows': len(rs),
                           'flags': ''.join(sorted(set(''.join(f for _, _, f in rs)))),
                           'numbers': [n for _, n, _ in rs][:12], 'pager': pager.group(1) if pager else None}
    allrows = lists['all']
    tags_only = next((r for r in allrows if r[2] == 'A'), None)
    if tags_only:
        i = allrows.index(tags_only)
        if i + 1 < len(allrows):
            res['compare'].append(compare(allrows[i + 1], tags_only))
    if len(allrows) > 15:
        res['compare'].append(compare(allrows[15], allrows[0]))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(res, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(json.dumps(res, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
