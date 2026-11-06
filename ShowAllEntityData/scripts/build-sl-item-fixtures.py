"""Copy springsteenlyrics.com item and list snapshots from debug/ into tests/fixtures/, scrubbed.

The 2026-11-04 snapshots were saved by vzell while logged in. A logged-in page
carries two things that must never reach the repository:

- the user name ("You are currently logged in as <b>NAME</b>"), and
- the "Private info" section: where and when a copy was bought, upload notes.

This script replaces the user name with "USER" and the content of every
"Private info" section with a placeholder line (and blanks a song page's
lyrics, as build-detail-fixtures.py does), keeping the section itself (the
item pageType shows it, closed, to a logged-in user). It then fails if the
user name, an e-mail address or a known private-note phrase is left anywhere
in the output.

usage:
  python3 scripts/build-sl-item-fixtures.py            # write the fixtures
  python3 scripts/build-sl-item-fixtures.py --check    # verify, write nothing

Env of the snapshots: 2026-11-04, vzell's browser (Chrome, Tampermonkey; the
versions were not recorded), logged in unless noted.
"""

import importlib.util
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The list fixtures' own builder: its sanitise() (doctype, scripts, <link>s,
# inline background images and the sticky wrapper's height removed) and its
# pagination pattern, so these fixtures reach the network as little as those.
_spec = importlib.util.spec_from_file_location('build_sl_fixtures', os.path.join(ROOT, 'scripts', 'build-sl-fixtures.py'))
_sl = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_sl)
# The detail fixtures' builder: its blank_lyrics(), so a song page here
# carries no lyrics either (every word "la", the lines' shape kept).
_dspec = importlib.util.spec_from_file_location('build_detail_fixtures', os.path.join(ROOT, 'scripts', 'build-detail-fixtures.py'))
_detail = importlib.util.module_from_spec(_dspec)
_dspec.loader.exec_module(_detail)
DEBUG = os.path.join(ROOT, 'debug')
FIXTURES = os.path.join(ROOT, 'tests', 'fixtures')

# debug/ snapshot -> tests/fixtures/ name. Two "collection" snapshots are
# really bootleg pages (bootlegs.php?item=4615 / 9507).
TARGETS = {
    'sl-collection-official-detail.html': 'detail-sl-collection-8595.html',
    'sl-collection-sampler-detail.html': 'detail-sl-collection-5240.html',
    'sl-collection-VA-detail.html': 'detail-sl-collection-9685.html',
    'sl-collection-aud_live_1988-detail.html': 'detail-sl-bootlegs-9507.html',
    'sl-bootleg-2567-logged-in.html': 'detail-sl-bootlegs-2567.html',
    'sl-brucelegs-2-detail.html': 'detail-sl-brucelegs-281.html',
    # Six versions in "All versions of this bootleg" (vzell, 2026-11-04);
    # saved with the script running, see strip_script_ui().
    'sl-brucelegs-multiple-versions.html': 'detail-sl-brucelegs-41.html',
    'sl-collections-list-logged-in.html': 'sl-collection-logged-in.html',
    'sl-bootlegs-list-logged-in.html': 'sl-bootlegs-logged-in.html',
    'sl-brucelegs-list-logged-in.html': 'sl-brucelegs-logged-in.html',
    # A song page (lyrics.php?song=backstreets) with its "Private Info"
    # section, and a lyrics letter page with the logged-in song lines (ID,
    # edit link); org/springsteenlyrics.org "Overwhole of the SL PTs and
    # POHs", 2026-11-04.
    'sl-song-official.html': 'detail-sl-song-backstreets-logged-in.html',
    'sl-songs-B.html': 'sl-lyrics-b-logged-in.html',
    # The other three song shapes, for the sl-song pageType (2026-11-05): a
    # live version (its release's editions, "Disc 5:" among the sides), an
    # unofficial studio version, a song without lyrics. None has a Private
    # Info section; their login box is scrubbed all the same.
    'sl-song-live.html': 'detail-sl-song-backstreets-1975-11-18-logged-in.html',
    'sl-song-unofficial.html': 'detail-sl-song-backstreets-unofficial1-logged-in.html',
    'sl-song-no-lyrics.html': 'detail-sl-song-babyme-logged-in.html',
    # vzell's example of the tracklist song links (org/springsteenlyrics.org
    # "URLify the tracklist to song URLs (SL and MB)", 2026-11-05): The Wild,
    # the Innocent & the E Street Shuffle, A2 "… (SANDY)" and B2 "ROSALITA
    # (COME OUT TONIGHT)". Fetched logged out with curl on 2026-11-05.
    'sl-collection-10163-detail.html': 'detail-sl-collection-10163.html',
    # org/image-handling.org P2, one picture section over an item's copies:
    # two copies with scans each (collection.php?item=6463, "Tunnel Of Love
    # Express I", 2 + 2), and two copies of which the FIRST has none yet
    # (item=5472, "CBS - The Sound Of Summer '88", 0 + 3). Fetched logged out
    # with curl on 2026-11-06 (vzell's logged-in snapshots of the same pages,
    # debug/SL-release-2copys*-initial.html, carry the script's tracklist
    # links, which strip_script_ui() predates).
    'sl-collection-6463-detail.html': 'detail-sl-collection-6463.html',
    'sl-collection-5472-detail.html': 'detail-sl-collection-5472.html',
    # A label's CD and vinyl bootlegs, the site's only label page
    # (brucelegs.php?cmd=list&f_label=Great Dane Records, 15 items; vzell,
    # 2026-11-05, "Adjustments to 'URLify the tracklist…'" 3a): the label's
    # preview record (_dpParseSlLabel()).
    'sl-brucelegs-labels-list-initial.html': 'detail-sl-brucelegs-label-greatdane.html',
    # Two media with their kind in brackets, "Disc 1: [CD]" / "Disc 2:
    # [DVD]" (Broadcast Rarities; vzell, 2026-11-05: the DVD's tracks were
    # read as notes), and "GLORY DAYS [continued]". Fetched logged out with
    # curl on 2026-11-05.
    'sl-collection-7457-detail.html': 'detail-sl-collection-7457.html',
    # Box sets listing their records without tracklists, `Record 1:
    # "Greetings From Asbury Park N.J."` then pressing, "Cat# …" and sleeve
    # lines (vzell, 2026-11-05: read as three "tracks"). Fetched logged out
    # with curl on 2026-11-05.
    'sl-collection-5618-detail.html': 'detail-sl-collection-5618.html',
    'sl-collection-5619-detail.html': 'detail-sl-collection-5619.html',
}

