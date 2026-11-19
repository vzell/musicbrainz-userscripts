#!/usr/bin/env python3
"""Find real MusicBrainz examples for the Apollo findings, batch 2.

org/majkinetor.org, TODO "Findings from Apollo / Group Therapy / First Contact /
Credit Hoarder", batch 2 (release-tracks, no requests at run time):

- remix-no-remixer: a recording title that names a remixer ("(Psyche remix)",
  "(Remixed by X)"), parsed with Credit Hoarder's src/derive/remix.js rules
  (ported below), while the recording has no "remixer" relationship;
- medley-works: a title "A / B / C" (split on " / " with spaces) whose recording
  links fewer works than it has parts, but at least one. A part written in
  square brackets ("[band intro]") is non-musical and never counts (the first
  run counted it: 6 of 6 hits were such titles).

Source: an artist's recordings, browsed (/ws/2, not behind musicbrainz.org's
HTML browser check); the candidates are looked up one by one with
inc=artist-rels+work-rels. Paced at one request per 2 s, a 503 retried six
times (https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting).

Usage:
    python3 scripts/probe-apollo-findings-2.py [--artist MBID] [--pages N] [--lookups N]
        [--out debug/probe-apollo-findings-2.json]
"""
import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

UA = 'ShowAllEntityData-probe/1.0 (+https://github.com/vzell/mb-userscripts)'
WS = 'https://musicbrainz.org/ws/2/'
SPRINGSTEEN = '70248960-cb53-4ea4-943a-edb18f7d336f'
_last = [0.0]

# ---- Credit Hoarder's remix.js, ported (STRONG/WEAK, TRAILING_RE, BY_RE, SEP_RE) ----
STRONG = {'extended', 'original', 'radio', 'instrumental', 'acapella', 'acappella', 'acoustic', 'album', 'single',
          'main', 'long', 'short', 'full', 'special', 'bonus', 'alternative', 'alternate', 'vip', 'rmx', 'redux',
          'dancefloor', 'unplugged', 'demo', 'remastered', 'dub', 'edit', 'mix', 'remix', 'rework', 'remodel',
          'reshuffle', 'reprise', 'version', 're-edit', 'reedit'}
WEAK = {'club', 'deep', 'tech', 'soulful', 'disco', 'electro', 'house', 'techno', 'progressive', 'tribal', 'vocal',
        'classic', 'clean', 'dirty', 'censored', 'uncensored', 'studio', 'live', 'the', 'a', 'an'}
# SAED's additions (2026-11-19, from the Beatles/Elvis probe): words that describe the MIX, never
# its maker. They count as decorators and are trimmed off the trailing edge like STRONG.
SAED_MIX_WORDS = {'mono', 'stereo', 'surround', 'quad', 'quadraphonic', 'binaural', 'atmos', 'dolby', 'monitor',
                  'reduction', 'reduced', 'multitrack', 'movie', 'film', 'tv', 'new', 'first', 'unused', 'rough',
                  'early', 'take', 'to', 'of', 'and', 'concert', 'session', 'sessions', 'outtake', 'anthology',
                  'rockband', 'rock', 'band', 'mixdown', 'master', 'version'}
SEP_RE = re.compile(r'\s*(?:&|\+|,|/|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b)\s*', re.I)
TRAILING_RE = re.compile(r'^(.+?)\s+((?:re[-_ ]?)?(?:remix|rework|remodel|reshuffle|reprise|edit|dub|mix))(?:es|ed|s|d)?$', re.I)
BY_RE = re.compile(r'^(?:re[-_ ]?)?(?:remix|rework|remodel|reshuffle|rerub)(?:es|ed|s|d)?\s+by\s+(.+)$', re.I)


def _norm(t):
    return re.sub(r"[.'’`]+$", '', t.lower())


def _is_vinyl(t):
    return bool(re.match(r'^\d+(?:"|\'\'|”|inch|in)?$', t))


def _is_saed_mix(n):
    """SAED's additions: a mix word, a channel count ("5.1"), a year, a take number, a date."""
    return n in SAED_MIX_WORDS or bool(re.match(r'^(\d+(\.\d)?|(19|20)\d\d[-‐/.\d]*|\d+[-‐]\d+[-‐]\d+|-|‐)$', n))


def _is_strong(t):
    n = _norm(t)
    return n in STRONG or _is_vinyl(n) or _is_saed_mix(n)


def _is_decorator(t):
    n = _norm(t)
    return n in STRONG or n in WEAK or _is_vinyl(n) or _is_saed_mix(n)


def _clean_name(raw):
    s = re.sub(r'\s*[(\[].*$', '', raw or '')
    s = re.sub(r'[)\]]+\s*$', '', s)
    tokens = [t for t in s.strip().split() if t]
    p = next((i for i, t in enumerate(tokens) if re.search(r"['’]s$", t, re.I)), -1)
    if p != -1:
        tokens = tokens[:p + 1]
        tokens[p] = re.sub(r"['’]s$", '', tokens[p], flags=re.I)
    while tokens and _is_strong(tokens[-1]):
        tokens.pop()
    if not tokens or all(_is_decorator(t) for t in tokens):
        return None
    name = re.sub(r"['’]s$", '', ' '.join(tokens), flags=re.I).strip()
    return name if re.search(r'[A-Za-z0-9]', name) else None


