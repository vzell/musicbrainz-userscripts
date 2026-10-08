"""U1 follow-up (org/iframe.org, "* generalize to URLs"): what is behind an
odd refusal of an anonymous request?

Reported 2026-10-08 from a real browser: us.7digital.com answered the
generic reader's anonymous GET with HTTP 405 (Method Not Allowed), for the
page and for /favicon.ico alike. A GET is never "not allowed" on a public
page, so this asks whether it is bot protection (as Cloudflare's 403 with
`cf-mitigated: challenge` is, U0 X6) and, if so, which vendor's marks it
carries — so the card can say "the site checks for a browser" instead of a
bare status.

For each URL: one request without cookies, with a browser User-Agent and a
browser's Accept headers; status, the headers that name a vendor (server,
x-cache, x-datadome, x-iinfo, x-amz-cf-*, akamai, cf-*, set-cookie names),
the body's <title> and the vendor marks found in it.

usage: python3 scripts/probe-ext-refusal.py [URL ...]
       (one request per URL, 1.1 s apart)
"""
import re
import sys
import time
import urllib.error
import urllib.request

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36')
DEFAULTS = ['https://us.7digital.com/artist/bruce-springsteen', 'https://us.7digital.com/favicon.ico']
MARKS = {
    'DataDome': r'datadome|captcha-delivery\.com',
    'PerimeterX / HUMAN': r'px-captcha|perimeterx|_pxhd|human security',
    'Imperva / Incapsula': r'incapsula|_incap_|imperva',
    'Akamai': r'akamai|ak_bmsc|bm_sz|_abck|reference #\d',
    'AWS WAF / CloudFront': r'awswaf|aws-waf-token|cloudfront|x-amz-cf',
    'Cloudflare': r'cloudflare|cf-ray|cf_chl|just a moment',
    'Kasada': r'kasada|x-kpsdk',
    'generic challenge words': r'captcha|are you a robot|verify you are human|access denied|request blocked',
}


def probe(url):
    """One request; prints what names the refusal."""
    req = urllib.request.Request(url, headers={
        'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9,de;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    })
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            status, headers, body = r.status, r.headers, r.read()
    except urllib.error.HTTPError as e:
        status, headers, body = e.code, e.headers, e.read()
    ms = round((time.time() - t0) * 1000)
    text = body.decode('utf-8', 'replace')
    print(f'\n# {url}\n  HTTP {status} · {len(body):,} bytes · {ms} ms')
    for k, v in headers.items():
        if re.match(r'(server|x-cache|x-datadome|x-iinfo|x-amz|x-akamai|akamai|cf-|x-cdn|via|x-served-by|allow|content-type|x-kpsdk)', k, re.I):
            print(f'  {k}: {v[:120]}')
    cookies = [c.split('=')[0] for c in (headers.get_all('Set-Cookie') or [])]
    if cookies:
        print(f'  set-cookie names: {", ".join(cookies)}')
    t = re.search(r'<title[^>]*>(.*?)</title>', text, re.I | re.S)
    print(f'  title: {t.group(1).strip()[:100] if t else None!r}')
    blob = text + '\n' + '\n'.join(f'{k}: {v}' for k, v in headers.items())
    found = [name for name, rx in MARKS.items() if re.search(rx, blob, re.I)]
    print(f'  vendor marks: {", ".join(found) or "none"}')
    start = re.sub(r'\s+', ' ', text[:300])
    print(f'  body starts: {start!r}')


def main():
    """Probes the URLs given, or the 7digital page and icon."""
    print(f'probe-ext-refusal · {time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())}')
    for i, u in enumerate(sys.argv[1:] or DEFAULTS):
        if i:
            time.sleep(1.1)
        probe(u)


if __name__ == '__main__':
    main()