# A list page keeps its first LIST_KEEP cards, every card that shows a shape
# the specs need (LIST_SHAPES: "In Lebanon", no Good scans, no MusicBrainz
# link, no artwork), and its last card (the list's tail markup stays intact).
# The whole logged-in pages are ~450 KB each; the other list fixtures ~100 KB.
LIST_KEEP = 12
LIST_SHAPES = (
    lambda c: 'collection_inlebanon' in c,
    lambda c: 'collection_' in c and 'collection_goodscans' not in c and 'item=' in c and 'collection.php' in c,
    lambda c: 'bootlegs.php?item=' in c and 'collection_musicbrainz' not in c,
    lambda c: 'bootlegs.php?item=' in c and 'bi-image' not in c,
)
CARD_START = '<div class="blog-post'

# The logged-in LIST snapshots were saved with ShowAllEntityData running, so
# their page carries the script's own toolbar, menus and styles (the item
# snapshots do not: no pageType ran there). Their cards are untouched, so a
# list fixture is the clean anonymous list fixture of the same kind with its
# cards replaced by the logged-in ones.
LIST_BASES = {
    'sl-collection-logged-in.html': 'sl-collection-page1.html',
    'sl-bootlegs-logged-in.html': 'sl-bootlegs-page1.html',
    'sl-brucelegs-logged-in.html': 'sl-brucelegs-page1.html',
}

# The logged-in lyrics letter page was saved with the script running too; its
# song lines (one per text line) are grafted into the clean anonymous letter
# page instead of cards (graft_lines()).
LINE_BASES = {
    'sl-lyrics-b-logged-in.html': 'sl-lyrics-b.html',
}
SONG_LINE_RE = re.compile(r'^<span class="monospaced">.*lyrics\.php\?song=.*<br>$', re.M)
DIV_TAG_RE = re.compile(r'<(/?)div\b', re.I)


def cards_region(html):
    """(start, end) of the run of item cards: from the first card's `<div` to the
    end of the last card's matching `</div>` (a div depth count)."""
    starts = [m.start() for m in re.finditer(re.escape(CARD_START), html)]
    if not starts:
        return None
    depth = 0
    for m in DIV_TAG_RE.finditer(html, starts[-1]):
        depth += -1 if m.group(1) else 1
        if depth == 0:
            return starts[0], html.index('>', m.end()) + 1
    return None


LOGIN_FORM_RE = re.compile(r'<form [^>]*name="login_form">.*?</form>', re.S)


