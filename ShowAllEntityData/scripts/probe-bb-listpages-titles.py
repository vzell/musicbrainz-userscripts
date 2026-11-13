#!/usr/bin/env python3
"""Checks whether Wikidot's ListPages module, asked over AJAX with a plain
template (Phase 11 of org/brucebase.org), returns page titles exactly as the
tag page lists them, or mangles them as wiki text (a title holding "//" or
"**" or "--" would turn into italics, bold, a dash).

Reads debug/bb-tag-content-raw.html (scripts/probe-bb-tag-pages.py) for
every page's title as the tag page writes it, then POSTs ListPages for tag
"content", 250 a page, title order, pages 1–3, with three templates:

    plain   %%fullname%%␂%%title%%␃
    linked  %%fullname%%␂%%title_linked%%␃
    raw     %%fullname%%␂@@%%title%%@@␃

and reports, per template, how many titles differ and the first few.
1 s between calls.

    python3 scripts/probe-bb-listpages-titles.py
"""

import html
import os
import re
import time
import urllib.parse
import urllib.request
import json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://brucebase.wikidot.com'
TOKEN = 'saprobe'
UA = 'ShowAllEntityData-probe/1.0 (+https://github.com/vzell/mb-userscripts)'
SEP, END = '␂', '␃'
_last = [0.0]


def post(params):
    """One module call, 1 s after the previous one; the answer's body."""
    wait = 1.0 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    body = urllib.parse.urlencode({**params, 'wikidot_token7': TOKEN}).encode()
    req = urllib.request.Request(BASE + '/ajax-module-connector.php', data=body, headers={
        'User-Agent': UA, 'Cookie': f'wikidot_token7={TOKEN}',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    })
    with urllib.request.urlopen(req, timeout=90) as res:
        js = json.loads(res.read().decode('utf-8'))
    _last[0] = time.time()
    return js.get('body') or ''


def text_of(fragment):
    """An HTML fragment's text."""
    return html.unescape(re.sub(r'<[^>]+>', '', fragment))


def main():
    """Compares the three templates against the tag page."""
    with open(os.path.join(ROOT, 'debug', 'bb-tag-content-raw.html'), encoding='utf-8') as f:
        page = f.read()
    truth = {h.lstrip('/'): html.unescape(t) for h, t in re.findall(
        r'<div class="pages-list-item">\s*<div class="title">\s*<a href="([^"]+)">(.*?)</a>', page)}
    odd = [t for t in truth.values() if re.search(r'//|\*\*|--|__|\^\^|,,|\{\{|\[\[|@@|##', t)]
    print(f'tag page: {len(truth)} titles; {len(odd)} hold wiki markup characters, e.g. {odd[:6]}')
    templates = {
        'plain': f'%%fullname%%{SEP}%%title%%{END}',
        'linked': f'%%fullname%%{SEP}%%title_linked%%{END}',
        'raw': f'%%fullname%%{SEP}@@%%title%%@@{END}',
    }
    for name, tpl in templates.items():
        diffs, n = [], 0
        for p in (1, 2, 3):
            body = post({'moduleName': 'list/ListPagesModule', 'tags': 'content', 'category': '*', 'perPage': 250,
                         'order': 'titleAsc', 'separate': 'false', 'module_body': tpl, 'p': p})
            for chunk in body.split(END):
                parts = chunk.split(SEP)
                if len(parts) != 2:
                    continue
                full = text_of(parts[0]).strip()
                title = text_of(parts[1]).strip()
                if not full or full not in truth:
                    continue
                n += 1
                if title != truth[full].strip():
                    diffs.append((full, truth[full], title))
        print(f'{name}: {n} compared, {len(diffs)} differ')
        for d in diffs[:6]:
            print(f'    {d[0]}: tag page {d[1]!r} → ListPages {d[2]!r}')
    print(f'example raw body: {post({"moduleName": "list/ListPagesModule", "tags": "content", "category": "*", "perPage": 2, "order": "titleAsc", "separate": "false", "module_body": templates["linked"], "p": 1})[:400]}')


if __name__ == '__main__':
    main()
