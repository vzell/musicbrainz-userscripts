"""Was the committed release-tracks baseline captured logged-in or logged-out?

A logged-out re-capture would drop editor-only markup and produce a large
spurious diff, making the baseline worse rather than better.
"""
import re

for path in ('tests/snapshots/release-tracks/raw.html', 'tests/snapshots/release-tracks/rendered.html'):
    html = open(path, encoding='utf-8', errors='replace').read()
    print(f'=== {path} ({len(html)} bytes)')
    for label, pat in [
        ('/logout link',        r'/logout'),
        ('/login link',         r'/login'),
        ('editor profile link', r'href="/user/'),
        ('"Create account"',    r'Create account'),
        ('rating widget',       r'class="[^"]*rating'),
        ('tagger icon',         r'tagger-icon'),
        ('edit link (/edit)',   r'href="[^"]*/edit"'),
        ('open_edits link',     r'open_edits'),
        ('add-to-collection',   r'collection_collaborator|add-to-collection|/collection'),
    ]:
        print(f'   {label:<22} {len(re.findall(pat, html))}')
    print()
