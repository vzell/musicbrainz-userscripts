#!/usr/bin/env python3
"""Probe: what Wikidata's API says when it refuses (HTTP 429), and when it lets go.

probe-area-images.py met 429s after about 19 wbgetclaims at one a second
(2026-11-23). This sends the same kind of request (Q30's P242, P41, P94, P158,
P18 in turn) one a second until the first 429, prints that answer's status
and headers (Retry-After above all), then asks once every 5 s until an answer
is 200 again and prints how long the refusal lasted. At most 40 requests
before the first 429 and 24 after it. Anonymous, a generic User-Agent.

Usage: python3 scripts/probe-wikidata-429.py
"""
import time
import urllib.error
import urllib.parse
import urllib.request

UA = 'SAED-probe/1.0 (userscript development probe)'
PROPS = ['P242', 'P41', 'P94', 'P158', 'P18']


def ask(i):
    """One wbgetclaims; (status, headers)."""
    url = 'https://www.wikidata.org/w/api.php?' + urllib.parse.urlencode(
        {'action': 'wbgetclaims', 'format': 'json', 'entity': 'Q30', 'property': PROPS[i % 5]})
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Api-User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read()
            return r.status, dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers)


def main():
    first = None
    for i in range(40):
        st, h = ask(i)
        print(f'{i + 1:>3} {time.strftime("%H:%M:%S")} {st}')
        if st == 429:
            first = time.time()
            print('    headers:', {k: v for k, v in h.items() if k.lower() in (
                'retry-after', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'content-type', 'server')})
            break
        time.sleep(1.0)
    if first is None:
        print('no 429 in 40 requests')
        return
    for j in range(24):
        time.sleep(5)
        st, h = ask(j)
        print(f'  +{int(time.time() - first):>3} s {st}' + (f'  retry-after {h.get("Retry-After")}' if st == 429 else ''))
        if st == 200:
            print(f'refusal lasted about {int(time.time() - first)} s')
            return
    print('still refused after 2 minutes')


if __name__ == '__main__':
    main()
