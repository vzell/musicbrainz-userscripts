"""Builds the fixtures for the "Recording of" pageType specs.

tests/fixtures/recording-of-pagetypes.spec.js checks the "Recording of" /
"Performance attributes" columns on every recording list besides
artist-recordings (docs/claude/deferred-columns-picard-relationships.md,
"Recording of column"). Some of those pages already have a fixture of their
own (search, work, area, place, tag); two are read from pages the user
saved into debug/ (FROM_DEBUG: a collection, which answers a script with a
bot check, and a user's tag page), with ShowAllEntityData's page-load
toolbar stripped out again (strip_userscript()); the others are fetched
here, logged out, from musicbrainz.org:

  tests/fixtures/recording-of-pt-<pageType>.html   the page, cut down to at
                                                   most MAX_ROWS recordings and
                                                   with its pagination removed
                                                   (one page = the whole list)
  tests/fixtures/recording-of-pt-data.json         per fixture: the URL it
                                                   stands for and its recording
                                                   MBIDs; per recording: the
                                                   real /ws/2/recording/<mbid>
                                                   ?inc=work-rels answer (its
                                                   relations only), and the
                                                   browse answers for the work
                                                   and collection fixtures

The WS/2 mock in the spec answers from the JSON, so the page and the service
agree, and every answer is a real one. Requests are spaced >= 1.1 s and 503s
are retried (https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting).

Every page is passed through scrub_secrets(): served pages carry
MusicBrainz's Mapbox token, which GitHub push protection refuses.

usage: python3 scripts/build-recording-of-pagetype-fixtures.py
       python3 scripts/build-recording-of-pagetype-fixtures.py --scrub-only   (no requests)
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-fixtures/1.0 ( volker.zell@opitz-consulting.com )'
SITE = 'https://musicbrainz.org'
ROOT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures')
MAX_ROWS = 6
MBID = r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

# Fixtures that already exist and are reused as they are: only their
# recordings' WS/2 answers are added to the JSON.
EXISTING = {
    'search': ('search-recordings-continuation.html',
               'https://musicbrainz.org/search?query=roulette&type=recording&method=indexed'),
    'work-recordings': ('work-recordings-ms-length.html',
                        'https://musicbrainz.org/work/8727a75a-8d33-3a2c-912a-f57952773201'),
    'area-recordings': ('area-recordings-ms-length.html',
                        'https://musicbrainz.org/area/10fa66f7-aa08-4823-8af8-52108f350a5a/recordings'),
    'tag-value-entity': ('tag-value-entity-extractmaincolumn-zero.html',
                         'https://musicbrainz.org/tag/rock/recording'),
}

# Pages fetched here. `None` = discovered at run time (see discover()).
FETCHED = {
    'isrc': 'https://musicbrainz.org/isrc/USSM19500019',
    'instrument-recordings': 'https://musicbrainz.org/instrument/b62ace3b-47e7-4319-8a3e-1b035ccd20b2/recordings',
    'user-ratings-type': 'https://musicbrainz.org/user/vzell/ratings/recording',
    'artist-credit-entity': 'https://musicbrainz.org/artist-credit/1488075/recording',
    # Found by discover() on 2026-10-20 and pinned, so a rebuild does not
    # depend on the order of a search answer.
    'series-releases': 'https://musicbrainz.org/series/2b09356c-cccd-4501-84f4-ae3c63605204',
}

# Pages a script cannot fetch (musicbrainz.org answered /collection/<mbid>
# with a "Verifying your browser" bot check on 2026-10-19), or that need a
# login (a user's tag page), saved from the user's own browser into debug/.
# They were saved after ShowAllEntityData's page-load step, so its toolbar
# and status line are in them: strip_userscript() takes them out again.
FROM_DEBUG = {
    'collections-releases': ('debug/collection-recordings-initial.html',
                             'https://musicbrainz.org/collection/17ee2e77-21e7-40f1-89b1-4238c9b73428'),
    'user-tag-value-entity': ('debug/user-tag-recording-initial.html',
                              'https://musicbrainz.org/user/vzell/tag/acoustic%20rock/recording'),
    # Not a pageType of its own: search results whose continuation rows (one
    # recording, many releases — 54 for one row) put Release items under
    # Artist once the pair was inserted (2026-10-20, user report). Kept WHOLE
    # (`False` = no row cut), because a continuation row has no recording
    # link of its own and must stay right after the row it belongs to.
    'search-born-to-run': ('debug/OF-WORK-search-recordings-initial.html',
                           'https://musicbrainz.org/search?query=Born+to+Run&type=recording&limit=25&method=indexed',
                           False),
}

# What ShowAllEntityData injects at page load, before "Show all": removed as
# whole elements. The status wrapper has no id on some pages (its spans sit
# in a native element there), so its parts are listed too.
_INJECTED_IDS = ('mb-show-all-controls-container', 'mb-status-displays-wrapper',
                 'mb-status-sentinel', 'mb-status-displays-container')

_last = [0.0]


def get(url, accept='text/html', tries=6):
    """GET spaced >= 1.1 s after the previous request, retrying 503/502/429.

    @param url:    Absolute URL.
    @param accept: Accept header.
    @param tries:  Attempts, including the first.
    @return:       (status, body text)
    """
    st, body = 0, ''
    for attempt in range(tries):
        wait = 1.1 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': accept})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.status, resp.read().decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            st, body = e.code, e.read().decode('utf-8', 'replace')
        except Exception as e:                                   # noqa: BLE001
            st, body = 0, str(e)
        if st not in (0, 429, 502, 503):
            return st, body
        print(f'    HTTP {st}, retry {attempt + 1}/{tries}', flush=True)
        time.sleep(2 * (attempt + 1))
    return st, body


def ws(path):
    """A WS/2 JSON answer, or None.

    @param path: Path and query below /ws/2/, without fmt.
    @return:     Parsed JSON or None.
    """
    sep = '&' if '?' in path else '?'
    st, body = get(f'{SITE}/ws/2/{path}{sep}fmt=json', 'application/json')
    return json.loads(body) if st == 200 else None


def discover():
    """Fills the `None` entries of FETCHED: a recording series with few parts.

    @return: None
    """
    if FETCHED['series-releases'] is None:
        q = urllib.parse.quote('type:"Recording series"')
        data = ws(f'series?query={q}&limit=25') or {}
        for s in data.get('series', []):
            FETCHED['series-releases'] = f'{SITE}/series/{s["id"]}'
            st, html = get(FETCHED['series-releases'])
            if st == 200 and 2 <= len(set(re.findall(rf'href="/recording/({MBID})"', html))) <= 40:
                print(f'  series: {s.get("name")!r} {s["id"]}', flush=True)
                return
        raise SystemExit('no small recording series found')


def _remove_element(html, el_id):
    """Removes the element with this id, balanced by its tag name.

    @param html:  The page.
    @param el_id: The element's id.
    @return:      The page without it (unchanged when absent).
    """
    m = re.search(rf'<([a-z0-9]+)\b[^>]*\bid="{re.escape(el_id)}"[^>]*>', html)
    if not m:
        return html
    tag, depth, pos = m.group(1), 1, m.end()
    tok = re.compile(rf'<(/?){tag}\b[^>]*>', re.I)
    while depth:
        t = tok.search(html, pos)
        if not t:
            raise SystemExit(f'unbalanced <{tag} id="{el_id}">')
        depth += -1 if t.group(1) else 1
        pos = t.end()
    return html[:m.start()] + html[pos:]


# Access tokens a served page carries in its globals. MusicBrainz sends its
# public Mapbox token ("MAPBOX_ACCESS_TOKEN":"pk.…") to every visitor; GitHub
# push protection still refuses a commit that contains one (2026-10-20), and
# no spec uses the map. Blanked in every fixture this script writes.
_TOKEN_RE = re.compile(r'("MAPBOX_ACCESS_TOKEN"\s*:\s*")[^"]*(")')
_ANY_TOKEN_RE = re.compile(r'\b[ps]k\.eyJ[A-Za-z0-9_-]{10,}')


def scrub_secrets(html, name):
    """Blanks the access tokens a served page embeds, and refuses the page
    if a Mapbox-style token is still in it anywhere else.

    @param html: The page.
    @param name: Its name, for the error message.
    @return:     The page without tokens.
    """
    html = _TOKEN_RE.sub(r'\1\2', html)
    if _ANY_TOKEN_RE.search(html):
        raise SystemExit(f'{name}: an access token is left after scrubbing')
    return html


def strip_userscript(html, name):
    """Takes ShowAllEntityData's page-load markup out of a saved page.

    Removes the toolbar and status line (`_INJECTED_IDS`) and the
    `mb-vsb-head` marker on the heading, then refuses the page if any
    `id="mb-…"` or `data-mb-…` is left: something else ran on it, and a
    fixture must be what the server sends.

    @param html: The saved page.
    @param name: Its file name, for the error message.
    @return:     The page as the server sent it, as far as this script goes.
    """
    for el_id in _INJECTED_IDS:
        html = _remove_element(html, el_id)
    html = re.sub(r' data-mb-vsb-head="\d+"', '', html)
    html = re.sub(r' class="mb-vsb-head"', '', html)
    html = re.sub(r'(class="[^"]*?)\s*\bmb-vsb-head\b', r'\1', html)
    left = sorted(set(re.findall(r'id="mb-[\w-]+"|data-mb-[\w-]+=', html)))
    if left:
        raise SystemExit(f'{name}: userscript markup left after stripping: {left}')
    return html


def drop_pagination(html):
    """Drops the page's pagination list, so one page is the whole list.

    @param html: The page.
    @return:     The page without its pagination.
    """
    html = re.sub(r'<nav[^>]*>\s*<ul class="pagination">.*?</ul>\s*</nav>', '', html, flags=re.S)
    return re.sub(r'<ul class="pagination">.*?</ul>', '', html, flags=re.S)


def trim(html):
    """Drops pagination and every recording row/item after MAX_ROWS.

    Rows are `<tr>`s of a `table.tbl` body, items `<li>`s of a list: whichever
    holds recording links. Anything else is left as it is.

    @param html: The page.
    @return:     The cut-down page.
    """
    html = re.sub(r'<ul class="pagination">.*?</ul>', '', html, flags=re.S)
    html = re.sub(r'<nav[^>]*>\s*<ul class="pagination">.*?</ul>\s*</nav>', '', html, flags=re.S)
    for tag in ('tr', 'li'):
        seen = [0]

        def cut(m):
            if not re.search(rf'href="[^"]*/recording/{MBID}"', m.group(0)):
                return m.group(0)
            seen[0] += 1
            return m.group(0) if seen[0] <= MAX_ROWS else ''
        html = re.sub(rf'<{tag}\b[^>]*>(?:(?!<{tag}\b).)*?</{tag}>', cut, html, flags=re.S)
        if seen[0]:
            break
    return html


def recordings_of(html):
    """The recording MBIDs a page links, in page order, without duplicates.

    @param html: The page.
    @return:     list of MBIDs.
    """
    out = []
    for m in re.findall(rf'href="(?:https://musicbrainz\.org)?/recording/({MBID})"', html):
        if m not in out:
            out.append(m)
    return out


def main():
    """Fetches the pages and the WS/2 answers, writes the fixtures and the JSON.

    @return: None
    """
    if '--scrub-only' in sys.argv:
        # Re-scrub the committed fixtures in place, without any request.
        for fname in sorted(os.listdir(ROOT)):
            if fname.startswith('recording-of-pt-') and fname.endswith('.html'):
                path = os.path.join(ROOT, fname)
                html = open(path, encoding='utf-8').read()
                out = scrub_secrets(html, fname)
                if out != html:
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write(out)
                    print(f'  scrubbed {fname}')
        return
    discover()
    data = {'pages': {}, 'recordings': {}, 'browse': {}}
    for pt, (src, url, *opt) in FROM_DEBUG.items():
        path = os.path.join(os.path.dirname(__file__), '..', src)
        if not os.path.exists(path):
            print(f'  {pt}: SKIPPED — {src} not found', flush=True)
            continue
        html = strip_userscript(open(path, encoding='utf-8').read(), src)
        html = trim(html) if (opt[0] if opt else True) else drop_pagination(html)
        html = scrub_secrets(html, src)
        fname = f'recording-of-pt-{pt}.html'
        with open(os.path.join(ROOT, fname), 'w', encoding='utf-8') as f:
            f.write(html)
        data['pages'][pt] = {'url': url, 'fixture': fname, 'recordings': recordings_of(html)}
        print(f'  {pt}: {len(data["pages"][pt]["recordings"])} recordings → {fname} (from {src})', flush=True)
    for pt, (fname, url) in EXISTING.items():
        html = open(os.path.join(ROOT, fname), encoding='utf-8').read()
        data['pages'][pt] = {'url': url, 'fixture': fname, 'recordings': recordings_of(html)}
    for pt, url in FETCHED.items():
        st, html = get(url)
        if st != 200:
            raise SystemExit(f'{pt}: HTTP {st} for {url}')
        html = scrub_secrets(trim(html), url)
        if not recordings_of(html):
            # e.g. the "Verifying your browser" bot check musicbrainz.org
            # answered /collection/<mbid> with on 2026-10-19 — a script cannot
            # pass it; save that page from a real browser instead.
            print(f'  {pt}: SKIPPED — no recording links in the answer for {url}', flush=True)
            continue
        fname = f'recording-of-pt-{pt}.html'
        with open(os.path.join(ROOT, fname), 'w', encoding='utf-8') as f:
            f.write(html)
        data['pages'][pt] = {'url': url, 'fixture': fname, 'recordings': recordings_of(html)}
        print(f'  {pt}: {len(data["pages"][pt]["recordings"])} recordings → {fname}', flush=True)
    for pt, page in data['pages'].items():
        for rid in page['recordings']:
            if rid in data['recordings']:
                continue
            rec = ws(f'recording/{rid}?inc=work-rels')
            data['recordings'][rid] = {'id': rid, 'title': (rec or {}).get('title', ''),
                                       'relations': (rec or {}).get('relations', [])} if rec else None
    for pt, by in (('work-recordings', 'work'), ('collections-releases', 'collection')):
        if pt not in data['pages']:
            continue
        mbid = re.search(MBID, data['pages'][pt]['url']).group(0)
        b = ws(f'recording?{by}={mbid}&inc=work-rels&limit=100') or {}
        data['browse'][by] = {'mbid': mbid, 'recording-count': b.get('recording-count'),
                              'recordings': [{'id': r['id'], 'title': r.get('title', ''),
                                              'relations': r.get('relations', [])}
                                             for r in b.get('recordings', [])]}
    with open(os.path.join(ROOT, 'recording-of-pt-data.json'), 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
        f.write('\n')
    print(f'== {len(data["recordings"])} recordings, {len(data["pages"])} pages', flush=True)


if __name__ == '__main__':
    main()
