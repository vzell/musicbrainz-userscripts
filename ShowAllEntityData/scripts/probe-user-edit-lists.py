"""Probe: do an editor's other edit lists have the same page shape as
/user/<name>/edits, the page the 'user-edits' pageType converts?

The lists are the links of a profile's Statistics: /user/<name>/edits/<status>
(open, accepted, autoedits, applied, rejected, failed, cancelled) and
/user/<name>/votes. The pageTypes rest on four facts of the page:

  1. no native <h1>, and exactly one <h2> outside a div.edit-list (the title
     that renameH2ToH1 promotes and the header fallback picks up);
  2. no div.tabs (insertH2 then lands after that promoted <h1>);
  3. every edit is a div.edit-list block with its own <h2><a href="/edit/N">;
  4. "Found N edits" and a ul.pagination, as on every edit listing.

The pages are login-gated and a plain HTTP client gets the "Verifying your
browser" page, so save them with a real Chromium first and report from disk:

    node scripts/fetch-mb-page-fixture.js --auth /user/vzell/edits/accepted DIR/edits-accepted.html

usage: python3 scripts/probe-user-edit-lists.py DIR
       (reads every DIR/*.html, makes no request)
"""
import html
import os
import re
import sys


def text(s):
    """Tag-stripped, whitespace-collapsed text of an HTML fragment."""
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()


def content(doc):
    """The div#content part of a page (everything after its opening tag)."""
    i = doc.find('id="content"')
    return doc[i:] if i >= 0 else doc


def report(name, doc):
    """Prints the four facts the pageTypes rest on for one saved page."""
    c = content(doc)
    # Cut every edit block out, so the headings left are the page's own.
    blocks = re.findall(r'<div class="edit-list">', c)
    outside = re.sub(r'<div class="edit-list">.*?<div class="edit-notes', '', c, flags=re.S)
    h1s = [text(h) for h in re.findall(r'<h1[^>]*>(.*?)</h1>', outside, re.S)]
    h2s = [text(h) for h in re.findall(r'<h2[^>]*>(.*?)</h2>', outside, re.S)
           if not re.search(r'Edit #\d+', text(h))]
    edit_h2 = len(re.findall(r'<h2[^>]*>\s*<a href="/edit/\d+', c))
    found = re.search(r'Found\s+(?:at least\s+)?[\d,]+\s+edits?', text(c))
    print(f'{name}:')
    print(f'  h1 in #content: {h1s or "none"}')
    print(f'  own h2s: {h2s}')
    print(f'  div.tabs: {"yes" if "class=\"tabs\"" in c else "no"}')
    print(f'  div.edit-list blocks: {len(blocks)}, edit <h2> links: {edit_h2}')
    print(f'  found: {found.group(0) if found else "none"}; '
          f'pagination: {"yes" if "pagination" in c else "no"}')


def main():
    """Reports on every saved page of the directory given."""
    d = sys.argv[1]
    for f in sorted(os.listdir(d)):
        if f.endswith('.html'):
            with open(os.path.join(d, f), encoding='utf-8') as fh:
                report(f[:-5], fh.read())


if __name__ == '__main__':
    main()
