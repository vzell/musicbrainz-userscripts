#!/usr/bin/env python3
"""Measure the Apollo findings, batch 4, on real MusicBrainz releases.

org/majkinetor.org, "Batch 4": three release-wide candidates, each judged on
data before any UI is designed for them (the TODO says "a probe first, and
possibly a NOT with its numbers").

1. First Contact's type guess (first_contact.user.js guessReleaseType(), 309,
   at majkinetor's 0693aea): the guess from the title, the track count and the
   total length, compared with the release group's primary type.
2. First Contact's "looks like a VA compilation" (variousArtistsWhy(), 418):
   the release's artists on fewer than half the tracks, and five or more first
   track artists.
3. Group Therapy's copyright notices (group_therapy.user.js
   txpParseCopyrightLine(), 7073, txpSplitCompoundCopyrightLines(), 7192): a
   ℗/© line in the release's annotation, compared with the release's
   "phonographic copyright" / "copyright" relationships (label and artist).

Sources (/ws/2; https://musicbrainz.org/doc/MusicBrainz_API, read 2026-11-19):
- browse releases by artist or label, inc=recordings+artist-credits+
  release-groups+annotation (all listed for a release browse; "annotation" is
  a Misc include every entity supports). Relationship includes on a browse are
  not documented as allowed, so the relationships of a release with a notice
  come from one lookup each (inc=label-rels+artist-rels);
- an annotation search (https://musicbrainz.org/doc/MusicBrainz_API/Search,
  core "annotation", fields type/text/entity) for releases whose annotation
  says "copyright" or "(p)", because a browse sample meets few annotations.
  The search server answered 503 all of 2026-11-19 evening; the probe goes on
  without it and says so.

Paced at one request per 1.1 s, a 503 retried six times (5 s … 30 s apart)
(https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting).

Usage:
    python3 scripts/probe-apollo-findings-4.py [--budget N] [--pages N]
        [--out debug/probe-apollo-findings-4.json]
"""
import argparse
import http.client
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 (+https://github.com/vzell/mb-userscripts)'
WS = 'https://musicbrainz.org/ws/2/'
VA = '89ad4ac3-39f7-470e-963a-56509c546377'
_last = [0.0]
_count = [0]

# Browse seeds: a rock catalogue with singles and EPs (Springsteen, the same seed
# as batch 2), and names resolved by search when it answers.
SEED_ARTISTS = [('70248960-cb53-4ea4-943a-edb18f7d336f', 'Bruce Springsteen')]
SEARCH_ARTISTS = ['The Beatles', 'Elvis Presley', 'Aphex Twin', 'Taylor Swift', 'Armin van Buuren', 'Paul Oakenfold']
SEARCH_LABELS = ['Ace Records', 'K-tel', 'Ministry of Sound', 'Hyperdub']

# The MusicBrainz special-purpose artists (Apollo 460 / GT 6660 MBM_SPECIAL_PURPOSE).
SPECIAL = {
    '125ec42a-7229-4250-afc5-e057484327fe', 'f731ccc4-e22a-43af-a747-64213329e088',
    '33cf029c-63b0-41a0-9855-be2a3665fb3b', '314e1c25-dde7-4e4d-b2f4-0a7b9f7c56dc',
    'eec63d3c-3b81-4ad4-b1e4-7c147d4d2b61', '9be7f096-97ec-4615-8957-8d40b5dcbc41',
    '89ad4ac3-39f7-470e-963a-56509c546377', '7e84f845-ac16-41fe-9ff8-df12eb32af55',
    '66ea0139-149f-4a0c-8fbf-5ea9ec4a6e49', 'a0ef7e1d-44ff-4039-9435-7d5fefdeecc9',
    '90068d37-bae7-4292-be4a-704c145bd616', '80a8851f-444c-4539-892b-ad2a49292aa9',
}


def get(path, params):
    """One paced /ws/2 GET, JSON; None on a 404 or after six 503s."""
    q = dict(params, fmt='json')
    url = WS + path + '?' + urllib.parse.urlencode(q)
    for attempt in range(7):
        wait = 1.1 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        _count[0] += 1
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code in (503, 429) and attempt < 6:
                time.sleep(5 * (attempt + 1))
                continue
            print(f'[error] {e.code} {url}', flush=True)
            return None
        except (urllib.error.URLError, TimeoutError, http.client.HTTPException, ConnectionError):
            if attempt < 6:
                time.sleep(3)
                continue
            print(f'[error] network {url}', flush=True)
            return None
    return None


# ── First Contact, ported one-for-one (first_contact.user.js 300–336, 418–429) ──

TYPE_VERSION_MARKER = re.compile(
    r'\b(?:a ?cap+el+a|acoustic|alt(?:ernate)?|bootleg|clean|club|demo|dirty|dub|edit|explicit|extended|'
    r'instrumental|karaoke|live|mix|mono|original|radio|remaster(?:ed)?|remix|rework|short|slowed|'
    r'sped[ -]up|stereo|version|vip|vocal)\b', re.I)


def norm_track_title(title):
    """normTrackTitle(): a title without its version marker, letters and digits only."""
    s = unicodedata.normalize('NFKC', title or '').lower()
    s = re.sub(r'\s*[(\[{]([^\])}]*?)[\])}]', lambda m: '' if TYPE_VERSION_MARKER.search(m.group(1)) else m.group(0), s)
    s = re.sub(r'\s*[-–—:]\s*([^\n]*)$', lambda m: '' if TYPE_VERSION_MARKER.search(m.group(1)) else m.group(0), s)
    s = re.sub(r'[\W_]+', ' ', s)
    return s.strip()


def guess_release_type(title, tracks):
    """guessReleaseType(): {type, why, explicit}."""
    n = len(tracks)
    if not n:
        return {'type': None, 'why': 'no tracks'}
    t = title or ''
    lengths = [x['length'] for x in tracks]
    ms = sum(lengths) if all(l and l > 0 for l in lengths) else None
    mins = ms / 60000 if ms is not None else None
    if re.search(r'(?:^|[\s(\[\-–])E\.?P\b\.?', t, re.I):
        return {'type': 'EP', 'why': 'the title says EP', 'explicit': True}
    if re.search(r'[\s(\[\-–]single\s*[)\]]?$', t, re.I):
        return {'type': 'Single', 'why': 'the title ends in Single', 'explicit': True}
    if re.search(r'\bsingle\b', t, re.I) and n <= 8 and not (mins is not None and mins > 50):
        return {'type': 'Single', 'why': 'the title says Single', 'explicit': True}
    if n >= 2:
        norm = [norm_track_title(x['title']) for x in tracks]
        if norm[0] and all(x == norm[0] for x in norm):
            return {'type': 'Single', 'why': 'every track is one song in another version'}
    if mins is None:
        if n == 1:
            return {'type': 'Single', 'why': 'one track'}
        if 3 <= n <= 6:
            return {'type': 'EP', 'why': f'{n} tracks'}
        if n >= 7:
            return {'type': 'Album', 'why': f'{n} tracks'}
        return {'type': None, 'why': 'two tracks without lengths'}
    if n >= 7:
        return {'type': 'Album', 'why': f'{n} tracks'}
    if mins > 30:
        return {'type': 'Album', 'why': 'over 30 minutes'}
    if mins < 1:
        return {'type': None, 'why': 'under a minute'}
    if mins <= 7:
        return {'type': 'Single', 'why': 'up to 7 minutes'}
    if n >= 2:
        return {'type': 'EP', 'why': '2-6 tracks, 7-30 minutes'}
    return {'type': None, 'why': 'one long track'}


def norm_name(s):
    """normName(): case and accents folded, punctuation dropped (a close enough port)."""
    s = unicodedata.normalize('NFKD', s or '')
    s = ''.join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r'[\W_]+', ' ', s).strip()


