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


def main():
    """Write the four fixtures and report each."""
    for kind in KINDS:
        out, title, n = build(kind)
        dst = os.path.join(ROOT, 'tests', 'fixtures', f'dg-{kind}.html')
        with open(dst, 'w', encoding='utf-8', newline='\n') as f:
            f.write(out)
        print(f'{kind:8} {len(out):6} bytes, {n} links, title "{title}" -> {os.path.relpath(dst, ROOT)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