def remixers_in_title(title):
    """remix.js's parseRemixTitle(): the remixer names a title's parentheticals give."""
    out = []
    for g in re.findall(r'[(\[][^)\]]*[)\]]', title or ''):
        inner = g[1:-1].strip()
        m = BY_RE.match(inner) or TRAILING_RE.match(inner)
        if not m:
            continue
        for n in filter(None, (_clean_name(x) for x in SEP_RE.split(m.group(1)))):
            if n not in out:
                out.append(n)
    return out
# ---- end of the port ----


def musical_parts(title):
    """The " / " parts of a title that are music: a part written entirely in square
    brackets ("[band intro]") is MusicBrainz's mark for non-musical content
    (https://musicbrainz.org/doc/Style/Unknown_and_untitled/Special_purpose_track_title)."""
    t = (title or '').strip()
    if re.fullmatch(r'\[[^\]]*\]', t):
        return []   # one bracketed title, "[encore / break]": no parts at all
    return [x for x in (y.strip() for y in t.split(' / ')) if x and not x.startswith('[')]


def is_bracketed_title(title):
    """A title whose text before any parenthetical is a "[…]" special-purpose title."""
    return (title or '').lstrip().startswith('[')


def get(path, params):
    """GET one /ws/2 JSON document, paced at one request per 2 s; retries a 503."""
    url = WS + path + '?' + urllib.parse.urlencode({**params, 'fmt': 'json'})
    for attempt in range(7):
        wait = 2.0 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 503 and attempt < 6:
                time.sleep(5 + 5 * attempt)
                continue
            raise
    return None


def main():
    """Run the probe and write the JSON report."""
    ap = argparse.ArgumentParser()
    ap.add_argument('--artist', default=SPRINGSTEEN)
    ap.add_argument('--pages', type=int, default=25)
    ap.add_argument('--lookups', type=int, default=200)
    ap.add_argument('--out', default='debug/probe-apollo-findings-2.json')
    a = ap.parse_args()

    medleys, remixes, seen = [], [], 0
    for page in range(a.pages):
        doc = get('recording', {'artist': a.artist, 'limit': 100, 'offset': page * 100})
        recs = doc.get('recordings', [])
        for r in recs:
            t = r.get('title') or ''
            if len(musical_parts(t)) >= 2:
                medleys.append(r)
            if remixers_in_title(t) and not is_bracketed_title(t):
                remixes.append(r)
        seen += len(recs)
        print(f'page {page + 1}: {seen} recordings, {len(medleys)} " / " titles, {len(remixes)} named remixes',
              file=sys.stderr)
        if len(recs) < 100:
            break

    medley_hits, remix_hits, looked = [], [], 0
    for kind, items in (('medley', medleys), ('remix', remixes)):
        for r in items[:a.lookups]:
            looked += 1
            d = get('recording/' + r['id'], {'inc': 'artist-rels+work-rels'})
            rels = d.get('relations', [])
            works = [x['work']['title'] for x in rels if x.get('target-type') == 'work' and x.get('type') == 'performance']
            remixer = [x['artist']['name'] for x in rels if x.get('target-type') == 'artist' and x.get('type') == 'remixer']
            url = 'https://musicbrainz.org/recording/' + r['id']
            if kind == 'medley':
                parts = musical_parts(d['title'])
                covered = sum(max(1, len(musical_parts(w))) for w in works)
                medley_hits.append({'url': url, 'title': d['title'], 'parts': len(parts), 'works': works,
                                    'flag': 1 <= len(works) and covered < len(parts)})
            else:
                remix_hits.append({'url': url, 'title': d['title'], 'named': remixers_in_title(d['title']),
                                   'remixer_rels': remixer, 'flag': not remixer})
            print(f'{kind} {looked}: {d["title"][:60]}', file=sys.stderr)

    report = {'when': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'artist': a.artist, 'recordings_checked': seen,
              'medley_titles': len(medleys), 'named_remix_titles': len(remixes),
              'medleys': medley_hits, 'remixes': remix_hits,
              'self_test': {t: remixers_in_title(t) for t in [
                  'Song (Extended Mix)', 'Song (Club Mix)', 'Song (Cotton Club remix)',
                  'Song (Masters at Work main mix)', 'Song (Remixed by Aphex Twin)', 'Song (Mixed by Someone)',
                  'Everlasting (Psyche remix)', 'Song (Remix)', 'Song (Radio Edit)']}}
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(json.dumps({k: report[k] for k in ('recordings_checked', 'medley_titles', 'named_remix_titles', 'self_test')},
                     ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
