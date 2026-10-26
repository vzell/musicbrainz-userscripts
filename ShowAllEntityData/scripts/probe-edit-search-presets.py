#!/usr/bin/env python3
"""Probe the entity-history presets' edit searches against musicbrainz.org.

The presets (`_mbHistPresets()` in ShowAllEntityData.user.js, 2026-10-26) are
edit searches built on an entity's own "Refine this search" link, as jesus2099's
SUPER MIND CONTROL II X TURBO's COOL_SEARCH_LINKS builds them. This reads that
link from the entity's /edits page, builds the presets that need no session
(the `me` / `not_me` / `voter` ones need a logged-in browser), asks each one,
and prints whether MusicBrainz ran it ("Found N edits") or refused it.

It also asks the two forms whose validity rests on SMC alone: `editor me` while
logged out (expected: refused or empty, never an error page), and the negated
relationship form.

Not run in the session that wrote it: that environment's network policy blocks
musicbrainz.org (2026-10-26). Record the result next to `_mbHistPresets()` when
it is run.

Rate: one request every 1.1 s (https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting).
A browser-check page (`/__meb_verify`) is reported as such: the website, unlike
WS/2, may ask a script to prove it is a browser.

Usage: python3 scripts/probe-edit-search-presets.py [<kind>/<mbid>]
       (default: recording/de571208-2c6d-4dc6-9efa-c16405c904f9)
"""
import html
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = 'https://musicbrainz.org'
UA = 'ShowAllEntityData-probe/1.0 ( https://github.com/vzell/mb-userscripts )'
REL_TYPES = [90, 233, 91, 234, 92, 235, 99]


def get(path):
    """Fetch one page, politely.

    @param {str} path - same-site path with query
    @returns {tuple} (status, html text)
    """
    time.sleep(1.1)
    req = urllib.request.Request(ROOT + path, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')


def refine_of(page):
    """The page's "Refine this search" query, form_only dropped.

    @param {str} page - an /edits page
    @returns {list} the query as (name, value) pairs, or [] when absent
    """
    for href in re.findall(r'href="([^"]*/search/edits\?[^"]*)"', page):
        q = urllib.parse.parse_qsl(urllib.parse.urlsplit(html.unescape(href)).query, keep_blank_values=True)
        if any(k == 'conditions.0.field' for k, _ in q):
            return [(k, v) for k, v in q if k not in ('form_only', 'page')]
    return []


def add(base, conds, negate=False):
    """`base` with more conditions, numbered after its own.

    @param {list} base - (name, value) pairs
    @param {list} conds - dicts: field, op, args, arg0
    @param {bool} negate - jesus2099's NOT (any fails) form
    @returns {str} the query string
    """
    q = list(base)
    n = 1 + max(int(m.group(1)) for k, _ in q for m in [re.match(r'conditions\.(\d+)\.', k)] if m)
    for c in conds:
        q += [(f'conditions.{n}.field', c['field']), (f'conditions.{n}.operator', c['op'])]
        if 'arg0' in c:
            q.append((f'conditions.{n}.args.0', c['arg0']))
        q += [(f'conditions.{n}.args', str(a)) for a in c.get('args', [])]
        n += 1
    if negate:
        q = [(k, 'or' if k == 'combinator' else '1' if k == 'negation'
              else '!=' if re.fullmatch(r'conditions\.\d+\.operator', k) and v == '=' else v) for k, v in q]
    return urllib.parse.urlencode(q)


def verdict(status, page):
    """What MusicBrainz made of a search.

    @param {int} status - HTTP status
    @param {str} page - the answer
    @returns {str}
    """
    if '/__meb_verify' in page[:4096]:
        return 'BROWSER CHECK (rerun from a browser session)'
    m = re.search(r'Found (at least )?([\d,.]+) edits?', page)
    if m:
        return f'ran: {m.group(0)}'
    if re.search(r'No edits found|0 edits', page):
        return 'ran: no edits'
    err = re.search(r'class="error"[^>]*>(.*?)<', page, re.S)
    return f'HTTP {status}, not run' + (f': {err.group(1).strip()}' if err else '')


def main():
    """Read the base, then ask every preset that needs no session."""
    subject = sys.argv[1] if len(sys.argv) > 1 else 'recording/de571208-2c6d-4dc6-9efa-c16405c904f9'
    status, page = get(f'/{subject}/edits')
    base = refine_of(page)
    print(f'/{subject}/edits: HTTP {status}; refine: {"found" if base else "MISSING"}')
    if not base:
        print(verdict(status, page))
        return
    probes = [
        ('open edits', f'/{subject}/open_edits', None),
        ('effective', None, add(base, [{'field': 'status', 'op': '=', 'args': [1, 2]}])),
        ('relationship (negated, types only)', None, add(base, [{'field': 'type', 'op': '=', 'args': REL_TYPES}], True)),
        ('post-NGS (types + open_time)', None, add(base, [{'field': 'type', 'op': '=', 'args': REL_TYPES},
                                                         {'field': 'open_time', 'op': '>', 'arg0': '2011-05-16'}])),
        ('pre-NGS', None, add(base, [{'field': 'type', 'op': '=', 'args': REL_TYPES},
                                     {'field': 'open_time', 'op': '<', 'arg0': '2011-05-17'}])),
        ('editor me, logged out', None, add(base, [{'field': 'editor', 'op': 'me'}])),
        ('editor not_me, logged out', None, add(base, [{'field': 'editor', 'op': 'not_me'}])),
    ]
    for name, path, q in probes:
        st, body = get(path or f'/search/edits?{q}')
        print(f'{name:38} {verdict(st, body)}')


if __name__ == '__main__':
    main()
