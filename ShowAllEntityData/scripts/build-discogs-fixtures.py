"""Build the discogs.com page fixtures (tests/fixtures/dg-{master,release,artist,label}.html)
from the saved pages in debug/ (debug/discogs-*.html, captured 2026-10-17).

The pageTypes take their rows from Discogs' API (the ext-discogs-*.json
fixtures), never from the page, so a fixture needs only what the script
reads of the page itself and what a spec checks around it:

- the document title (the toolbar <h1>'s name);
- Discogs' header root (`#__header_root_<n>`, its number varies per load),
  the page root `#app` and the footer root `#esi-footer-root`, in that order:
  our section goes between the first two;
- in `#app`: Discogs' own <h1> and the first few Discogs links of its
  content, made absolute (a link preview target on discogs.com);
- one Discogs link in the header and one in the footer, which previews
  must leave alone (content only, vzell 2026-10-18).

Scripts, styles, iframes and the rest of the 0.3-7 MB pages are dropped.

Since 2026-10-18 also Discogs' older, server-rendered pages (no #app; header
and page share #main_wrapper, the content is #page_content), whose content
the script DOES read:

- dg-submissions-flat.html (debug/discogs-submissions-flat.html): a list's
  submissions, flat view — its title block, the top pager (total and "Jump
  to" max) and all 100 rows of `div.history > table`;
- dg-submissions-browser.html (debug/discogs-submissions.html): the browser
  view — its "1-100 of 1,140" pager, five entries, a stand-in history pane,
  in Discogs' split pane with subbrowser.css's layout rules (the body rule
  locks the window's scrolling);
- dg-release-history.html (debug/discogs-release-history.html): a release's
  history page — header, every change, the rating, the latest diff;
- dg-user-ratings.html (debug/discogs-user-ratings.html, 2026-10-19): a
  user's ratings — the user header, the top pager and the ratings table; and
  dg-user-ratings-300.html, the same saying "of 300" (SYNTHETIC, 2 pages).

usage: python3 scripts/build-discogs-fixtures.py
"""
import html
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KINDS = ('master', 'release', 'artist', 'label')
LINK_RE = re.compile(r'<a\b[^>]*\bhref="((?:https://www\.discogs\.com)?/(?:release|master|artist|label)/\d+[^"]*)"[^>]*>(.*?)</a>', re.S)


def text(s):
    """Tags dropped, entities decoded, whitespace collapsed."""
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()


def build(kind):
    """One fixture from debug/discogs-<kind>.html."""
    src = open(os.path.join(ROOT, 'debug', f'discogs-{kind}.html'), encoding='utf-8', errors='replace').read()
    title = text(re.search(r'<title[^>]*>(.*?)</title>', src, re.S).group(1))
    app = src[src.index('<div id="app"'):]
    h1 = text(re.search(r'<h1\b[^>]*>(.*?)</h1>', app, re.S).group(1))
    links, seen = [], set()
    for m in LINK_RE.finditer(app):
        href, label = m.group(1).split('?')[0], text(m.group(2))
        if href.startswith('/'):
            href = 'https://www.discogs.com' + href
        if label and href not in seen:
            seen.add(href)
            links.append((href, label))
        if len(links) >= 5:
            break
    if len(links) < 2:
        sys.exit(f'{kind}: fewer than 2 Discogs links in #app')
    items = ''.join(f'<li><a href="{html.escape(h)}">{html.escape(t)}</a></li>' for h, t in links)
    return ('<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8">'
            f'<title>{html.escape(title)}</title></head><body>\n'
            '<div id="__header_root_8239"><header class="dg-fx-header"><a href="https://www.discogs.com/release/1874253">Header link</a></header></div>\n'
            f'<div id="app"><div id="page"><main class="content_YtwRX"><h1>{html.escape(h1)}</h1>\n'
            f'<ul class="dg-fx-links">{items}</ul></main></div></div>\n'
            '<div id="esi-footer-root"><footer class="dg-fx-footer"><a href="https://www.discogs.com/master/26725">Footer link</a></footer></div>\n'
            '</body></html>\n'), title, len(links)


def squeeze(s):
    """Whitespace between tags dropped, other runs collapsed to one space (lines stay short enough to diff)."""
    s = re.sub(r'>\s+<', '>\n<', s)
    return re.sub(r" +\n", "\n", re.sub(r"[ \t]+", " ", s)).strip()


def between(src, start, end, include_end=True):
    """The part of `src` from `start` up to (and with) the first `end` after it; exits when either is missing."""
    i = src.find(start)
    if i < 0:
        sys.exit(f'missing: {start!r}')
    j = src.find(end, i + len(start))
    if j < 0:
        sys.exit(f'missing after {start!r}: {end!r}')
    return src[i:j + (len(end) if include_end else 0)]


