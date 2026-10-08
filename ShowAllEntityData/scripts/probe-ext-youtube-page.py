"""U1 follow-up (org/iframe.org, "* generalize to URLs"): what does an
anonymous request for a YouTube playlist PAGE get, and where in it are the
tags the generic reader looks for?

Reported 2026-10-08 from a real browser: the playlist link of the event
annotation got a card titled with the link's own text ("YouTube Playlist"),
no description, status "moved" (the final URL had gained
"&cbrd=1&ucbcb=1"), 989 KB of HTML, and an empty Live page. This probe asks
the same URL without cookies, as `_extFetch()` does (`anonymous: true`),
with a browser User-Agent, and reports: the redirect chain, the final URL,
the size, the byte offset of `<title>`, of each og: tag and of `</head>`
(against the 512 KB cap), whether the page is a consent page, and how much
of it is script.

usage: python3 scripts/probe-ext-youtube-page.py [URL]
       (one request; the redirects it follows are logged)
"""
import re
import sys
import time
import urllib.error
import urllib.request

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36')
URL = 'https://www.youtube.com/playlist?list=PLM0aPYPhFzkq16BnNlrlAIcVvN1_TBmcS'
CAP = 512 * 1024


class _Chain(urllib.request.HTTPRedirectHandler):
    """Records every redirect (status, Location) of one request."""

    def __init__(self):
        super().__init__()
        self.hops = []

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        """Keeps the hop, then follows it as urllib normally does."""
        self.hops.append((code, newurl))
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def main():
    """Fetches the page once and reports where its tags are."""
    url = sys.argv[1] if len(sys.argv) > 1 else URL
    print(f'probe-ext-youtube-page · {time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())}')
    chain = _Chain()
    # No cookie handler at all: nothing is sent and nothing kept, as anonymous: true.
    opener = urllib.request.build_opener(chain)
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'en-GB,en;q=0.9,de;q=0.8'})
    t0 = time.time()
    try:
        with opener.open(req, timeout=60) as r:
            status, final, body = r.status, r.geturl(), r.read()
    except urllib.error.HTTPError as e:
        status, final, body = e.code, url, e.read()
    ms = round((time.time() - t0) * 1000)
    html = body.decode('utf-8', 'replace')
    print(f'HTTP {status} · {len(body):,} bytes · {ms} ms')
    for code, loc in chain.hops:
        print(f'  redirect {code} → {loc}')
    print(f'final: {final}')

    def at(pattern):
        """Byte offset of the first match, or None."""
        m = re.search(pattern, html, re.I | re.S)
        return len(html[:m.start()].encode('utf-8')) if m else None

    def show(label, off):
        """One offset line, held against the cap."""
        where = 'ABSENT' if off is None else f'{off:,} bytes ({"inside" if off <= CAP else "PAST"} 512 KB)'
        print(f'  {label:<24} {where}')

    print('where things are:')
    show('<title>', at(r'<title'))
    for name in ('og:title', 'og:description', 'og:image', 'og:site_name', 'og:type', 'description'):
        show(name, at(r'<meta[^>]+(?:property|name)="' + re.escape(name) + r'"'))
    show('</head>', at(r'</head>'))
    t = re.search(r'<title[^>]*>(.*?)</title>', html, re.I | re.S)
    print(f'title text: {t.group(1).strip()[:100] if t else None!r}')
    m = re.search(r'<meta[^>]+property="og:title"[^>]+content="([^"]*)"', html, re.I)
    print(f'og:title: {m.group(1)[:100] if m else None!r}')
    consent = re.search(r'consent\.(?:youtube|google)\.com|before you continue|bevor sie zu youtube', html, re.I)
    print(f'consent page markers: {consent.group(0) if consent else "none"}')
    scripts = sum(len(s) for s in re.findall(r'<script\b.*?</script>', html, re.I | re.S))
    print(f'inline/external <script> blocks: {scripts:,} characters of {len(html):,} ({100 * scripts // max(1, len(html))} %)')
    preloads = re.findall(r'<link[^>]+rel="(?:preload|modulepreload|prefetch|preconnect|dns-prefetch)"[^>]*>', html, re.I)
    print(f'<link rel=preload/modulepreload/prefetch/preconnect>: {len(preloads)}')
    for p in preloads[:5]:
        print(f'  {p[:140]}')


if __name__ == '__main__':
    main()
