#!/usr/bin/env python3
"""Probe: what a MusicBrainz /ws/2 answer carries for the shared request gate.

The shared gate (`_mbGateAnswer()` in ShowAllEntityData.user.js, ported from
majkinetor's mb-gate.mjs) reads exactly two things from an answer: the status
(429/503 hold everyone; anything else below 500 cools `hot`) and the raw
`Retry-After` header (seconds or an HTTP date, with a 1 s floor because
MusicBrainz is known to send `Retry-After: 0`). It deliberately does NOT steer
by `X-RateLimit-*`: majkinetor documents those as server-wide budgets
("X-RateLimit-Who: search-shed"), not this client's.

This probe checks those three facts against the live endpoint, politely: a
handful of lookups at the documented ~1 request/second
(https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting), never a burst,
so it observes a 503 only if the server is already shedding load. It is a
shape probe, not a load test. Record its output next to `_mbGateAnswer()`.

Usage:
    python3 scripts/probe-ws2-throttle-shape.py [--count N] [--gap SECONDS] [--ipv4]

Network: musicbrainz.org only. On vzell-lap, WSL's IPv4 has been TLS-reset by
MetaBrainz before; `--ipv4` forces it to show that case explicitly.
"""
import argparse
import json
import socket
import sys
import time
import urllib.error
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 ( https://github.com/vzell/mb-userscripts )'
# Stable, small lookups (Bruce Springsteen; the "Born to Run" release group).
URLS = [
    'https://musicbrainz.org/ws/2/artist/70248960-cb53-4ea4-943a-edb18f7d336f?fmt=json',
    'https://musicbrainz.org/ws/2/release-group/39b22944-7503-3937-8bba-09b17281cc6a?fmt=json',
]
WATCH = ('retry-after', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'x-ratelimit-who')


def force_ipv4():
    """Make urllib resolve musicbrainz.org to IPv4 addresses only."""
    orig = socket.getaddrinfo

    def v4(host, *a, **k):
        return [r for r in orig(host, *a, **k) if r[0] == socket.AF_INET]
    socket.getaddrinfo = v4


def ask(url):
    """One GET; returns (status, {watched header: value}, elapsed ms)."""
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    t0 = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            status, headers = r.status, r.headers
    except urllib.error.HTTPError as e:
        status, headers = e.code, e.headers
    except (urllib.error.URLError, OSError) as e:
        return 0, {'error': str(e)}, round((time.monotonic() - t0) * 1000)
    seen = {k: headers.get(k) for k in WATCH if headers.get(k) is not None}
    return status, seen, round((time.monotonic() - t0) * 1000)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--count', type=int, default=10)
    ap.add_argument('--gap', type=float, default=1.1, help='seconds between request starts (>= 1.0)')
    ap.add_argument('--ipv4', action='store_true')
    a = ap.parse_args()
    if a.gap < 1.0:
        sys.exit('refusing a gap under 1 s: MusicBrainz asks for about one request a second')
    if a.ipv4:
        force_ipv4()
    rows = []
    for i in range(a.count):
        t = time.monotonic()
        status, seen, ms = ask(URLS[i % len(URLS)])
        rows.append({'i': i, 'status': status, 'ms': ms, **seen})
        print(json.dumps(rows[-1]))
        left = a.gap - (time.monotonic() - t)
        if left > 0 and i + 1 < a.count:
            time.sleep(left)
    by = {}
    for r in rows:
        by[r['status']] = by.get(r['status'], 0) + 1
    print('summary:', json.dumps({
        'statuses': by,
        'retryAfterSeen': sorted({r['retry-after'] for r in rows if 'retry-after' in r}),
        'rateLimitHeadersSeen': sorted({k for r in rows for k in r if k.startswith('x-ratelimit')}),
    }))


if __name__ == '__main__':
    main()