# Discogs' older, server-rendered pages (no #app): header and page share
# #main_wrapper, the content is #page_content. Our section goes first in
# <body> there (docs/claude/discogs.md, "Submissions").
SHELL = ('<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><title>{title}</title></head><body class=" ">\n'
         '<div id="main_wrapper"><div id="__header_root_497"><header class="dg-fx-header">'
         '<a href="https://www.discogs.com/release/1874253">Header link</a></header></div>\n'
         '<div id="page"><div id="page_content" role="main">\n{content}\n</div></div></div>\n'
         '<div id="esi-footer-root"><footer class="dg-fx-footer"><a href="https://www.discogs.com/master/26725">Footer link</a></footer></div>\n'
         '</body></html>\n')


def read_debug(name):
    """A saved page of debug/."""
    return open(os.path.join(ROOT, 'debug', name), encoding='utf-8', errors='replace').read()


def build_submissions_flat():
    """dg-submissions-flat.html: the list's flat view, its title block, top pager and all 100 rows."""
    src = read_debug('discogs-submissions-flat.html')
    title = text(re.search(r'<title[^>]*>(.*?)</title>', src, re.S).group(1))
    content = (between(src, '<div class="browser_flat_title">', '</span>') + '</div>' +
               between(src, '<nav aria-label="Pagination" class="pagination top', '</nav>') +
               between(src, '<div class="history">', '</table>') + '</div>')
    return SHELL.format(title=html.escape(title), content=squeeze(content)), title


# The browser view's own stylesheet (sections/subbrowser.css, fetched from the
# live server 2026-10-19), its layout rules only: the body rule turns off the
# window's scrolling, the split pane scrolls inside itself
# (debug/discogs-scroll-bug.html, DEBUG-NOTES.md 2026-10-19).
SUBBROWSER_CSS = ('<style>body{overflow:hidden;margin:0;padding:0;height:100%;width:100%}'
                  '#items{border-right:2px solid #ddd;overflow-y:auto;height:100%;width:200px}'
                  '#hpane{min-width:1008px}#hpane_wrap{overflow:auto;position:relative}'
                  '#browser{font-size:13px;line-height:16px;height:100%}</style>')


def build_submissions_browser():
    """dg-submissions-browser.html: the browser view, its pager and the first five entries (no release ids), a stand-in history pane,
    in Discogs' split pane (table#browser: the list in aside#items, the pane in #hpane_wrap) with subbrowser.css's layout rules."""
    src = read_debug('discogs-submissions.html')
    title = text(re.search(r'<title[^>]*>(.*?)</title>', src, re.S).group(1))
    items = re.findall(r'<li id="sub_\d+">.*?</li>', src, re.S)[:5]
    content = ('<table id="browser" role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"><tbody><tr>'
               '<td id="tdl" valign="top" width="200" height="100%"><aside id="items">' +
               between(src, '<div id="browser_tdl_items_pager_short">', '</div>') +
               f'<ul class="browser_tdl_items">{"".join(items)}</ul></aside></td>'
               '<td valign="top" height="100%"><div id="hpane_wrap"><div id="hpane">'
               '<div id="historyData"><p>Discogs\' history pane (stand-in).</p></div></div></div></td>'
               '</tr></tbody></table>')
    page = SHELL.format(title=html.escape(title), content=squeeze(content))
    return page.replace('</title></head>', '</title>' + SUBBROWSER_CSS + '</head>', 1), title


def build_release_history(name='discogs-release-history.html'):
    """dg-release-history.html: a release's history page — header, every change, the rating, the latest diff.
    With debug/discogs-release-history-diff.html: dg-release-history-diff.html, the same page asked with
    ?diff=10 (its diff: revision 8 → 10, the changed row `highlight`). That page has no rating and no
    comment form."""
    src = read_debug(name)
    title = text(re.search(r'<title[^>]*>(.*?)</title>', src, re.S).group(1))
    has_form = '<div class="history_form">' in src
    content = (between(src, '<div id="editing_header"', '<div class="history_form">' if has_form else '<div class="data">', include_end=False) +
               (between(src, '<div id="rating">', '</div></div>') if has_form else '') +
               between(src, '<div class="data">', '<div id="shipengine', include_end=False))
    content = re.sub(r'<script\b.*?</script>', '', content, flags=re.S)
    return SHELL.format(title=html.escape(title), content=squeeze(content)), title