def various_artists_why(credit, tracks):
    """variousArtistsWhy(): why the release looks like a VA compilation, or None."""
    if not credit or any(c['id'] == VA for c in credit):
        return None
    if len(tracks) < 5:
        return None
    mains = {norm_name(c['name']) for c in credit}
    on = sum(1 for t in tracks if any(norm_name(c['name']) in mains for c in t['credit']))
    artists = {norm_name(t['credit'][0]['name']) for t in tracks if t['credit']}
    if on * 2 >= len(tracks) or len(artists) < 5:
        return None
    return f'{", ".join(c["name"] for c in credit)} on {on} of {len(tracks)} tracks, {len(artists)} track artists'


# ── Group Therapy's notice parser (group_therapy.user.js 7040–7220) ──

MARKER_ALT = (r'(?:marketed\s+and\s+distributed\s+by'
              r'|under\s+(?:exclusive\s+)?licen[sc]e\s+to|licen[sc]ed\s+to'
              r'|under\s+(?:exclusive\s+)?licen[sc]e\s+from|licen[sc]ed\s+from'
              r'|distributed\s+by|marketed\s+by'
              r'|℗|\(p\)|phonographic\s+copyright'
              r'|©|\(c\)|copyright)')
GLUE = r'\s,.:;&+/‐–—-'


