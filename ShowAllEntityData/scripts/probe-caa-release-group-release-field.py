#!/usr/bin/env python3
"""Does a Cover Art Archive RELEASE-GROUP lookup really carry `images[].release`?

org/503-handling.org's zone 2 table says `/release-group/{mbid}` "returns the
same image shape and adds a `release` field — the specific release from which
the art was sourced", and the artwork summary panel's "Cover sourced from"
group is built on that. But that row was filled in from the API DOCUMENTATION
on 2026-09-19, not from a probe, and the root CLAUDE.md is explicit that the
docs describe intent and several endpoints behave differently.

Live evidence says otherwise: on a fully loaded artist-releasegroups page the
group does not appear. Two candidate explanations, and they need different
fixes, so guessing between them is not on:

  (a) the archive does not return `release` after all, or returns it somewhere
      other than on each image  -> the panel's group is built on a fiction and
      should be removed, and the org table corrected;
  (b) it does return it, and the page simply never does a release-GROUP lookup
      (its art anchors point at releases)  -> the group is correct but
      unreachable there, which is a different note entirely.

This probe answers (a). It fetches one release-group and one release and prints
the key set of the first image of each.

    python3 scripts/probe-caa-release-group-release-field.py

No rate-limiting rules are published for coverartarchive.org and there is no
batch endpoint (same doc, same date), so this is deliberately two requests.
"""

import io
import json
import sys
import urllib.error
import urllib.request

# "Tougher Than the Rest" — the release group the committed
# releasegroup-releases fixture is captured from, so anything learned here can
# be checked against that fixture.
RELEASE_GROUP = 'f83d2211-dd81-4b1e-9a02-e89733891e1c'
# One of its releases, for the shape to compare against.
RELEASE = '76df3287-6cda-33eb-8e9a-044b5e15ffdd'

UA = 'ShowAllEntityData-probe/1.0 ( https://github.com/vzell/musicbrainz-userscripts )'


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception as e:                                   # noqa: BLE001
        print('  ERROR %s' % e)
        return 0, None


def report(label, url):
    status, data = fetch(url)
    print('%s\n  %s\n  HTTP %s' % (label, url, status))
    if not data:
        return None
    images = data.get('images') or []
    print('  images: %d' % len(images))
    if not images:
        return None
    first = images[0]
    print('  first image keys: %s' % sorted(first.keys()))
    has = 'release' in first
    print('  has `release` on the image: %s' % has)
    if has:
        print('  release value: %s' % json.dumps(first['release'])[:200])
    # Also check whether every image carries it, not just the first.
    if images:
        n = sum(1 for i in images if 'release' in i)
        print('  images carrying `release`: %d of %d' % (n, len(images)))
    return has


def main():
    print('Cover Art Archive: is `release` present on a release-group lookup?\n')
    rg = report('RELEASE-GROUP lookup',
                'https://coverartarchive.org/release-group/%s' % RELEASE_GROUP)
    print()
    rel = report('RELEASE lookup',
                 'https://coverartarchive.org/release/%s' % RELEASE)
    print('\n== VERDICT ==')
    if rg is True:
        print('The org table is RIGHT: a release-group lookup carries `release`.')
        print('So the panel group is correct, and its absence on a real page means')
        print('that page never issues a release-GROUP lookup. Check what its art')
        print('anchors point at.')
    elif rg is False:
        print('The org table is WRONG: a release-group lookup carries NO `release`')
        print('on its images. The panel group is built on a fiction — remove it and')
        print('correct the table, citing this probe.')
    else:
        print('Inconclusive (no images, or the request failed). Re-run, or pick a')
        print('release group known to have art.')
    if rel is True:
        print('NOTE: the RELEASE lookup carries `release` too, which the docs do not say.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