def build_user(collection=False):
    """dg-user-vzell.html (debug/discogs-user-vzell.html): a user's page — its header (name, the
    Contributed count), the sidebar (Pending, the stats) and the Recent Activity table. With
    `collection`, dg-user-collection.html: the same page made GuiBeal's (a SYNTHETIC header: no
    saved page of a user with a public collection), with a "Collection 197" link, so the
    Collection button shows."""
    src = read_debug('discogs-user-vzell.html')
    header = between(src, '<section aria-label="User">', '</section>')
    header = re.sub(r'<form id="user_header_form".*?</form>', '', header, flags=re.S)
    aside = between(src, '<div id="page_aside"', '<div id="page_content"', include_end=False)
    content = between(src, '<div id="page_content" role="main">', '</table>') + '</div>'
    title = text(re.search(r'<title[^>]*>(.*?)</title>', src, re.S).group(1))
    if collection:
        header = header.replace('/user/vzell', '/user/GuiBeal').replace('>vzell<', '>GuiBeal<').replace(
            '<ul role="list" class="profile_sections list_no_style user_profile">',
            '<ul role="list" class="profile_sections list_no_style user_profile"><li><a href="/user/GuiBeal/collection">'
            'Collection <small class="facet_count facet_list_count">197</small></a></li>')
        title = 'GuiBeal'
    page = ('<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><title>{title}</title></head><body class=" ">\n'
            '<div id="main_wrapper"><div id="__header_root_497"><header class="dg-fx-header">'
            '<a href="https://www.discogs.com/release/1874253">Header link</a></header></div>\n{header}\n'
            '<div id="page" class="aside_left aside_narrow">{aside}{content}</div></div>\n'
            '<div id="esi-footer-root"><footer class="dg-fx-footer"><a href="https://www.discogs.com/master/26725">Footer link</a></footer></div>\n'
            '</body></html>\n').format(title=html.escape(title), header=squeeze(header), aside=squeeze(aside) + '\n', content=squeeze(content))
    return re.sub(r'<script\b.*?</script>', '', page, flags=re.S), title


def build_ratings(total=None):
    """dg-user-ratings.html (debug/discogs-user-ratings.html): a user's ratings — the user header (name),
    the top pager ("1 – 2 of 2", the limit select) and the whole ratings table (2 rows, 5 and 4 stars).
    With `total`, dg-user-ratings-300.html: the same page saying "1 – 250 of <total>" (SYNTHETIC: no
    saved page of a user with more than 250 ratings), so the page count is 2."""
    src = read_debug('discogs-user-ratings.html')
    header = between(src, '<section aria-label="User">', '</section>')
    header = re.sub(r'<form id="user_header_form".*?</form>', '', header, flags=re.S)
    pager = between(src, '<nav aria-label="Pagination" class="pagination top', '</nav>')
    if total:
        pager = re.sub(r'1 – 2 of 2', f'1 – 250 of {total}', pager)
    content = pager + between(src, '<table class="release_list_table', '</table>')
    title = text(re.search(r'<title[^>]*>(.*?)</title>', src, re.S).group(1))
    page = ('<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><title>{title}</title></head><body class=" ">\n'
            '<div id="main_wrapper"><div id="__header_root_497"><header class="dg-fx-header">'
            '<a href="https://www.discogs.com/release/1874253">Header link</a></header></div>\n{header}\n'
            '<div id="page"><div id="page_content" role="main">\n{content}\n</div></div></div>\n'
            '<div id="esi-footer-root"><footer class="dg-fx-footer"><a href="https://www.discogs.com/master/26725">Footer link</a></footer></div>\n'
            '</body></html>\n').format(title=html.escape(title), header=squeeze(header), content=squeeze(content))
    return re.sub(r'<script\b.*?</script>', '', page, flags=re.S), title


def write(name, out, note):
    """Writes one fixture and reports it."""
    dst = os.path.join(ROOT, 'tests', 'fixtures', name)
    with open(dst, 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)
    print(f'{len(out):7} bytes, {note} -> {os.path.relpath(dst, ROOT)}')


def main():
    """Write the fixtures and report each."""
    for kind in KINDS:
        out, title, n = build(kind)
        write(f'dg-{kind}.html', out, f'{n} links, title "{title}"')
    for name, fn in (('dg-submissions-flat.html', build_submissions_flat), ('dg-submissions-browser.html', build_submissions_browser),
                     ('dg-release-history.html', build_release_history),
                     ('dg-release-history-diff.html', lambda: build_release_history('discogs-release-history-diff.html')),
                     ('dg-user-vzell.html', build_user),
                     ('dg-user-collection.html', lambda: build_user(collection=True)),
                     ('dg-user-ratings.html', build_ratings),
                     ('dg-user-ratings-300.html', lambda: build_ratings(total=300))):
        out, title = fn()
        write(name, out, f'title "{title}"')
    return 0


if __name__ == '__main__':
    sys.exit(main())