def split_compound(line):
    """txpSplitCompoundCopyrightLines() for one line: cut at every later marker with ≥ 3 word characters before it."""
    pos = [(m.start(), m.end()) for m in re.finditer(MARKER_ALT, line, re.I)]
    if len(pos) < 2:
        return [line]
    cuts = [pos[i][0] for i in range(1, len(pos)) if len(re.findall(r'\w', line[pos[i - 1][1]:pos[i][0]])) >= 3]
    if not cuts:
        return [line]
    out, last = [], 0
    for c in cuts:
        out.append(line[last:c].strip())
        last = c
    out.append(line[last:].strip())
    return out


def parse_notice(line):
    """txpParseCopyrightLine(): {types, year, holders} or None."""
    s = line.strip()
    types = []
    if re.search(r'℗|\(p\)|\bphonographic\s+copyright\b', s, re.I):
        types.append('phonographic')
    sans = re.sub(r'℗|\(p\)|\bphonographic\s+copyright\b', ' ', s, flags=re.I)
    if re.search(r'©|\(c\)|\bcopyright\b', sans, re.I):
        types.append('copyright')
    if re.search(r'\bunder\s+(?:exclusive\s+)?licen[sc]e\s+to\b|\blicen[sc]ed\s+to\b', s, re.I):
        types.append('licensee')
    if re.search(r'\bunder\s+(?:exclusive\s+)?licen[sc]e\s+from\b|\blicen[sc]ed\s+from\b', s, re.I):
        types.append('licensor')
    if re.search(r'\bmarketed\s+and\s+distributed\s+by\b', s, re.I):
        types += ['marketed', 'distributed']
    else:
        if re.search(r'\bdistributed\s+by\b', s, re.I):
            types.append('distributed')
        if re.search(r'\bmarketed\s+by\b', s, re.I):
            types.append('marketed')
    if not types:
        return None
    lead = re.compile(rf'^(?:[{GLUE}]|and\b)*{MARKER_ALT}', re.I)
    rest = s
    while lead.search(rest):
        rest = lead.sub('', rest, count=1)
    lg = re.compile(rf'^[{GLUE}]+')
    rest = lg.sub('', re.sub(r'^[«"“”\'’‘]+', '', lg.sub('', rest)))
    year = None
    ym = re.match(r'^(\d{4})(?:\s*[,&/+]\s*(\d{4}))*\s*', rest)
    if ym:
        ys = re.findall(r'\d{4}', ym.group(0))
        year = ys[0] if len(ys) == 1 else None
        rest = rest[ym.end():]
    holder = re.sub(r'^and\s+', '', lg.sub('', rest), flags=re.I)
    holder = re.sub(r'[»"“”\'’‘]+$', '', re.sub(r'^[«"“”\'’‘]+', '', holder))
    holder = re.sub(r'\s+', ' ', holder).strip()
    if not holder:
        return None
    parts = [p.strip() for p in re.split(r'\s*[/|]\s*', holder) if p.strip()]
    holders = parts if len(parts) > 1 and all(len(re.findall(r'\w', p)) >= 3 for p in parts) else [holder]
    return {'types': types, 'year': year, 'holders': holders}