def graft(base_html, cards_html):
    """`base_html` with its cards and its login box replaced by those of
    `cards_html` (the logged-in box: "logged in as USER", a Log Out button,
    which is what `_slLoggedIn()` reads)."""
    b, c = cards_region(base_html), cards_region(cards_html)
    if not b or not c:
        sys.exit('graft: no cards found')
    out = base_html[:b[0]] + cards_html[c[0]:c[1]] + base_html[b[1]:]
    box = LOGIN_FORM_RE.search(cards_html)
    if not box or 'hBtnLogout' not in box.group(0) or not LOGIN_FORM_RE.search(out):
        sys.exit('graft: no logged-in login box')
    return LOGIN_FORM_RE.sub(lambda _m: box.group(0), out, count=1)


def graft_lines(base_html, lines_html):
    """`base_html` with its song lines and its login box replaced by those of
    `lines_html` (a lyrics letter page; see LINE_BASES). Both pages must have
    the same number of lines, in the same order, so a fixture differs from its
    anonymous base by the logged-in parts of each line only."""
    b = list(SONG_LINE_RE.finditer(base_html))
    c = list(SONG_LINE_RE.finditer(lines_html))
    if not b or len(b) != len(c):
        sys.exit(f'graft_lines: {len(b)} lines in the base, {len(c)} in the snapshot')
    out = base_html[:b[0].start()] + lines_html[c[0].start():c[-1].end()] + base_html[b[-1].end():]
    box = LOGIN_FORM_RE.search(lines_html)
    if not box or 'hBtnLogout' not in box.group(0) or not LOGIN_FORM_RE.search(out):
        sys.exit('graft_lines: no logged-in login box')
    return LOGIN_FORM_RE.sub(lambda _m: box.group(0), out, count=1)


def trim_list(html):
    """Drops the cards a spec does not need from a list page (see LIST_KEEP)."""
    starts = [m.start() for m in re.finditer(re.escape(CARD_START), html)]
    if len(starts) <= LIST_KEEP + 1:
        return html
    out, last = [], 0
    taken = [0] * len(LIST_SHAPES)
    for i, st in enumerate(starts[:-1]):
        card = html[st:starts[i + 1]]
        if i < LIST_KEEP:
            continue
        # At most two extra cards per shape.
        hit = next((k for k, f in enumerate(LIST_SHAPES) if f(card) and taken[k] < 2), None)
        if hit is not None:
            taken[hit] += 1
            continue
        out.append(html[last:st])
        last = starts[i + 1]
    out.append(html[last:])
    return ''.join(out)


# What ShowAllEntityData puts into a page before any button is pressed: its
# style blocks, the html/body attributes, the toolbar <h1> and the status line
# in .project-detail, and the menu panel and mask at the end of <body>.
UI_STYLE_RE = re.compile(r'<style\b[^>]*>(?:(?!</style>).)*?\bmb-(?:(?!</style>).)*</style>', re.S)
UI_H1_RE = re.compile(r'<h1 class="mb-sl-h1.*?</h1>', re.S)
UI_STATUS_RE = re.compile(r'<div id="mb-status-displays-wrapper".*?</div></div>', re.S)
UI_TAIL_RE = re.compile(r'<div id="mb-saed-menu-btn-panel".*?(?=</body>)', re.S)
UI_LEFT_RE = re.compile(r'(?:class|id)="mb-')


def strip_script_ui(html):
    """A snapshot saved with the script running, back to the site's page
    (only the parts the script adds BEFORE a press); fails if any of the
    script's classes or ids is left."""
    if 'mb-sa-host-sl' not in html:
        return html
    html = UI_STYLE_RE.sub('', html)
    html = re.sub(r'<html lang="en"[^>]*>', '<html lang="en">', html, count=1)
    html = html.replace('<body class="mb-sa-host-sl">', '<body>', 1)
    html = UI_H1_RE.sub('', html, count=1)
    html = UI_STATUS_RE.sub('', html, count=1)
    html = UI_TAIL_RE.sub('', html, count=1)
    left = UI_LEFT_RE.findall(html)
    if left:
        sys.exit(f'strip_script_ui: {len(left)} of the script\'s classes/ids left')
    return html


