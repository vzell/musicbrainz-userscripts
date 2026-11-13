#!/usr/bin/env python3
"""Does Wikidot's history module accept a made-up token with no session?

org/brucebase.org, Phase 15 (History in Brucebase windows on other sites).
Server side only: what the browser probe scripts/probe-bb-history-xorigin.user.js
then checks is whether Tampermonkey DELIVERS the cookie on an anonymous
request. Here, with no cookie jar and no session at all:

  0. GET  /<page>                                   for the page id
  1. POST history/PageRevisionListModule, Cookie = body token (fresh, random)
  2. POST the same, no cookie                       (control)
  3. POST the same, cookie != body token            (control)

1.1 s apart. Prints per request: HTTP status, ms, JSON status, Wikidot's
message, accepted (status "ok" with a body), revision row count. No names,
no ids, no page text.

usage: python3 scripts/probe-bb-history-token.py [/page:path]
"""

import json
import re
import secrets
import sys
import time
import urllib.parse
import urllib.request

BASE = 'https://brucebase.wikidot.com'
UA = 'ShowAllEntityData-probe/1.0 (+https://github.com/vzell/mb-userscripts)'
PAGE = sys.argv[1] if len(sys.argv) > 1 else '/song:streets-of-minneapolis'


def timed(req):
    """Sends a request; returns (status, ms, text)."""
    t0 = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            text = res.read().decode('utf-8', 'replace')
            status = res.status
    except urllib.error.HTTPError as e:
        text = e.read().decode('utf-8', 'replace')
        status = e.code
    return status, round((time.monotonic() - t0) * 1000), text


def post(page_id, body_token, cookie_token):
    """One revision-list POST; cookie_token None sends no cookie."""
    headers = {'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'}
    if cookie_token is not None:
        headers['Cookie'] = f'wikidot_token7={cookie_token}'
    data = urllib.parse.urlencode({
        'page_id': page_id, 'page': '1', 'perpage': '20', 'options': json.dumps({'all': True}),
        'moduleName': 'history/PageRevisionListModule', 'wikidot_token7': body_token,
    }).encode()
    return timed(urllib.request.Request(BASE + '/ajax-module-connector.php', data=data, headers=headers))


def describe(variant, status, ms, text):
    """One line of the report."""
    out = {'variant': variant, 'http': status, 'ms': ms, 'bytes': len(text)}
    try:
        data = json.loads(text)
    except ValueError:
        out['json'] = False
        out['accepted'] = False
        return out
    out['status'] = data.get('status')
    if data.get('message'):
        out['message'] = re.sub(r'\d{6,}', 'digits', ' '.join(str(data['message']).split()))[:160]
    out['accepted'] = data.get('status') == 'ok' and isinstance(data.get('body'), str)
    if out['accepted']:
        out['revisionRows'] = len(re.findall(r'id="revision-row-\d+"', data['body']))
    return out


def main():
    """Runs the four requests and prints one JSON line each."""
    status, ms, html = timed(urllib.request.Request(BASE + PAGE, headers={'User-Agent': UA}))
    m = re.search(r'WIKIREQUEST\.info\.pageId\s*=\s*(\d+)', html)
    print(json.dumps({'variant': 'page', 'page': PAGE, 'http': status, 'ms': ms, 'pageId': 'digits' if m else None}))
    if not m:
        return 1
    pid = m.group(1)
    for variant, cookie in (('cookie = body', 'same'), ('no cookie', None), ('cookie != body', 'other')):
        time.sleep(1.1)
        token = secrets.token_hex(4)
        c = token if cookie == 'same' else (secrets.token_hex(4) if cookie == 'other' else None)
        print(json.dumps(describe(variant, *post(pid, token, c)), ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