COMPANY_TAIL = re.compile(r'\b(?:ltd|limited|inc|llc|gmbh|bv|b v|sa|s a|ag|plc|co|corp|corporation|company|records|recordings|music|entertainment|under exclusive licen[sc]e.*|all rights reserved)\b', re.I)


def holder_key(s):
    """A holder name for a loose comparison: folded, company words dropped."""
    return re.sub(r'\s+', ' ', COMPANY_TAIL.sub(' ', norm_name(s))).strip()


def notice_lines(annotation):
    """The annotation's lines that read as a ℗ or © notice (a marker at the line's start, as on a sleeve)."""
    out = []
    for raw in (annotation or '').splitlines():
        for line in split_compound(raw.strip()):
            if re.match(r'^\W{0,3}(?:℗|©|\(p\)|\(c\)|phonographic copyright|copyright)', line, re.I):
                p = parse_notice(line)
                if p and ({'phonographic', 'copyright'} & set(p['types'])):
                    out.append({'line': line, **p})
    return out


REL_KIND = {'phonographic copyright': 'phonographic', 'copyright': 'copyright'}


def release_tracks(rel):
    """Every track of the release: title, length, first-credit names."""
    out = []
    for m in rel.get('media', []):
        for t in m.get('tracks', []) or []:
            ac = t.get('artist-credit') or (t.get('recording') or {}).get('artist-credit') or []
            out.append({'title': t.get('title') or '', 'length': t.get('length') or (t.get('recording') or {}).get('length'),
                        'credit': [{'id': (c.get('artist') or {}).get('id'), 'name': c.get('name') or (c.get('artist') or {}).get('name') or ''} for c in ac]})
    return out


def browse(kind, mbid, pages, label):
    """Browse releases of one artist or label, `pages` pages of 25."""
    out = []
    for p in range(pages):
        r = get('release', {kind: mbid, 'inc': 'recordings+artist-credits+release-groups+annotation', 'limit': 25, 'offset': p * 25})
        if not r:
            break
        rels = r.get('releases', [])
        out += rels
        print(f'[browse] {label} offset {p * 25}: {len(rels)} of {r.get("release-count")}; requests {_count[0]}', flush=True)
        if (p + 1) * 25 >= r.get('release-count', 0):
            break
    return out


def search_one(core, name):
    """The MBID of the first exact-name hit of a search, or None (the search may be down)."""
    r = get(core, {'query': f'{core}:"{name}"', 'limit': 5})
    for x in (r or {}).get(core + 's', []):
        if norm_name(x.get('name')) == norm_name(name):
            return x['id']
    return None


