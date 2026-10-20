"""Probe for the editing-history window of the MusicBrainz entity popup
(org/mb-edit-history.org): what does an entity's "Editing history" page
(/<entity>/<mbid>/edits) show to a client that is NOT logged in, how is it
paged, and which entity kinds have one?

The window reads that HTML page because the Web Service has no edits at all
(https://musicbrainz.org/doc/MusicBrainz_API lists no edit resource; checked
2026-10-20). The page is fetched through the one MusicBrainz rate gate
(https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting: one request a
second; the probe keeps 1.1 s, as `_relAwaitRateSlot()` does).

The debug snapshots (debug/edits-*.html) were saved logged in. This probe
asks the same pages logged out, since a user who is not logged in gets that
version in the popup too:

  1. editor shown or hidden, notes shown or hidden, vote/expiration text;
  2. "Found N edits", edits per page, the pagination links (?page=N);
  3. page 2 of the release group (the shape "Load more" appends);
  4. /url/<mbid>/edits, /collection/<mbid>/edits (the kinds that get the
     button), and an /edits page with no edits at all (status + text).

usage: python3 scripts/probe-mb-entity-edits.py [--save DIR]
       (about 8 requests, 10 s). --save writes each page's HTML to DIR.
       python3 scripts/probe-mb-entity-edits.py --from DIR
       reports on pages already saved in DIR (<label>.html), no request.

A plain HTTP client gets MusicBrainz's "Verifying your browser" proof-of-work
page (1394 bytes, `/__meb_verify`) for most of these paths since 2026-10-01
(DEBUG-NOTES.md); the report says so instead of reading nothing. Save the
pages with a real Chromium instead and report with --from:
    node scripts/fetch-mb-page-fixture.js [--auth] <path> DIR/<label>.html
"""
import argparse
import html
import os
import re
import time
import urllib.error
import urllib.request

UA = 'ShowAllEntityData-edit-history-probe/1.0 ( info@volkerzell.de )'
SITE = 'https://musicbrainz.org'
SPACING_S = 1.1

PAGES = [
    ('recording', '/recording/de571208-2c6d-4dc6-9efa-c16405c904f9/edits'),       # She's a Runaway (BoDeans)
    ('release', '/release/9d451257-ebce-44ec-aad8-b48609bfaf7a/edits'),           # Love & Hope & Sex & Dreams
    ('release-group', '/release-group/f3528c02-dfa0-3b65-b12d-c252a6290770/edits'),  # Secret Garden
    ('release-group-p2', '/release-group/f3528c02-dfa0-3b65-b12d-c252a6290770/edits?page=2'),
    ('url', '/url/7c36bf3a-15d4-4b1f-afaa-40847960e3e0/edits'),                   # debug/URL-*.html's "[info]"
    ('collection', '/collection/60df131d-bdb7-3c83-840d-e31e566baabe/edits'),     # vzell's "Attending"
    ('artist-bruce', '/artist/70248960-cb53-4ea4-943a-edb18f7d336f/edits'),       # a very long history
    ('instrument', '/instrument/63021302-86cd-4aee-80df-2270d54f4978/edits'),     # guitar
]

_last = [0.0]


def get(path):
    """GET a page 1.1 s after the previous request. Returns (status, text, ms)."""
    wait = _last[0] + SPACING_S - time.time()
    if wait > 0:
        time.sleep(wait)
    _last[0] = time.time()
    req = urllib.request.Request(SITE + path, headers={'User-Agent': UA})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read().decode('utf-8', 'replace')
            return r.status, body, int((time.time() - t0) * 1000)
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', 'replace')
        return e.code, body, int((time.time() - t0) * 1000)


def text(s):
    """Tag-stripped, whitespace-collapsed text of an HTML fragment."""
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()


def report(label, path, status, body, ms):
    """Prints what the window depends on for one page."""
    print(f'\n== {label}: {path}\n   HTTP {status}, {len(body)} bytes, {ms} ms')
    if '/__meb_verify' in body:
        print('   BOT CHECK: "Verifying your browser" page, not the edits (use --from)')
        return
    if status != 200:
        h1 = re.search(r'<h1[^>]*>(.*?)</h1>', body, re.S)
        print(f'   h1: {text(h1.group(1)) if h1 else "-"}')
        return
    found = re.search(r'class="search-toggle[^"]*"[^>]*>(.*?)</div>', body, re.S)
    print(f'   search-toggle: {text(found.group(1)) if found else "(none)"}')
    headers = re.findall(r'<div class="edit-header ([^"]*)"', body)
    print(f'   edit-header blocks: {len(headers)}')
    statuses = {}
    for cls in headers:
        tok = cls.split()[0] if cls.split() else ''
        statuses[tok] = statuses.get(tok, 0) + 1
    print(f'   status tokens: {statuses}')
    pages = sorted({int(n) for n in re.findall(r'[?&]page=(\d+)', body)})
    print(f'   page links: {pages[:3]}{"…" if len(pages) > 3 else ""}{pages[-1:] if len(pages) > 3 else ""}')
    subs = re.findall(r'<p class="subheader">(.*?)</p>', body, re.S)
    edit_by = [text(s) for s in subs if 'Edit by' in s][:3]
    print(f'   "Edit by" subheaders (first 3): {edit_by}')
    print(f'   "Editor hidden" occurrences: {body.count("Editor hidden")}')
    user_links = len(re.findall(r'href="/user/', body))
    real_notes = len(re.findall(r'<div class="edit-note" id=', body))
    print(f'   user links: {user_links}')
    print(f'   div.edit-note (real notes): {real_notes}')
    hidden = re.search(r'[^.<>]*logged in to see edit notes[^.<>]*', body)
    print(f'   notes-hidden text: {text(hidden.group(0)) if hidden else "(none)"}')
    votes = re.findall(r'class="vote-count">(.*?)</td>', body, re.S)[:3]
    print(f'   vote-count (first 3): {[text(v) for v in votes]}')
    exp = re.findall(r'class="edit-expiration"[^>]*>(.*?)</td>', body, re.S)[:3]
    print(f'   edit-expiration (first 3): {[text(v) for v in exp]}')
    myvote = re.findall(r'class="my-vote">(.*?)</div>', body, re.S)[:2]
    print(f'   my-vote (first 2): {[text(v) for v in myvote]}')
    if not headers:
        content = re.search(r'<div id="content"[^>]*>(.*?)<div id="footer"', body, re.S)
        print(f'   content text: {text(content.group(1))[:300] if content else "-"}')


def main():
    """Runs every page in PAGES and prints the report."""
    ap = argparse.ArgumentParser()
    ap.add_argument('--save', help='directory to write each page into')
    ap.add_argument('--from', dest='src', help='directory of saved pages to report on instead')
    args = ap.parse_args()
    if args.save:
        os.makedirs(args.save, exist_ok=True)
    if args.src:
        for name in sorted(os.listdir(args.src)):
            if name.endswith('.html'):
                with open(os.path.join(args.src, name), encoding='utf-8') as f:
                    report(name[:-5], os.path.join(args.src, name), 200, f.read(), 0)
        return
    for label, path in PAGES:
        status, body, ms = get(path)
        report(label, path, status, body, ms)
        if args.save:
            with open(os.path.join(args.save, f'{label}.html'), 'w', encoding='utf-8') as f:
                f.write(body)


if __name__ == '__main__':
    main()
