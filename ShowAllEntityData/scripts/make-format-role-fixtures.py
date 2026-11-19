#!/usr/bin/env python3
"""Write the format-role fixtures from a real release page.

The format-role finding (docs/claude/findings.md, "A role that doesn't fit the
format") reads a release's "Credits" render: its own relationships, each with
its role in the Relationship column, against the formats of its media. The
base is tests/fixtures/release-tracks-instrument-icons.html, a real 12" Vinyl
release (3ce46b79) whose own relationships already hold "printed in",
"manufactured by", "pressed at" and the copyright roles. Two copies:

- release-credits-format-role.html: the release as it is (12" Vinyl, read from
  the embedded release payload), plus a "lacquer cut by" row (fits vinyl) and
  a "glass mastered by" row (does not: no optical disc);
- release-credits-format-role-digital.html: the same rows, the format set to
  Digital Media in the sidebar and the embedded payload removed, so the
  sidebar fallback is what is read; every physical role breaks there.

Both also get a "pressed at" row in the RELEASE GROUP block, constructed (a
release group has no such relationship): a "Via release group" row is never
tested, whatever its phrase.

The two added rows link DADC Austria (label d903b263), a real target of both
roles elsewhere (scripts/probe-apollo-findings-3.py's seed).

Usage:
    python3 scripts/make-format-role-fixtures.py
"""
import re
import sys

BASE = 'tests/fixtures/release-tracks-instrument-icons.html'
OUT_VINYL = 'tests/fixtures/release-credits-format-role.html'
OUT_DIGITAL = 'tests/fixtures/release-credits-format-role-digital.html'

DADC = ('<span class="labellink"></span><a class="wrap-anywhere" href="/label/d903b263-a45d-4d3d-9fc8-89bdbb143b1e">'
        '<bdi>DADC Austria</bdi></a><br/>')


def row(phrase, target):
    """One native relationship list, as MusicBrainz renders it."""
    return (f'<table class="details" style="width:100%"><tbody><tr><th>{phrase}:</th>'
            f'<td style="word-break:break-all">{target}</td></tr></tbody></table>')


def build(src, digital):
    """The fixture text: the added rows, and for `digital` the format swap."""
    own = '<div id="release-relationships">'
    if src.count(own) != 1:
        sys.exit('no single #release-relationships')
    i = src.index(own)
    # After the block's own h3, if any.
    j = src.find('</h3>', i)
    k = src.find('<table class="details"', i)
    at = j + len('</h3>') if 0 <= j < k else k
    src = src[:at] + row('lacquer cut by', DADC) + row('glass mastered by', DADC) + src[at:]
    rg = '<div id="release-group-relationships"><h3>Release group</h3>'
    if src.count(rg) != 1:
        sys.exit('no single release group block')
    src = src.replace(rg, rg + row('pressed at', DADC))
    if digital:
        n = len(re.findall(r'<dd class="format">[^<]*</dd>', src))
        if n != 1:
            sys.exit(f'{n} dd.format')
        src = re.sub(r'<dd class="format">[^<]*</dd>', '<dd class="format">Digital Media</dd>', src)
        before = len(src)
        src = re.sub(r'<script type="application/json"[^>]*>(?:(?!</script>).)*"mediums"(?:(?!</script>).)*</script>',
                     '', src, flags=re.S)
        if len(src) == before:
            sys.exit('no release payload removed')
    return src


def main():
    """Write both fixtures."""
    with open(BASE, encoding='utf-8') as fh:
        src = fh.read()
    for out, digital in ((OUT_VINYL, False), (OUT_DIGITAL, True)):
        with open(out, 'w', encoding='utf-8') as fh:
            fh.write(build(src, digital))
        print(f'wrote {out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