def main():
    """Run the probe and write its JSON."""
    ap = argparse.ArgumentParser()
    ap.add_argument('--budget', type=int, default=700, help='requests in all')
    ap.add_argument('--pages', type=int, default=6, help='browse pages of 25 per seed')
    ap.add_argument('--out', default='debug/probe-apollo-findings-4.json')
    a = ap.parse_args()
    start = time.strftime('%Y-%m-%dT%H:%M:%S%z')

    seeds = [('artist', i, n) for i, n in SEED_ARTISTS]
    search_ok = False
    for n in SEARCH_ARTISTS:
        i = search_one('artist', n)
        search_ok = search_ok or bool(i)
        if i:
            seeds.append(('artist', i, n))
    for n in SEARCH_LABELS:
        i = search_one('label', n)
        search_ok = search_ok or bool(i)
        if i:
            seeds.append(('label', i, n))
    print(f'[seeds] {len(seeds)} (search {"answered" if search_ok else "down"}): {[s[2] for s in seeds]}', flush=True)

    releases, seen = [], set()
    for kind, mbid, name in seeds:
        if _count[0] >= a.budget * 0.6:
            break
        for r in browse(kind, mbid, a.pages, name):
            if r['id'] not in seen:
                seen.add(r['id'])
                releases.append((name, r))

    # Releases whose annotation names a notice, from the annotation search.
    anno_ids = []
    for q in ['type:release AND text:copyright', 'type:release AND text:"(p)"', 'type:release AND text:"(c)"']:
        for off in (0, 100):
            r = get('annotation', {'query': q, 'limit': 100, 'offset': off})
            for x in (r or {}).get('annotations', []):
                if x.get('entity') not in seen and x.get('entity') not in anno_ids:
                    anno_ids.append(x['entity'])
    print(f'[annotation search] {len(anno_ids)} more releases', flush=True)

    types, va, notices = [], [], []
    def judge(src, r, look_rels):
        """Tally the three rules for one release; look up its relationships when it has a notice."""
        rg = r.get('release-group') or {}
        tracks = release_tracks(r)
        credit = [{'id': (c.get('artist') or {}).get('id'), 'name': c.get('name') or (c.get('artist') or {}).get('name') or ''} for c in r.get('artist-credit', [])]
        special = any(c['id'] in SPECIAL for c in credit)
        g = guess_release_type(r.get('title'), tracks)
        types.append({'src': src, 'id': r['id'], 'title': r.get('title'), 'n': len(tracks),
                      'minutes': round(sum(t['length'] or 0 for t in tracks) / 60000, 1),
                      'primary': rg.get('primary-type'), 'secondary': rg.get('secondary-types') or [],
                      'formats': [m.get('format') or '' for m in r.get('media', [])], 'guess': g})
        why = None if special else various_artists_why(credit, tracks)
        if why:
            va.append({'src': src, 'id': r['id'], 'title': r.get('title'), 'why': why,
                       'secondary': rg.get('secondary-types') or [], 'credit': [c['name'] for c in credit]})
        lines = notice_lines(r.get('annotation'))
        if lines and look_rels and _count[0] < a.budget:
            lk = get(f'release/{r["id"]}', {'inc': 'label-rels+artist-rels'}) or {}
            have = {}
            for x in lk.get('relations', []):
                k = REL_KIND.get(x.get('type'))
                if k:
                    tgt = x.get(x.get('target-type')) or {}
                    have.setdefault(k, []).append(tgt.get('name') or '')
            for ln in lines:
                for k in {'phonographic', 'copyright'} & set(ln['types']):
                    names = have.get(k, [])
                    matched = [h for h in ln['holders'] if any(holder_key(h) and holder_key(h) in holder_key(n) or holder_key(n) and holder_key(n) in holder_key(h) for n in names)]
                    notices.append({'src': src, 'id': r['id'], 'title': r.get('title'), 'kind': k, 'line': ln['line'],
                                    'year': ln['year'], 'holders': ln['holders'], 'rels': names,
                                    'verdict': 'match' if matched else ('none-of-kind' if not names else 'other-holder')})
    for src, r in releases:
        judge(src, r, True)
    for rid in anno_ids:
        if _count[0] >= a.budget:
            break
        r = get(f'release/{rid}', {'inc': 'recordings+artist-credits+release-groups+annotation'})
        if r:
            judge('annotation-search', r, True)

    def agree(x):
        """Whether the guess agrees with the release group's primary type (None: no guess)."""
        if not x['guess']['type']:
            return None
        return x['guess']['type'] == x['primary']
    tally = {}
    for x in types:
        k = f'{x["primary"]} <- guess {x["guess"]["type"]} ({x["guess"]["why"]})'
        tally[k] = tally.get(k, 0) + 1
    disagree = [x for x in types if agree(x) is False]
    vtally = {}
    for x in notices:
        vtally[f'{x["kind"]}: {x["verdict"]}'] = vtally.get(f'{x["kind"]}: {x["verdict"]}', 0) + 1
    out = {
        'started': start, 'finished': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'requests': _count[0],
        'search_answered': search_ok, 'seeds': [s[2] for s in seeds],
        'releases': len(types), 'type_guess_made': sum(1 for x in types if x['guess']['type']),
        'type_disagree': len(disagree), 'type_tally': dict(sorted(tally.items(), key=lambda kv: -kv[1])),
        'type_disagreements': disagree, 'va': va, 'notice_tally': vtally, 'notices': notices,
    }
    with open(a.out, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print(f'[done] {_count[0]} requests, {len(types)} releases, {len(disagree)} type disagreements, '
          f'{len(va)} VA, {len(notices)} notices {vtally} -> {a.out}', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
