#!/usr/bin/env python3
"""Probes two ways to find a story page's event page with ONE ListPages call
(org/brucebase.org Phase 12), signed out, 1 s apart:

  - `name` = the story's slug, `category` = the five event categories;
  - `link_to` = the story page (does the event page link or include it?).

For a few story pages (a gig, a speech, a DJ set, a truncated name),
prints what each call returns and how long it took.

    python3 scripts/probe-bb-story-lookup.py
"""
import json
import re
import time
import urllib.parse
import urllib.request

BASE = 'https://brucebase.wikidot.com'
TOKEN = 'saprobe'
UA = 'ShowAllEntityData-probe/1.0 (+https://github.com/vzell/mb-userscripts)'
STORIES = [
    'story:story-1978-09-15-palladium-new-york-city-ny',
    'story:speech-2026-10-17-hackensack-meridian-health-theatre-r',
    'story:dj-2020-04-08-siriusxm-studio-new-york-city-ny',
    'story:eulogy-2008-04-21a-united-methodist-church-red-bank-nj',
    'story:about-bob-dylan',
]
_last = [0.0]


def post(params):
    """One ListPages call, 1 s after the previous one; (body, seconds)."""
    wait = 1.0 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    body = urllib.parse.urlencode({**params, 'moduleName': 'list/ListPagesModule', 'wikidot_token7': TOKEN}).encode()
    req = urllib.request.Request(BASE + '/ajax-module-connector.php', data=body, headers={
        'User-Agent': UA, 'Cookie': f'wikidot_token7={TOKEN}',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    })
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=60) as res:
        js = json.loads(res.read().decode('utf-8'))
    _last[0] = time.time()
    return (js.get('body') or js.get('message') or js.get('status')), _last[0] - t0


def items(body):
    """The template's items."""
    t = re.sub(r'<[^>]+>', '', body)
    return [x.strip() for x in t.split('␃') if '␂' in x]


def main():
    """Runs both lookups for every story."""
    tpl = '%%fullname%%␂%%title%%␃'
    for s in STORIES:
        slug = s.split(':', 1)[1]
        slug = re.sub(r'^[a-z]+-', '', slug)
        b, t = post({'category': 'gig nogig recording rehearsal interview', 'name': slug, 'perPage': 5, 'separate': 'false', 'module_body': tpl})
        print(f'{s}\n   name={slug}: {items(b) or b[:200]!r} ({t:.1f} s)')
        b, t = post({'category': '*', 'link_to': s, 'perPage': 5, 'separate': 'false', 'module_body': tpl})
        print(f'   link_to: {items(b) or b[:200]!r} ({t:.1f} s)')


if __name__ == '__main__':
    main()