USER_RE = re.compile(r'(logged in as <span class="text-info"><b>)([^<]*)(</b>)')
# "Private info" on the item pages, "Private Info" on a song page.
PRIVATE_RE = re.compile(r'(<h3 class="heading">Private info</h3>)(.*?)(?=\n\s*(?:<hr>|</div>))', re.S | re.I)
PLACEHOLDER = '\n<span class="colored-text"><span class="monospaced">(private note removed for the fixture)</span></span>'
EMAIL_RE = re.compile(r'[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}\b')
# The site's own public contact address is in every page's footer.
EMAIL_ALLOWED = {'webmaster@springsteenlyrics.com'}
# Phrases of the real private notes: a leak check, not the scrub itself.
PRIVATE_WORDS = ('I bought it', 'Downloaded from', 'Uploaded by', 'plus.google.com', 'shipping',
                 # the song page's (backstreets, 2026-11-04)
                 'Transcribed by', 'See old')


def scrub(html):
    """Returns (scrubbed html, user names found)."""
    users = set(m.group(2) for m in USER_RE.finditer(html))
    html = USER_RE.sub(r'\1USER\3', html)
    html = PRIVATE_RE.sub(lambda m: m.group(1) + PLACEHOLDER, html)
    return html, users


def leaks(html, users):
    """The problems left in a scrubbed page, as strings."""
    out = []
    for u in users:
        if u and re.search(re.escape(u), html, re.I):
            out.append(f'user name {u!r}')
    for e in EMAIL_RE.findall(html):
        if e not in EMAIL_ALLOWED and not e.endswith(('.png', '.jpg', '.gif', '.css', '.js')):
            out.append(f'e-mail {e!r}')
    for w in PRIVATE_WORDS:
        if w in html:
            out.append(f'private phrase {w!r}')
    return out


def main():
    """Writes (or with --check verifies) every fixture; exit 1 on a leak or a stale file."""
    check = '--check' in sys.argv[1:]
    bad = 0
    for src, dst in TARGETS.items():
        sp = os.path.join(DEBUG, src)
        dp = os.path.join(FIXTURES, dst)
        if not os.path.exists(sp):
            if check and os.path.exists(dp):
                problems = leaks(open(dp, encoding='utf-8').read(), set())
                print(f'{dst}: snapshot missing, fixture checked for leaks only: {problems or "clean"}')
                bad += bool(problems)
                continue
            print(f'{src}: missing in debug/')
            bad += 1
            continue
        raw = open(sp, encoding='utf-8', errors='replace').read()
        html, users = scrub(strip_script_ui(raw) if dst.startswith('detail-') else raw)
        html = _sl.sanitise(html)
        how = 'user name and Private info scrubbed'
        if dst.startswith('detail-sl-song-'):
            html, blanked = _detail.blank_lyrics(html, 'sl-song')
            if not blanked:
                print(f'{dst}: the lyrics block was not found')
                bad += 1
                continue
            how += ', lyrics blanked'
        if dst in LIST_BASES:
            base = open(os.path.join(FIXTURES, LIST_BASES[dst]), encoding='utf-8').read()
            base = re.sub(r'^\s*<!DOCTYPE[^>]*>\s*(?:<!--.*?-->\s*)?', '', base, count=1, flags=re.S | re.I)
            # One page: the specs serve this page for every page fetch.
            html = _sl.PAGINATION_RE.sub('', graft(base, trim_list(html)))
            how = f'its cards grafted into {LIST_BASES[dst]} (the snapshot carries the script\'s own UI)'
        elif dst in LINE_BASES:
            base = open(os.path.join(FIXTURES, LINE_BASES[dst]), encoding='utf-8').read()
            base = re.sub(r'^\s*<!DOCTYPE[^>]*>\s*(?:<!--.*?-->\s*)?', '', base, count=1, flags=re.S | re.I)
            html = graft_lines(base, html)
            how = f'its song lines grafted into {LINE_BASES[dst]} (the snapshot carries the script\'s own UI)'
        html = (f'<!DOCTYPE html>\n<!-- Generated by scripts/build-sl-item-fixtures.py from debug/{src} '
                f'(saved logged in, 2026-11-04): {how}; scripts, <link>s and '
                'inline background images removed; do not edit by hand. -->\n' + html)
        html = '\n'.join(line.rstrip() for line in html.split('\n'))
        problems = leaks(html, users)
        if problems:
            print(f'{dst}: LEAK {problems}')
            bad += 1
            continue
        if check:
            same = os.path.exists(dp) and open(dp, encoding='utf-8').read() == html
            print(f'{dst}: {"ok" if same else "STALE"}')
            bad += not same
        else:
            with open(dp, 'w', encoding='utf-8', newline='\n') as f:
                f.write(html)
            print(f'{dst}: written ({len(html)} chars, {len(users)} user name(s) scrubbed)')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
