#!/usr/bin/env python3
"""Build the Brucebase page-history fixtures (org/brucebase.org, Phase 6).

    python3 scripts/build-bb-history-fixtures.py

What it writes, for one page (song:the-promise, whose page fixture
tests/fixtures/bb-song-the-promise.html already exists):

  tests/fixtures/bb-history-song-the-promise.html
      the page fixture with the one line of Wikidot's page script the history
      needs put back (`WIKIREQUEST.info.pageId = N;`, with the two lines that
      declare WIKIREQUEST before it, as the real page has them) — the page
      fixtures drop every script (scripts/build-bb-event-fixtures.py);
  tests/fixtures/bb-history/list-p1.json, list-p2.json
      history/PageRevisionListModule, 20 a page, pages 1 and 2;
  tests/fixtures/bb-history/source-<revision id>.json
      history/PageSourceModule for the newest six revisions (47–42: four
      that change lines, two that change only tags).

The answers are Wikidot's own JSON, asked as the probe found works signed
out (debug/bb-history-probe-20261111-out.json: every module "ok", the same
bodies as signed in): POST /ajax-module-connector.php with a wikidot_token7
cookie and the same value in the body. Scrubbed before saving: every member
becomes "Editor N" (in order of first appearance), their profile links
user:info/editor-n, their numeric ids 0, avatars dropped. Comments and the
page's source are the wiki's public text and stay. 1.1 s between requests,
nine requests.
"""

import json
import os
import re
import secrets
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = os.path.join(ROOT, 'tests', 'fixtures')
OUT_DIR = os.path.join(FIX, 'bb-history')
PAGE = 'song:the-promise'
BASE = 'https://brucebase.wikidot.com'
PAGE_FIXTURE = os.path.join(FIX, 'bb-song-the-promise.html')
OUT_PAGE = os.path.join(FIX, 'bb-history-song-the-promise.html')
SPACING = 1.1
UA = 'Mozilla/5.0 (fixture builder; ShowAllEntityData tests)'
TOKEN = secrets.token_hex(4)


def get(url):
    """GET a page; returns its text."""
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8')


def post(module, params):
    """POST one Wikidot module; returns the parsed JSON answer."""
    body = dict(params, moduleName=module, wikidot_token7=TOKEN)
    req = urllib.request.Request(
        BASE + '/ajax-module-connector.php',
        data=urllib.parse.urlencode(body).encode(),
        headers={
            'User-Agent': UA,
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Cookie': f'wikidot_token7={TOKEN}',
        })
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read().decode('utf-8'))
    time.sleep(SPACING)
    if data.get('status') != 'ok':
        sys.exit(f'{module}: Wikidot answered {data.get("status")!r}: {data.get("message")}')
    return data


class Scrub:
    """Replaces members by "Editor N", consistently across every answer."""

    def __init__(self):
        self.names = {}

    def name(self, n):
        """The placeholder of member `n`."""
        if n not in self.names:
            self.names[n] = f'Editor {len(self.names) + 1}'
        return self.names[n]

    def html(self, s):
        """Scrubs one body."""
        def printuser(m):
            inner = m.group(0)
            texts = [t for t in re.findall(r'>([^<>]+)</a>', inner) if t.strip()]
            who = self.name(texts[-1].strip()) if texts else 'Editor ?'
            slug = who.lower().replace(' ', '-')
            return (f'<span class="printuser"><a href="https://www.wikidot.com/user:info/{slug}" '
                    f'onclick="WIKIDOT.page.listeners.userInfo(0); return false;">{who}</a></span>')
        s = re.sub(r'<span class="printuser[^"]*">.*?</span>(?:\s*</a>)?', printuser, s, flags=re.S)
        s = re.sub(r'userInfo\(\d+\)', 'userInfo(0)', s)
        return s

    def answer(self, data):
        """Scrubs a whole JSON answer (its body)."""
        out = dict(data)
        if isinstance(out.get('body'), str):
            out['body'] = self.html(out['body'])
        out.pop('CURRENT_TIMESTAMP', None)
        out.pop('callbackIndex', None)
        return out


def save(path, data):
    """Writes JSON, two-space indented, newline at the end."""
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print('wrote', os.path.relpath(path, ROOT), os.path.getsize(path), 'bytes')


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    live = get(f'{BASE}/{PAGE}')
    m = re.search(r'WIKIREQUEST\.info\.pageId\s*=\s*(\d+)', live)
    if not m:
        sys.exit('no WIKIREQUEST.info.pageId on the live page')
    page_id = m.group(1)
    time.sleep(SPACING)

    with open(PAGE_FIXTURE, encoding='utf-8') as f:
        page = f.read()
    script = ('<script type="text/javascript">var WIKIREQUEST = {}; WIKIREQUEST.info = {}; '
              f'WIKIREQUEST.info.pageId = {page_id};</script>\n')
    note = ('<!-- Built by scripts/build-bb-history-fixtures.py: bb-song-the-promise.html with the '
            "page id line of Wikidot's page script put back; do not edit by hand. -->\n")
    page = page.replace('</head>', script + '</head>', 1)
    with open(OUT_PAGE, 'w', encoding='utf-8') as f:
        f.write(note + page)
    print('wrote', os.path.relpath(OUT_PAGE, ROOT))

    scrub = Scrub()
    opts = json.dumps({'all': True})
    lists = []
    for p in (1, 2):
        data = post('history/PageRevisionListModule', {'page_id': page_id, 'page': str(p), 'perpage': '20', 'options': opts})
        lists.append(data['body'])
        save(os.path.join(OUT_DIR, f'list-p{p}.json'), scrub.answer(data))
    ids = []
    for v in re.findall(r'name="from" value="(\d+)"', lists[0]):
        if v not in ids:
            ids.append(v)
    for rid in ids[:6]:
        data = post('history/PageSourceModule', {'revision_id': rid})
        save(os.path.join(OUT_DIR, f'source-{rid}.json'), scrub.answer(data))
    print('page id', page_id, '· revisions on page 1:', len(ids), '· members:', len(scrub.names))


if __name__ == '__main__':
    main()
