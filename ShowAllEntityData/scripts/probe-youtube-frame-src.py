"""Probe whether the pages the YouTube embeds would go on allow a YouTube
player frame (org/TODO.org "some more BB and MB fixes/enhancements" 2,
2026-10-25).

A userscript's <iframe src="https://www.youtube-nocookie.com/embed/..."> is
subject to the PAGE's Content-Security-Policy: `frame-src` (else
`child-src`, else `default-src`). This asks each page once and prints the
policy headers and what they say about youtube-nocookie.com / youtube.com.
A page without any of the three directives allows every frame.

usage: python3 scripts/probe-youtube-frame-src.py
"""
import re
import sys
import urllib.request

PAGES = [
    ('MusicBrainz recording', 'https://musicbrainz.org/recording/3e8d2331-3734-4f4b-b865-3313b7bf4303'),
    ('Discogs release', 'https://www.discogs.com/release/22770998'),
    ('Discogs master', 'https://www.discogs.com/master/26725-Bruce-Springsteen-Born-To-Run'),
    ('Brucebase gig', 'https://brucebase.wikidot.com/gig:2026-10-03-merriweather-post-pavilion-columbia-md'),
]
AGENT = 'ShowAllEntityData-probe/1.0 (+https://github.com/vzell/mb-userscripts)'
HOSTS = ('https://www.youtube-nocookie.com', 'https://www.youtube.com')


def directive(policy, name):
    """The source list of one CSP directive, or None when absent."""
    m = re.search(r'(?:^|;)\s*' + re.escape(name) + r'\s+([^;]*)', policy)
    return m.group(1).split() if m else None


def allows(sources, host):
    """Whether a CSP source list admits a frame from host (a coarse reading: *, the host, its scheme, a wildcard)."""
    if sources is None:
        return True
    bare = host.split('://', 1)[1]
    for s in sources:
        s = s.strip("'")
        if s in ('*', 'https:', host, bare):
            return True
        if s.startswith('*.') and bare.endswith(s[1:]):
            return True
        if s.startswith('https://*.') and bare.endswith(s[len('https://*'):]):
            return True
    return False


def main():
    for label, url in PAGES:
        req = urllib.request.Request(url, headers={'User-Agent': AGENT, 'Accept': 'text/html'})
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                status, headers = res.status, res.headers
        except urllib.error.HTTPError as e:
            status, headers = e.code, e.headers
        except Exception as e:  # network failure: report and go on
            print(f'{label}: request failed: {e}')
            continue
        csp = headers.get_all('Content-Security-Policy') or []
        ro = headers.get_all('Content-Security-Policy-Report-Only') or []
        print(f'== {label} ({status}) {url}')
        if not csp:
            print('   no Content-Security-Policy header: every frame allowed')
        for policy in csp:
            for name in ('frame-src', 'child-src', 'default-src'):
                src = directive(policy, name)
                if src is not None:
                    print(f'   {name}: {" ".join(src)[:300]}')
                    for host in HOSTS:
                        print(f'      {host}: {"allowed" if allows(src, host) else "BLOCKED"}')
                    break
            else:
                print('   CSP without frame-src/child-src/default-src: every frame allowed')
        if ro:
            print(f'   (report-only policy present, not enforced: {len(ro)})')
        xfo = headers.get('X-Frame-Options')
        if xfo:
            print(f'   X-Frame-Options: {xfo} (about framing THIS page, not about its frames)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
