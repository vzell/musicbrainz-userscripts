#!/usr/bin/env python3
"""Build the fixtures of tests/fixtures/bb-findings-batch1.spec.js from the
BruceParser mirror (org/bbp-parity.org, Track A batch 1).

  tests/fixtures/bb-year-1972-findings.html
      the 1972 year page with eight of its 94 entries: the page as it is
      (legend, tour boxes, "Jump to"), every other entry cut at its <hr />.
  tests/fixtures/bb-findings/<kind>_<slug>.html
      those eight entries' own pages, whole.

The entries, each for what scripts/probe-bb-batch1-findings.py found on it
(2026-11-13 mirror):
  gig:1972-01-21-captain-s-garter-neptune-nj            nothing ("(The)" moved)
  gig:1972-02-12-sunshine-in-asbury-park-nj-early       variant, postfix
  gig:1972-02-12-sunshine-in-asbury-park-nj-late        variant, postfix
  recording:1972-04-00b-mediasound-studios-new-york-city-ny
                                                        nothing (anchor 000472b)
  recording:1972-05-00-mediasound-studios-new-york-city-ny
                                                        anchor date (000472b, a second
                                                        time), anchor link, postfix
  gig:1972-05-02-cbs-records-new-york-city-ny           postfix only
  gig:1972-06-00-unknown-location-point-pleasant-nj     name mismatch, postfix
  gig:1972-12-29-hara-arena-dayton-oh                   name mismatch only

Scripts, noscripts and theme @imports are removed
(scripts/build-bb-event-fixtures.py's `strip()`); nothing else changes.

Usage: python3 scripts/build-bb-findings-batch1-fixtures.py [mirror_dir]
"""
import importlib.util
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'tests', 'fixtures')
MIRROR = os.path.realpath(sys.argv[1] if len(sys.argv) > 1 else '/home/vzell/git/scripts/BruceParser/bb/latest')
YEAR = '1972'
KEEP = [
    'gig:1972-01-21-captain-s-garter-neptune-nj',
    'gig:1972-02-12-sunshine-in-asbury-park-nj-early',
    'gig:1972-02-12-sunshine-in-asbury-park-nj-late',
    'recording:1972-04-00b-mediasound-studios-new-york-city-ny',
    'recording:1972-05-00-mediasound-studios-new-york-city-ny',
    'gig:1972-05-02-cbs-records-new-york-city-ny',
    'gig:1972-06-00-unknown-location-point-pleasant-nj',
    'gig:1972-12-29-hara-arena-dayton-oh',
]
HEAD_RE = re.compile(r'<strong>(?:<a href="/([^"]+)">)?\d{4}-\d\d-\d\d\b[^<]*(?:</a>)?</strong></p>')


def _strip():
    """scripts/build-bb-event-fixtures.py's `strip()` (a hyphenated module name)."""
    spec = importlib.util.spec_from_file_location('build_bb_event_fixtures', os.path.join(HERE, 'build-bb-event-fixtures.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.strip


def note(what):
    """The "built by" comment after the doctype."""
    return (f'<!-- Built by scripts/build-bb-findings-batch1-fixtures.py from the BruceParser mirror '
            f'({os.path.basename(MIRROR)}); {what}; do not edit by hand. -->\n')


def with_note(html, what):
    """The page with the comment after its doctype."""
    return re.sub(r'(<!DOCTYPE[^>]*>\s*)', lambda m: m.group(1) + note(what), html, count=1, flags=re.I)


def main():
    """Write the year fixture and the eight event pages."""
    strip = _strip()
    src = os.path.join(MIRROR, f'{YEAR}.html')
    if not os.path.exists(src):
        sys.exit(f'{src} not on this machine')
    with open(src, encoding='utf-8') as fh:
        html = strip(fh.read())
    # The entries are flat siblings of #page-content, each closed by <hr />:
    # a piece between two rules that opens no kept entry goes, a piece
    # without any entry (a tour box, the legend, the foot) stays.
    pieces = html.split('<hr />')
    kept = []
    found = []
    dropped = 0
    for piece in pieces:
        heads = [m.group(1) for m in HEAD_RE.finditer(piece)]
        if not heads:
            kept.append(piece)
        elif any(h in KEEP for h in heads):
            if len(heads) != 1:
                sys.exit(f'a piece with {len(heads)} headings: {heads}')
            kept.append(piece)
            found.append(heads[0])
        else:
            dropped += len(heads)
    if sorted(found) != sorted(KEEP):
        sys.exit(f'entries kept {found}, expected {KEEP}')
    out = with_note('<hr />'.join(kept),
                    f'{len(found)} of its {len(found) + dropped} entries kept, scripts, noscripts and theme @imports removed')
    target = os.path.join(OUT, f'bb-year-{YEAR}-findings.html')
    with open(target, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(out)
    print(f'wrote {os.path.relpath(target, ROOT)} ({len(out)} bytes, {len(found)} entries, {dropped} cut)')

    os.makedirs(os.path.join(OUT, 'bb-findings'), exist_ok=True)
    for key in KEEP:
        kind, slug = key.split(':', 1)
        with open(os.path.join(MIRROR, kind, f'{kind}_{slug}.html'), encoding='utf-8', errors='replace') as fh:
            page = strip(fh.read())
        if 'id="page-title"' not in page or 'id="page-content"' not in page:
            sys.exit(f'{key}: no title or content')
        page = with_note(page, 'scripts, noscripts and theme @imports removed')
        target = os.path.join(OUT, 'bb-findings', f'{kind}_{slug}.html')
        with open(target, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(page)
        print(f'wrote {os.path.relpath(target, ROOT)} ({len(page)} bytes)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
