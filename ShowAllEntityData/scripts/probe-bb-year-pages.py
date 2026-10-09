"""Step 0 of the Brucebase year pages (`bb-year`, org/BB-events.org): what
shapes do the entries of EVERY year page take?

The converter (`applyBbYearToTable()`) splits each event of a year page
(https://brucebase.wikidot.com/1975, ..., the one exception /1949-64) into
columns. This probe reads all of them, so the split rules come from the
pages and not from the handful read by hand. It reports, over all years:

  1. per year: entries, bytes, request time;
  2. heading link prefixes (gig:, nogig:, recording:, ...);
  3. date shapes (YYYY-MM-DD, day 00, month 00, anything else);
  4. location shapes: number of comma parts, and the last part's kind
     (2-letter code or a word), with examples of every non-US 4+-part
     heading -- the one place the City/State split is ambiguous;
  5. slug suffixes after the date (a/b/c, -early/-late);
  6. set-paragraph prefixes ("Soundcheck:", "with X:", ...), with counts;
  7. set notes (italic lines in or instead of a setlist);
  8. icon titles after entries;
  9. tour boxes ("Start of ..." / "End of ..." headings);
 10. entry openers: a paragraph that is one date-led <strong> (the anchor
     before it, `<a name="ddmmyy">` or `ddmmyy` + a letter, is optional and
     sometimes in a paragraph of its own), with or without a link.

Pages are cached in debug/bb-year-cache/<year>.html (gitignored), so a
re-run costs no request; --refresh fetches again. Requests are 2 s apart
(wikidot is slow). scripts/build-bb-fixtures.py builds three of the
year fixtures from this cache (1968, 1985, 2018).

usage: python3 scripts/probe-bb-year-pages.py [--refresh] [YEAR ...]
"""
import collections
import html as htmllib
import os
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'debug', 'bb-year-cache')
UA = 'ShowAllEntityData-bb-year-probe/1.0 ( info@volkerzell.de )'
SPACING_S = 2.0
YEARS = ['1949-64'] + [str(y) for y in range(1965, 2027)]

_last = [0.0]

HEAD_P_RE = re.compile(r'<p>(?:\s*<a name="([^"]*)"></a>\s*(?:<br\s*/?>)?)?\s*<strong>((?:(?!</strong>).)*?)</strong>\s*</p>', re.S)
HEAD_LINK_RE = re.compile(r'<a href="(/[a-z]+:[^"]*)"')
HR_RE = re.compile(r'<hr\s*/?>')
P_RE = re.compile(r'<p>(.*?)</p>', re.S)
IMG_TITLE_RE = re.compile(r'<img [^>]*title="([^"]*)"')
H2_RE = re.compile(r'<h2[^>]*>(.*?)</h2>', re.S)
NOTE_RE = re.compile(r'<em>(.*?)</em>', re.S)


def fetch(year, refresh):
    """One year page: the cached copy, or a GET 2 s after the previous one.
    Returns (html, bytes, ms) -- ms is None for a cached page."""
    path = os.path.join(CACHE, f'{year}.html')
    if not refresh and os.path.exists(path):
        with open(path, encoding='utf-8') as fh:
            body = fh.read()
        return body, len(body.encode('utf-8')), None
    wait = _last[0] + SPACING_S - time.time()
    if wait > 0:
        time.sleep(wait)
    _last[0] = time.time()
    req = urllib.request.Request(f'https://brucebase.wikidot.com/{year}', headers={'User-Agent': UA})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            raw = r.read()
    except urllib.error.HTTPError as e:
        print(f'{year}: HTTP {e.code}', file=sys.stderr)
        return '', 0, None
    ms = round((time.time() - t0) * 1000)
    body = raw.decode('utf-8', 'replace')
    os.makedirs(CACHE, exist_ok=True)
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(body)
    return body, len(raw), ms


def text(fragment):
    """Visible text of an HTML fragment, entities decoded, whitespace collapsed."""
    t = re.sub(r'<[^>]+>', ' ', fragment)
    return re.sub(r'\s+', ' ', htmllib.unescape(t)).strip()


def set_kind(p):
    """Classifies one paragraph the way the converter does: ('set', label)
    for a song list (letters mostly capitals outside parentheses, after an
    optional mixed-case "Label:"), ('note', '') for a paragraph that is only
    an italic set note ("No set details known."), None for prose."""
    body = re.sub(r'<sup>.*?</sup>', '', p, flags=re.S)
    t = text(body)
    if not t and '<sup>' in p:
        return ('note', '')
    em_only = re.fullmatch(r'\s*<em>.*?</em>\s*', body, flags=re.S)
    if em_only:
        return ('note', '') if re.search(r'\bset', t, re.I) else None
    label = ''
    m = re.match(r'\s*([^:/]{1,80}?):\s*', t)
    if m and re.search(r'[a-z]', m.group(1)):
        label, t = m.group(1).strip(), t[m.end():]
    prev = None
    while prev != t:
        prev, t = t, re.sub(r'\([^()]*\)|\[[^\[\]]*\]', '', t)

    def capitals(s):
        """True when the letters of s are (nearly) all capitals."""
        lower = len(re.findall(r'[a-zà-ÿ]', s))
        upper = len(re.findall(r'[A-ZÀ-Þ]', s))
        return upper > 0 and lower / (lower + upper) < 0.15

    segs = [s for s in re.split(r'\s/\s', t) if re.search(r'[A-Za-zÀ-ÿ]', s)]
    if len(segs) >= 2:
        ok = sum(1 for s in segs if capitals(s)) / len(segs) >= 0.6
    else:
        ok = capitals(t)
    return ('set', label) if ok else None


