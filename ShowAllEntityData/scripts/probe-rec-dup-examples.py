#!/usr/bin/env python3
"""Dump an artist's recordings for the rec-dup finding's examples and bucketing check.

The "Possible duplicate recording" finding (org/majkinetor.org, "Possible duplicate
recordings (Fusion's algorithm, zero requests)") ports Fusion's gates and needs real
data to show which groups it finds on a big page, and whether the bucketed pair search
finds the same groups as all pairs. This probe makes the requests the finding itself
never makes: one recording browse per 100 recordings,

    /ws/2/recording?artist=<MBID>&inc=artist-credits+isrcs&limit=100&offset=N&fmt=json

(browse inc values per https://musicbrainz.org/doc/MusicBrainz_API: recording browse
takes artist-credits and isrcs; limit at most 100; checked 2026-11-20). The doc names no
response fields, so the dump records which of title/length/video/disambiguation each
page carried.

Requests are spaced >= 1.5 s and retried on 429/502/503 up to ten times, backing off to 60 s
(the documented ~1 req/s; on the evening of 2026-11-20 six tries spaced 1.1 s were not enough).
Resumable: each page is appended to a checkpoint, so an interrupted run continues
where it stopped. The User-Agent is generic and carries no contact details.

Output (gitignored): debug/probe-rec-dup/<MBID>.json.gz, one record per recording:
{id, title, length, video, disambiguation, isrcs, ac: [[artist id, credited name,
join phrase], ...]}, plus the run's Env and the field presence counts.

usage: python3 scripts/probe-rec-dup-examples.py <artist MBID> [<artist MBID> ...]
       e.g. 70248960-cb53-4ea4-943a-edb18f7d336f (Bruce Springsteen, ~74,600 recordings,
       ~750 requests, ~20 min) and f93dbc64-6f08-4033-bcc7-8a0bb4689849 (Tom Petty and
       the Heartbreakers, the committed perf fixture's artist)
"""
import gzip
import json
import os
import platform
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

UA = 'userscript-probe/1.0'
BASE = 'https://musicbrainz.org/ws/2'
OUT_DIR = 'debug/probe-rec-dup'
_last = [0.0]
SPACING = 1.5
_stats = {'retries': 0}


def berlin_now():
    """Berlin time with offset, as the project's notes store it."""
    return subprocess.run(['date', '+%FT%T%:z'], env={**os.environ, 'TZ': 'Europe/Berlin'},
                          capture_output=True, text=True, check=True).stdout.strip()


def fetch(url, tries=10):
    """GET JSON, spaced >= SPACING s, retried on 429/502/503 and network errors (backoff up to 60 s); None on failure."""
    for attempt in range(tries):
        wait = SPACING - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code not in (429, 502, 503):
                print(f'  HTTP {e.code} for {url}', file=sys.stderr)
                return None
        except Exception as e:                                   # noqa: BLE001
            print(f'  {type(e).__name__} for {url}', file=sys.stderr)
        _stats['retries'] += 1
        time.sleep(min(60, 3 * 2 ** attempt))
    return None


def slim(r):
    """One browse recording reduced to the fields the finding's adapter reads from the page."""
    return {
        'id': r.get('id'),
        'title': r.get('title'),
        'length': r.get('length'),
        'video': r.get('video'),
        'disambiguation': r.get('disambiguation') or '',
        'isrcs': r.get('isrcs') or [],
        'ac': [[(c.get('artist') or {}).get('id'), c.get('name'), c.get('joinphrase') or '']
               for c in r.get('artist-credit') or []],
    }


def dump_artist(mbid):
    """Browse every recording of one artist into OUT_DIR, resuming from the checkpoint."""
    os.makedirs(OUT_DIR, exist_ok=True)
    ckpt = os.path.join(OUT_DIR, f'{mbid}.pages.jsonl')
    done = {}
    if os.path.exists(ckpt):
        with open(ckpt, encoding='utf-8') as f:
            for line in f:
                p = json.loads(line)
                done[p['offset']] = p
    started = berlin_now()
    total = None
    offset = 0
    while True:
        if offset in done:
            page = done[offset]
        else:
            url = f'{BASE}/recording?artist={mbid}&inc=artist-credits+isrcs&limit=100&offset={offset}&fmt=json'
            j = fetch(url)
            if j is None:
                print(f'{mbid}: page at offset {offset} failed; re-run to resume', file=sys.stderr)
                return 1
            recs = j.get('recordings') or []
            page = {'offset': offset, 'count': j.get('recording-count'),
                    'fields': {k: sum(1 for r in recs if k in r) for k in ('title', 'length', 'video', 'disambiguation', 'isrcs', 'artist-credit')},
                    'n': len(recs), 'recs': [slim(r) for r in recs]}
            with open(ckpt, 'a', encoding='utf-8') as f:
                f.write(json.dumps(page, ensure_ascii=False) + '\n')
            done[offset] = page
        total = page['count'] if total is None else total
        if offset % 5000 == 0:
            print(f'{mbid}: {offset}/{total}', flush=True)
        if page['n'] == 0 or offset + page['n'] >= (total or 0):
            break
        offset += page['n']
    recs, seen, fields = [], set(), {}
    for off in sorted(done):
        for k, v in done[off]['fields'].items():
            fields[k] = fields.get(k, 0) + v
        for r in done[off]['recs']:
            if r['id'] not in seen:          # a browse can repeat a row across page edges
                seen.add(r['id'])
                recs.append(r)
    osr = {}
    try:
        with open('/etc/os-release', encoding='utf-8') as f:
            osr = dict(line.strip().split('=', 1) for line in f if '=' in line)
    except OSError:
        pass
    env = {'started': started, 'finished': berlin_now(), 'host': socket.gethostname(),
           'os': f"{osr.get('PRETTY_NAME', '?').strip(chr(34))} (Linux {platform.release()})", 'browser': 'n/a'}
    out = os.path.join(OUT_DIR, f'{mbid}.json.gz')
    with gzip.open(out, 'wt', encoding='utf-8') as f:
        json.dump({'artist': mbid, 'recordingCount': total, 'pages': len(done), 'fields': fields,
                   'env': env, 'recordings': recs}, f, ensure_ascii=False)
    print(f'{mbid}: {len(recs)} recordings (count {total}), {len(done)} pages, {_stats["retries"]} retries so far, fields {fields} -> {out}')
    return 0


def main():
    """Dump each artist given on the command line."""
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    rc = 0
    for mbid in sys.argv[1:]:
        rc |= dump_artist(mbid)
    return rc


if __name__ == '__main__':
    sys.exit(main())
