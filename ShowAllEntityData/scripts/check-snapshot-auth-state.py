"""Was a committed baseline captured logged-in or logged-out?

A logged-out re-capture would drop editor-only markup and produce a large
spurious diff, making the baseline worse rather than better. `authState.js`
warns when the saved session file has EXPIRED, but it cannot see a session
MusicBrainz rejected for any other reason — the only evidence of that is in
the captured HTML itself, which is what this reads.

The decisive signal is `/logout`: it appears only in a logged-in page's header.
`/login` and "Create account" are its logged-out counterparts, and the rest is
context (editor-only widgets that also thin out when logged out).

    python3 scripts/check-snapshot-auth-state.py                  # every pageType
    python3 scripts/check-snapshot-auth-state.py release-tracks   # just these
    python3 scripts/check-snapshot-auth-state.py --verdict        # one line each
"""
import os
import re
import sys

SNAPSHOTS = os.path.join(os.path.dirname(__file__), '..', 'tests', 'snapshots')

MARKERS = [
    ('/logout link',        r'/logout'),
    ('/login link',         r'/login'),
    ('editor profile link', r'href="/user/'),
    ('"Create account"',    r'Create account'),
    ('rating widget',       r'class="[^"]*rating'),
    ('tagger icon',         r'tagger-icon'),
    ('edit link (/edit)',   r'href="[^"]*/edit"'),
    ('open_edits link',     r'open_edits'),
    ('add-to-collection',   r'collection_collaborator|add-to-collection|/collection'),
]


def page_types(argv):
    """Requested pageTypes, or every directory holding a raw/rendered pair."""
    named = [a for a in argv if not a.startswith('-')]
    if named:
        return named
    return sorted(
        d for d in os.listdir(SNAPSHOTS)
        if os.path.isfile(os.path.join(SNAPSHOTS, d, 'rendered.html'))
    )


def main(argv):
    verdict_only = '--verdict' in argv
    missing = []

    for page_type in page_types(argv):
        for name in ('raw.html', 'rendered.html'):
            path = os.path.join(SNAPSHOTS, page_type, name)
            if not os.path.isfile(path):
                missing.append(f'{page_type}/{name}')
                continue
            html = open(path, encoding='utf-8', errors='replace').read()
            counts = {label: len(re.findall(pat, html)) for label, pat in MARKERS}
            state = 'LOGGED IN ' if counts['/logout link'] else 'LOGGED OUT'
            rel = f'tests/snapshots/{page_type}/{name}'

            if verdict_only:
                print(f'{state}  {rel}')
                continue

            print(f'=== {rel} ({len(html)} bytes) — {state.strip()}')
            for label, _ in MARKERS:
                print(f'   {label:<22} {counts[label]}')
            print()

    for m in missing:
        print(f'!!! no such baseline: {m}', file=sys.stderr)
    return 1 if missing else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
