#!/usr/bin/env python3
"""Write the release-notice fixtures from a real release page.

The release-notice finding (docs/claude/findings.md, "A release-wide finding:
a ℗ notice no relationship has") marks a ℗ line of a release's annotation when
neither the release nor any of its recordings has a phonographic copyright
relationship. The base is the raw page of "Blinded by the Light"
(65f35399-f638-4295-8c78-0ddea0e36ed8, 7" Vinyl, two tracks), saved with

    node scripts/fetch-release-fixture.js 65f35399-f638-4295-8c78-0ddea0e36ed8 debug/rn-blinded.html

Its annotation ends with the compound line "℗ 1973 CBS, Inc. / Manufactured
by Columbia Records / …" and has a © line ("Copyright © 1972 LAUREL CANYON
MUSIC LTD.", never checked), and no ℗ relationship exists anywhere: the
probe's flagged example (scripts/probe-apollo-findings-4.py). Six copies:

- release-notice.html: as it is (flagged);
- release-notice-rec-rel.html: track 2's recording gets a label → recording
  "phonographic copyright" (link type 867) in the embedded payload: a ℗ on
  SOME recordings is enough, not flagged (the Born to Run case, 7 of 8);
- release-notice-own-rel.html: the release itself gets a label → release
  one (711): not flagged;
- release-notice-incomplete.html: the medium's track_count raised to 3 (two
  tracks on the page): a medium not all on the page, so nothing is known and
  nothing is flagged;
- release-notice-nopayload.html: the release payload removed, so the page's
  own lists are read (no ℗ anywhere: flagged);
- release-notice-nopayload-rec.html: the same, plus a native
  "phonographic copyright (℗) by:" list in track 2's row: not flagged.

The added relationships name CBS, Inc. (label 27795d9f), the real holder on
the other Springsteen releases of the probe.

Usage:
    python3 scripts/make-release-notice-fixtures.py [debug/rn-blinded.html]
"""
import json
import re
import sys

OUT = 'tests/fixtures/release-notice{}.html'
CBS = {'gid': '27795d9f-3994-4643-9cd2-c5f2b304472d', 'name': 'CBS, Inc.'}
SCRIPT_RE = re.compile(r'(<script type="application/json">)(.*?)(</script>)', re.S)


def find_payload(html):
    """(match, parsed) of the release payload script."""
    for m in SCRIPT_RE.finditer(html):
        body = m.group(2)
        if '"mediums"' not in body:
            continue
        try:
            p = json.loads(body)
        except ValueError:
            continue
        if isinstance(p, dict) and isinstance(p.get('release'), dict) and p['release'].get('mediums'):
            return m, p
    sys.exit('no release payload')


def put_payload(html, m, p):
    """The page with the payload script's body replaced (None: the script removed)."""
    if p is None:
        return html[:m.start()] + html[m.end():]
    body = json.dumps(p, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    return html[:m.start()] + m.group(1) + body + m.group(3) + html[m.end():]


def rel(link_type_id, target_type):
    """A minimal payload relationship to CBS, Inc."""
    return {'linkTypeID': link_type_id, 'target_type': 'label', 'backward': True, 'entityType': 'relationship',
            'target': {'entityType': 'label', 'gid': CBS['gid'], 'name': CBS['name']},
            'attributes': [], 'editsPending': False, 'ended': False, 'id': 99000000 + link_type_id,
            'source_type': target_type}


def native_ars(html):
    """Track 2's row gets a native ℗ list after its title cell's last dl.ars (or into it)."""
    p_dl = ('<dl class="ars"><dt>phonographic copyright (℗) by:</dt><dd><span class="labellink"></span>'
            f'<a class="wrap-anywhere" href="/label/{CBS["gid"]}"><bdi>{CBS["name"]}</bdi></a></dd></dl>')
    rows = [m for m in re.finditer(r'<tr class="(?:odd|even)[^"]*" id="[0-9a-f-]{36}">', html)]
    if len(rows) < 2:
        sys.exit('fewer than two track rows')
    start = rows[1].end()
    end = html.index('</tr>', start)
    # The title cell is the second td; the list goes at its end.
    tds = [m.end() for m in re.finditer(r'<td[^>]*>', html[start:end])]
    if len(tds) < 2:
        sys.exit('track row without a title cell')
    title_end = html.index('</td>', start + tds[1])
    return html[:title_end] + p_dl + html[title_end:]


def main():
    """Write the six fixtures."""
    src = sys.argv[1] if len(sys.argv) > 1 else 'debug/rn-blinded.html'
    html = open(src, encoding='utf-8').read()
    if '℗ 1973 CBS, Inc.' not in html:
        sys.exit('not the Blinded by the Light page')
    m, _ = find_payload(html)
    out = {'': html}

    q = json.loads(m.group(2))
    q['release']['mediums'][0]['tracks'][1]['recording'].setdefault('relationships', []).append(rel(867, 'recording'))
    out['-rec-rel'] = put_payload(html, m, q)

    q = json.loads(m.group(2))
    q['release'].setdefault('relationships', []).append(rel(711, 'release'))
    out['-own-rel'] = put_payload(html, m, q)

    q = json.loads(m.group(2))
    q['release']['mediums'][0]['track_count'] = 3
    out['-incomplete'] = put_payload(html, m, q)

    out['-nopayload'] = put_payload(html, m, None)
    out['-nopayload-rec'] = native_ars(out['-nopayload'])

    for k, text in out.items():
        path = OUT.format(k)
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(text)
        print(f'wrote {path} ({len(text)} chars)')


if __name__ == '__main__':
    main()