def page_content(page):
    """The `#page-content` part of a page (up to the page's footer nav)."""
    i = page.find('id="page-content"')
    j = page.find('id="page-info-break"', i)
    return page[i:j if j > 0 else len(page)]


def main():
    """Reads every year page and prints the tables."""
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    refresh = '--refresh' in sys.argv
    years = args or YEARS
    c = collections.defaultdict(collections.Counter)
    examples = collections.defaultdict(list)
    per_year = []
    for year in years:
        page, nbytes, ms = fetch(year, refresh)
        if not page:
            per_year.append((year, 0, nbytes, ms))
            continue
        content = page_content(page)
        for h in H2_RE.findall(content):
            t = text(h)
            if re.match(r'(Start|End) of', t):
                c['tourbox'][re.sub(r'".*?"', '"…"', t)] += 1
                if len(examples['tourbox']) < 12:
                    examples['tourbox'].append(f'{year}: {t}')
        anchors = [m for m in HEAD_P_RE.finditer(content) if re.match(r'\d{4}-\d\d-\d\d', text(m.group(2)))]
        n = 0
        for k, m in enumerate(anchors):
            n += 1
            lm = HEAD_LINK_RE.search(m.group(2))
            href, heading = (lm.group(1) if lm else ''), text(m.group(2))
            name = m.group(1) or ''
            c['anchor'][('none' if not name else 'ddmmyy' if re.fullmatch(r'\d{6}', name)
                         else 'ddmmyy+letter' if re.fullmatch(r'\d{6}[a-z]+', name) else 'other')] += 1
            if not lm:
                c['prefix']['(no link)'] += 1
                examples['nolink'].append(f'{year}: {heading}')
            if lm:
                c['prefix'][href.split(':', 1)[0]] += 1
            date, _, loc = heading.partition(' - ')
            if re.fullmatch(r'\d{4}-\d\d-\d\d', date):
                shape = ('month00' if date[5:7] == '00' else 'day00' if date[8:] == '00' else 'full')
            else:
                shape = 'other'
                examples['date-other'].append(f'{year}: {heading}')
            c['date'][shape] += 1
            parts = [p.strip() for p in loc.split(',')] if loc else []
            last = parts[-1] if parts else ''
            kind = 'code2' if re.fullmatch(r'[A-Z]{2}', last) else ('empty' if not last else 'word')
            c['loc'][f'{len(parts)} parts, last {kind}'] += 1
            if kind == 'word':
                c['country'][last] += 1
                if len(parts) >= 4 and len(examples['nonus4']) < 60:
                    examples['nonus4'].append(f'{year}: {loc}')
            if kind == 'code2':
                c['code2'][last] += 1
            if len(parts) < 3:
                examples['short'].append(f'{year}: {heading}')
            slug = href.split(':', 1)[1] if ':' in href else ''
            sm = re.match(r'\d{4}-\d\d-\d\d([a-z]?)-', slug)
            if sm and sm.group(1):
                c['slug'][f'letter {sm.group(1)}'] += 1
            for suf in ('-early', '-late'):
                if slug.endswith(suf):
                    c['slug'][suf] += 1
            # The entry's block: to the next <hr> or the next anchor.
            end = anchors[k + 1].start() if k + 1 < len(anchors) else len(content)
            hr = HR_RE.search(content, m.end(), end)
            block = content[m.end(): hr.start() if hr else end]
            box = block.find('list-pages-box')
            c['setshape']['notes in .list-pages-box' if box >= 0 else 'notes as plain paragraphs'] += 1
            # The converter's rule (_bbSetParagraphKind()), ported: leading
            # paragraphs (and blockquotes) are set paragraphs while they are
            # song lists -- capitals outside parentheses -- or a set note;
            # the first one that is neither starts the description.
            top = re.sub(r'<div class="list-pages-box">.*', '', block, flags=re.S)
            nsets = 0
            for tag, inner in re.findall(r'<(p|blockquote)>(.*?)</\1>', top, flags=re.S):
                paras = P_RE.findall(inner) if tag == 'blockquote' else [inner]
                kinds = [set_kind(p) for p in paras]
                if not kinds or any(k is None for k in kinds):
                    if kinds and nsets == 0 and len(examples['first-desc']) < 40:
                        examples['first-desc'].append(f'{year}: {text(inner)[:90]!r}')
                    break
                nsets += 1
                if tag == 'blockquote':
                    c['setshape']['blockquote set'] += 1
                for p, kind in zip(paras, kinds):
                    if kind[1]:
                        c['setprefix'][kind[1]] += 1
                    for note in re.findall(r'<sup>(.*?)</sup>', p, flags=re.S):
                        c['setnote'][text(note)] += 1
                    if kind[0] == 'note':
                        c['setnote'][text(p)] += 1
            c['setshape'][f'{nsets} set paragraph(s)'] += 1
            for src, t in re.findall(r'<img [^>]*src="[^"]*/00(\w+)-32\.png"[^>]*title="([^"]*)"', block):
                c['icon'][f'{src} = {t}'] += 1
        per_year.append((year, n, nbytes, ms))

    print('== per year: entries, bytes, ms (None = cached)')
    for row in per_year:
        print('  ', *row)
    print(f'   total entries: {sum(r[1] for r in per_year)}; max: {max(per_year, key=lambda r: r[1])}')
    for key in ('prefix', 'date', 'loc', 'code2', 'country', 'slug', 'setshape', 'setprefix', 'setnote',
                'icon', 'tourbox', 'anchor'):
        print(f'== {key}')
        for k, v in c[key].most_common():
            print(f'   {v:6}  {k}')
    for key in ('date-other', 'short', 'nonus4', 'tourbox', 'nolink', 'first-desc'):
        if examples[key]:
            print(f'== examples: {key}')
            for e in examples[key][:60]:
                print('   ', e)


if __name__ == '__main__':
    main()
