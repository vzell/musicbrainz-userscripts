"""Build the non-MusicBrainz coverage report from its registry, and check both.

The report answers, for every site other than musicbrainz.org that the script
supports (org/non-MB-coverage.org):

  1a  which site URLs have pageTypes (PT);
  1b  whether link previews (POH: card on hover, window on Space) work on each
      PT's initial page (IP) and on its rendered table (FRP);
  2a  which link families the preview reads (the readers of _EXT_READERS);
  2b  inside each kind of preview window, which links open in that window and
      which open a new tab, for each site the page is on.

One source, docs/non-mb-coverage.json, two outputs, both generated:

  NON-MB-COVERAGE.html   the report people read (2b as a matrix with a site
                         switch); publishable as an Artifact through
                         scripts/build-mockup-artifact.py (it carries the
                         SKELETON-END marker and an empty #mockup-images list)
  NON-MB-COVERAGE.org    the same tables as org, for grep; 2b is one table per
                         site the page is on. A "|" inside a cell is written
                         "¦", since org has no escape that reads well in the
                         buffer.

The registry is hand-written: whether a preview works where is behaviour, not
data the userscript declares. What the userscript DOES declare is checked
against it, so a new site, PT or reader cannot land without its rows:

  - every pageDefinitions entry with a `host:` (type, host, tableMode, order);
  - every _DP_SITES key with its `setting` and `extRoot`;
  - the _EXT_READERS ids, in their order (first match wins);
  - _DP_WIN_EXT_READERS, _DP_WIN_ALL_LINKS_READERS, _DP_WIN_ALL_LINKS_SOURCES;
  - the host flags of _MB_FOREIGN_POP_HOST;
  - each site's host flag, gate and preview settings (configSchema keys) and
    topic doc; each "spec" evidence's file and test title; each gap's code
    symbols.

2b is not stored cell by cell: each link family carries a route rule per site
the page is on (`views`), and each window says whether it opens every link a
reader takes (`allLinks`). This mirrors _dpDrill(): same-host detail page →
_dgMbWinTarget() → _dpWinExtTarget() → the MB entity source → the Discogs
family's onAreaClick. A rule is

    here | tab | all | gap:G<n>       optionally ^n<k> (a note) and, after
                                      `all`, /gap:G<n> (a gap where a window
                                      without allLinks would give a new tab)

where `all` means "here in a window with allLinks, a new tab elsewhere".

The pageType checks read pageDefinitions by indentation (an entry's own keys
sit at 12 spaces), which is how the file is written; a reformat that moves
them fails --check loudly rather than passing silently (the extracted set
would be empty).

Nothing here carries a timestamp, a SHA or the script's version, so a rebuild
of unchanged sources is byte-identical and --check stays meaningful between
releases.

usage:
  python3 scripts/build-coverage-report.py             write what changed
  python3 scripts/build-coverage-report.py --check     exit 1 on a mismatch or a stale output
  python3 scripts/build-coverage-report.py --selftest  built-in tests, planted defects included
"""
import argparse
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGISTRY = os.path.join(ROOT, 'docs', 'non-mb-coverage.json')
USERSCRIPT = os.path.join(ROOT, 'ShowAllEntityData.user.js')
OUT_HTML = os.path.join(ROOT, 'NON-MB-COVERAGE.html')
OUT_ORG = os.path.join(ROOT, 'NON-MB-COVERAGE.org')

STATES = ('yes', 'part', 'no', 'na')
NO_GAPS = 'None open. Gaps found and fixed are recorded in org/non-MB-coverage.org.'
EVIDENCE = ('spec', 'code', 'inferred')
RULE_RE = re.compile(r'^(here|tab|all|gap:G\d+)(?:\^(n\d+))?(?:/gap:(G\d+))?$')


# --------------------------------------------------------------------------
# Reading the userscript
# --------------------------------------------------------------------------

def _block(src, opener, closer):
    """The text from `opener` to the first `closer` after it, or ''."""
    start = src.find(opener)
    if start < 0:
        return ''
    end = src.find(closer, start)
    return src[start:end if end > 0 else len(src)]


def _str_or_null(m):
    """A matched `null` or `'…'` literal as None or the string."""
    if not m:
        return 'MISSING'
    v = m.group(1)
    return None if v == 'null' else v[1:-1]


def extract(src):
    """What the userscript declares about its foreign sites.

    @param src: the userscript's text
    @returns: dict with pts [(host, type, tableMode)], dp_sites {host: (setting, extRoot)},
              readers [ids], sets {name: [items]}, mb_foreign_vars [names]
    """
    out = {'pts': [], 'dp_sites': {}, 'readers': [], 'sets': {}, 'mb_foreign_vars': []}

    block = _block(src, 'const pageDefinitions = [', '\n    ];')
    starts = [m.start() for m in re.finditer(r"^ {12}type: '", block, re.M)]
    for i, s in enumerate(starts):
        entry = block[s:starts[i + 1] if i + 1 < len(starts) else len(block)]
        host = re.search(r"^ {12}host: '([^']+)'", entry, re.M)
        if not host:
            continue
        typ = re.match(r" {12}type: '([^']+)'", entry).group(1)
        mode = re.search(r"^ {12}tableMode: '(\w+)'", entry, re.M)
        out['pts'].append((host.group(1), typ, mode.group(1) if mode else None))

    dp = _block(src, 'const _DP_SITES = {', '\n    };')
    keys = list(re.finditer(r"^ {8}'([^']+)': \{", dp, re.M))
    for i, m in enumerate(keys):
        body = dp[m.end():keys[i + 1].start() if i + 1 < len(keys) else len(dp)]
        setting = _str_or_null(re.search(r"^ {12}setting: (null|'[^']*')", body, re.M))
        ext_root = _str_or_null(re.search(r"^ {12}extRoot: (null|'[^']*')", body, re.M))
        out['dp_sites'][m.group(1)] = (setting, ext_root)

    out['readers'] = re.findall(r"\bid: '(\w+)'", _block(src, 'const _EXT_READERS = [', '\n    ];'))

    for name in ('_DP_WIN_EXT_READERS', '_DP_WIN_ALL_LINKS_READERS', '_DP_WIN_ALL_LINKS_SOURCES'):
        m = re.search(r'const ' + name + r'\s*=\s*new Set\(\[([^\]]*)\]\)', src)
        out['sets'][name] = re.findall(r"'([^']+)'", m.group(1)) if m else None

    m = re.search(r'const _MB_FOREIGN_POP_HOST\s*=\s*!!\(([^)]*)\)', src)
    out['mb_foreign_vars'] = re.findall(r'_is\w+Host', m.group(1)) if m else None
    return out


# --------------------------------------------------------------------------
# Checking the registry
# --------------------------------------------------------------------------

def _file_reader(path):
    """Reads a repo-relative file, or returns None when it does not exist."""
    full = os.path.join(ROOT, path)
    if not os.path.isfile(full):
        return None
    with open(full, encoding='utf-8') as fh:
        return fh.read()


def parse_rule(rule):
    """Splits a route rule into (base, note, else_gap); raises ValueError on a bad one."""
    m = RULE_RE.match(rule)
    if not m:
        raise ValueError(f'bad route rule {rule!r}')
    base, note, else_gap = m.group(1), m.group(2), m.group(3)
    if else_gap and base != 'all':
        raise ValueError(f'route rule {rule!r}: /gap: follows `all` only')
    return base, note, else_gap


def check(reg, src, read=_file_reader):
    """Every problem found, as a list of strings (empty when all is well).

    @param reg: the registry (parsed JSON)
    @param src: the userscript's text
    @param read: repo-relative path → text or None (injected by the selftest)
    """
    p = []
    ex = extract(src)
    if not ex['pts']:
        p.append('userscript: no pageDefinitions entry with a host: was found (reformatted?)')

    sites = reg.get('sites', [])
    by_host = {s['host']: s for s in sites}
    src_hosts = []
    for h, _, _ in ex['pts']:
        if h not in src_hosts:
            src_hosts.append(h)
    for h in src_hosts:
        if h not in by_host:
            p.append(f'site {h}: has pageTypes in the userscript but no entry in the registry')
    for h in by_host:
        if h not in src_hosts:
            p.append(f'site {h}: in the registry but no pageType of the userscript has host: {h!r}')
    if set(ex['dp_sites']) != set(by_host):
        p.append(f'_DP_SITES keys {sorted(ex["dp_sites"])} differ from the registry hosts {sorted(by_host)}')

    view_keys = [v['key'] for v in reg.get('views', [])]
    view_sites = [k for v in reg.get('views', []) for k in v.get('sites', [])]
    site_keys = [s['key'] for s in sites]
    if sorted(view_sites) != sorted(site_keys):
        p.append(f'views: their sites {sorted(view_sites)} must name every site once {sorted(site_keys)}')
    gap_ids = {g['id'] for g in reg.get('gaps', [])}
    notes = reg.get('notes', {})

    for s in sites:
        name = f'site {s["key"]}'
        want = [(t, m) for h, t, m in ex['pts'] if h == s['host']]
        have = [(pt['type'], pt['mode']) for pt in s['pts']]
        for t, m in want:
            if t not in [x for x, _ in have]:
                p.append(f'{name}: pageType {t} is in the userscript, not in the registry')
            elif (t, m) not in have:
                p.append(f'{name}: pageType {t} has tableMode {m!r} in the userscript')
        for t, _ in have:
            if t not in [x for x, _ in want]:
                p.append(f'{name}: pageType {t} is in the registry, not in the userscript')
        if [t for t, _ in want] != [t for t, _ in have] and sorted(want) == sorted(have):
            p.append(f'{name}: pageTypes are not in the userscript\'s order {[t for t, _ in want]}')
        if s['host'] in ex['dp_sites']:
            setting, ext_root = ex['dp_sites'][s['host']]
            if setting != s.get('preview'):
                p.append(f'{name}: _DP_SITES setting is {setting!r}, the registry says {s.get("preview")!r}')
            if ext_root != s.get('extRoot'):
                p.append(f'{name}: _DP_SITES extRoot is {ext_root!r}, the registry says {s.get("extRoot")!r}')
        if not re.search(r'const ' + re.escape(s['hostVar']) + r'\s*=', src):
            p.append(f'{name}: host flag {s["hostVar"]} is not declared in the userscript')
        for key in (s.get('gate'), s.get('preview')):
            if key and not re.search(r'\n {8}' + re.escape(key) + r': \{', src):
                p.append(f'{name}: setting {key} is not a configSchema key')
        if read(s['doc']) is None:
            p.append(f'{name}: topic doc {s["doc"]} does not exist')
        if s.get('view') not in view_keys:
            p.append(f'{name}: view {s.get("view")!r} is not one of the views')
        for pt in s['pts']:
            for part in ('ip', 'frp'):
                c = pt.get(part) or {}
                where = f'{pt["type"]} {part}'
                if c.get('state') not in STATES:
                    p.append(f'{where}: state {c.get("state")!r} is not one of {STATES}')
                if c.get('ev') not in EVIDENCE:
                    p.append(f'{where}: evidence {c.get("ev")!r} is not one of {EVIDENCE}')
                if c.get('ev') == 'spec':
                    spec = c.get('spec')
                    if not (isinstance(spec, list) and len(spec) == 2):
                        p.append(f'{where}: "spec" evidence needs "spec": [file, test-title substring]')
                    else:
                        text = read(spec[0])
                        if text is None:
                            p.append(f'{where}: spec file {spec[0]} does not exist')
                        elif spec[1] not in text.replace("\\'", "'"):
                            p.append(f'{where}: no test title in {spec[0]} contains {spec[1]!r}')
                elif 'spec' in c:
                    p.append(f'{where}: names a spec but its evidence is {c.get("ev")!r}')
                if c.get('gap') and c['gap'] not in gap_ids:
                    p.append(f'{where}: gap {c["gap"]} is not in gaps')

    reader_ids = [r['id'] for r in reg.get('readers', [])]
    if ex['readers'] != reader_ids:
        p.append(f'readers: the userscript\'s _EXT_READERS are {ex["readers"]}, the registry has {reader_ids}')
    for name, key in (('_DP_WIN_EXT_READERS', 'winExtReaders'), ('_DP_WIN_ALL_LINKS_READERS', 'allLinksReaders'),
                      ('_DP_WIN_ALL_LINKS_SOURCES', 'allLinksSources')):
        got = ex['sets'].get(name)
        if got is None:
            p.append(f'userscript: {name} not found')
        elif sorted(got) != sorted(reg.get(key, [])):
            p.append(f'{key}: the userscript\'s {name} is {got}, the registry has {reg.get(key)}')
    if ex['mb_foreign_vars'] is None:
        p.append('userscript: _MB_FOREIGN_POP_HOST not found')
    else:
        want_vars = sorted(s['hostVar'] for s in sites if s['key'] in reg.get('mbForeignSites', []))
        if sorted(ex['mb_foreign_vars']) != want_vars:
            p.append(f'mbForeignSites: _MB_FOREIGN_POP_HOST names {ex["mb_foreign_vars"]}, the registry means {want_vars}')

    for w in reg.get('windows', []):
        for v in w.get('only', []):
            if v not in view_keys:
                p.append(f'window {w["key"]}: only names unknown view {v!r}')
        for fam, n in (w.get('notes') or {}).items():
            if n not in notes:
                p.append(f'window {w["key"]}: note {n} is not in notes')
    for f in reg.get('families', []):
        route = f.get('route', {})
        if '*' not in route:
            p.append(f'family {f["key"]}: route has no "*" rule')
        for v, rule in route.items():
            if v != '*' and v not in view_keys:
                p.append(f'family {f["key"]}: route names unknown view {v!r}')
            try:
                base, note, else_gap = parse_rule(rule)
            except ValueError as e:
                p.append(f'family {f["key"]}: {e}')
                continue
            if note and note not in notes:
                p.append(f'family {f["key"]}: note {note} is not in notes')
            for g in ([base[4:]] if base.startswith('gap:') else []) + ([else_gap] if else_gap else []):
                if g not in gap_ids:
                    p.append(f'family {f["key"]}: gap {g} is not in gaps')
    for g in reg.get('gaps', []):
        if g.get('ev') not in EVIDENCE:
            p.append(f'gap {g["id"]}: evidence {g.get("ev")!r} is not one of {EVIDENCE}')
        for sym in re.findall(r'\b_\w+', g.get('where', '')):
            if not re.search(r'(?:function|const|let) ' + re.escape(sym) + r'\b', src):
                p.append(f'gap {g["id"]}: {sym} is not declared in the userscript')
    return p


# --------------------------------------------------------------------------
# 2b: the routing matrix
# --------------------------------------------------------------------------

def resolve(view, window, family):
    """Where a plain click on a `family` link inside `window` goes, on site `view`.

    @returns: (state, notes, gap) — state is here | tab | gap | na
    """
    if window.get('only') and view not in window['only']:
        return 'na', [], None
    base, note, else_gap = parse_rule(family['route'].get(view, family['route']['*']))
    notes = [note] if note else []
    if base.startswith('gap:'):
        return 'gap', [], base[4:]
    if base == 'all':
        if not window.get('allLinks'):
            return ('gap', [], else_gap) if else_gap else ('tab', [], None)
        base = 'here'
    if base == 'here':
        extra = (window.get('notes') or {}).get(family['key'])
        if extra:
            notes.append(extra)
        return 'here', notes, None
    return 'tab', notes, None


# --------------------------------------------------------------------------
# Org output
# --------------------------------------------------------------------------

def _org_cell(v):
    """A value as an org table cell: no "|", no line breaks."""
    return str(v).replace('|', '¦').replace('\n', ' ')


def org_table(head, rows):
    """An org table aligned the way org-mode aligns it (one rule under the head)."""
    rows = [[_org_cell(c) for c in r] for r in rows]
    head = [_org_cell(c) for c in head]
    widths = [max(len(r[i]) for r in [head] + rows) for i in range(len(head))]
    line = lambda r: '| ' + ' | '.join(c.ljust(widths[i]) for i, c in enumerate(r)) + ' |'
    rule = '|' + '+'.join('-' * (w + 2) for w in widths) + '|'
    return '\n'.join([line(head), rule] + [line(r) for r in rows])


def _cell_text(c):
    """1b cell as text: "yes (spec)", "part (code) → G5"."""
    t = f'{c["state"]} ({c["ev"]})'
    return t + (f' → {c["gap"]}' if c.get('gap') else '')


def render_org(reg):
    """The whole NON-MB-COVERAGE.org text."""
    sites = reg['sites']
    out = ['#+TITLE: Non-MusicBrainz coverage: pageTypes and link previews',
           '#+STARTUP: showall',
           '# Generated by scripts/build-coverage-report.py from docs/non-mb-coverage.json. Do not edit:',
           '# edit the JSON and run the script. The HTML version (NON-MB-COVERAGE.html) has the same data.',
           '']
    out += ['* Legend', '',
            '- IP: the initial page, before any button. FRP: the final rendered page (our table).',
            '- States: ' + '; '.join(f'{k}: {v.rstrip(".")}' for k, v in reg['states'].items()) + '.',
            '- Evidence: ' + '; '.join(f'{k}: {v.rstrip(".")}' for k, v in reg['evidence'].items()) + '.',
            '- 2b cells: H opens in the window (Back returns), T new tab, T! new tab and a gap, - no such window there.',
            '  A plain left click; Ctrl, Shift, Alt, ⌘ or the middle button always keep the new tab.', '']

    out += ['* 1a Sites with pageTypes', '',
            org_table(['Site', 'Host', 'Switch', 'Previews', 'extRoot', 'Doc', 'PTs'],
                      [[s['abbr'], s['host'], s['gate'], s['preview'] or 'sa_pop_ext', s['extRoot'] or '-', s['doc'], len(s['pts'])]
                       for s in sites]), '']

    out += ['* 1b pageTypes: previews on the initial page (IP) and the rendered table (FRP)', '',
            org_table(['Site', 'pageType', 'URL', 'Mode', 'IP', 'FRP', 'Why'],
                      [[s['abbr'], pt['type'], pt['url'], pt['mode'], _cell_text(pt['ip']), _cell_text(pt['frp']),
                        '; '.join(x for x in (('IP: ' + pt['ip']['why']) if pt['ip'].get('why') else '',
                                              ('FRP: ' + pt['frp']['why']) if pt['frp'].get('why') else '') if x)]
                       for s in sites for pt in s['pts']]), '']
    specs = [(pt['type'], part.upper(), pt[part]['spec']) for s in sites for pt in s['pts'] for part in ('ip', 'frp')
             if pt[part].get('spec')]
    out += ['** Specs behind the "spec" cells', '',
            org_table(['pageType', 'Part', 'Spec', 'Test title contains'], [[t, part, sp[0], sp[1]] for t, part, sp in specs]), '']

    win_ext, all_links = set(reg['winExtReaders']), set(reg['allLinksReaders'])
    out += ['* 2a Link families the preview reads', '',
            '_EXT_READERS, first match wins. "Any window": its links open in place in every window.',
            '"All links": every link a reader takes opens in place in its own window.', '',
            org_table(['#', 'Reader', 'Links it reads', 'Asks', 'Its window', 'Any window', 'All links'],
                      [[i + 1, r['id'], r['links'], r['asks'], r['window'], 'yes' if r['id'] in win_ext else '-',
                        'yes' if r['id'] in all_links else '-'] for i, r in enumerate(reg['readers'])]), '']

    fams = reg['families']
    out += ['* 2b Inside a window: opens here (H) or in a new tab (T)', '',
            'Columns: ' + ', '.join(f'{i + 1} {f["label"]} ({f["example"]})' for i, f in enumerate(fams)) + '.', '']
    for v in reg['views']:
        rows = []
        for w in reg['windows']:
            row = [w['label']]
            for f in fams:
                st, ns, gap = resolve(v['key'], w, f)
                txt = {'here': 'H', 'tab': 'T', 'gap': 'T!', 'na': '-'}[st]
                txt += (gap or '') + ''.join(f'/{n}' for n in ns)
                row.append(txt)
            rows.append(row)
        out += [f'** On {v["label"]}', '', org_table(['Window \\ link'] + [str(i + 1) for i in range(len(fams))], rows), '']
    out += ['** Notes', ''] + [f'- {k}: {t}' for k, t in reg['notes'].items()] + ['']
    out += ['** Windows', ''] + [f'- {w["label"]}: {w["how"]}' for w in reg['windows']] + ['']

    out += ['* Gaps', '']
    if not reg['gaps']:
        out += [NO_GAPS, '']
    for g in reg['gaps']:
        out += [f'** {g["id"]} {g["title"]}', '', f'Evidence: {g["ev"]}. Code: {g["where"]}.', '', g['text'], '']
    return '\n'.join(out).rstrip('\n') + '\n'


# --------------------------------------------------------------------------
# HTML output
# --------------------------------------------------------------------------

E = lambda s: html.escape(str(s), quote=True)

CSS = """
/* Layout: a report. Counts, then the four answers (1a, 1b, 2a, 2b) and the
   gaps; 2b has a switch for the site the page is on. Cool slate palette of
   the org/*-mockups.html pages, one token per foreign host. */
:root {
    --bg: #e9edf1; --surface: #f8fafc; --ink: #18202b; --muted: #556070; --line: #cfd6df;
    --accent: #24527f; --accent-ink: #ffffff; --accent-soft: #dbe6f1;
    --ok: #2c7347; --ok-soft: #dcefe2; --warn: #8f5a00; --warn-soft: #f6e8cc; --err: #9b2218; --err-soft: #f6dcd8;
    --tab: #5d6878; --tab-soft: #e6e9ee;
    --shadow: 0 1px 0 rgba(20, 30, 45, 0.05), 0 12px 32px -18px rgba(20, 30, 45, 0.35);
    --site-sl: #8a3b12; --site-jl: #2f6b3a; --site-bs: #7a5a00; --site-bb: #5b2e86; --site-dg: #333333; --site-ia: #1d5c8f; --site-sfm: #a0336b;
    --site-other: #556070;
    --f-display: "Archivo", "Arial Narrow", "Helvetica Neue", Arial, sans-serif;
    --f-body: "IBM Plex Sans", "Segoe UI", system-ui, -apple-system, sans-serif;
    --f-mono: "IBM Plex Mono", ui-monospace, Consolas, "Courier New", monospace;
}
@media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
        --bg: #11161d; --surface: #19212b; --ink: #e2e7ee; --muted: #9aa5b4; --line: #2c3746;
        --accent: #86b4e2; --accent-ink: #0e1620; --accent-soft: #1f3248;
        --ok: #74c494; --ok-soft: #1c3326; --warn: #e3ac4c; --warn-soft: #3a2d14; --err: #f08a7d; --err-soft: #3d1f1b;
        --tab: #aab4c2; --tab-soft: #252e3a;
        --shadow: 0 1px 0 rgba(0, 0, 0, 0.3), 0 14px 34px -16px rgba(0, 0, 0, 0.7);
        --site-sl: #e59a6c; --site-jl: #8fcf98; --site-bs: #e3c25c; --site-bb: #c3a2e6; --site-dg: #cfcfcf; --site-ia: #8cc0ec; --site-sfm: #ec9cc4;
        --site-other: #9aa5b4;
        color-scheme: dark;
    }
}
:root[data-theme="dark"] {
    --bg: #11161d; --surface: #19212b; --ink: #e2e7ee; --muted: #9aa5b4; --line: #2c3746;
    --accent: #86b4e2; --accent-ink: #0e1620; --accent-soft: #1f3248;
    --ok: #74c494; --ok-soft: #1c3326; --warn: #e3ac4c; --warn-soft: #3a2d14; --err: #f08a7d; --err-soft: #3d1f1b;
    --tab: #aab4c2; --tab-soft: #252e3a;
    --shadow: 0 1px 0 rgba(0, 0, 0, 0.3), 0 14px 34px -16px rgba(0, 0, 0, 0.7);
    --site-sl: #e59a6c; --site-jl: #8fcf98; --site-bs: #e3c25c; --site-bb: #c3a2e6; --site-dg: #cfcfcf; --site-ia: #8cc0ec; --site-sfm: #ec9cc4;
    --site-other: #9aa5b4;
    color-scheme: dark;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body {
    background: var(--bg); color: var(--ink); font: 15px/1.55 var(--f-body); margin: 0;
    padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px));
    padding-block: 0 64px;
}
.wrap { max-width: 1240px; margin: 0 auto; display: grid; gap: 34px; }
h1, h2, h3 { font-family: var(--f-display); text-wrap: balance; margin: 0; }
h1 { font-size: clamp(28px, 4vw, 40px); font-weight: 800; font-stretch: 85%; letter-spacing: -0.01em; }
h2 { font-size: 22px; font-weight: 700; font-stretch: 90%; }
h3 { font-size: 16px; font-weight: 700; }
p { margin: 0; max-width: 76ch; }
code, .mono { font-family: var(--f-mono); font-size: 0.88em; }
a { color: var(--accent); }
.muted { color: var(--muted); }
.eyebrow { font: 600 11px/1 var(--f-body); letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
header.top { padding-block: 32px 0; display: grid; gap: 14px; }
.counts { display: flex; flex-wrap: wrap; gap: 10px 26px; font-variant-numeric: tabular-nums; }
.counts div { display: grid; }
.counts b { font: 700 26px/1.1 var(--f-display); font-stretch: 90%; }
.counts span { font-size: 12px; color: var(--muted); }
section.q { display: grid; gap: 12px; }
.q-head { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; }
.q-id { font: 700 13px/1 var(--f-mono); color: var(--accent); background: var(--accent-soft); border-radius: 4px; padding: 5px 7px; }
.panel { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); min-width: 0; }
.scroll { overflow-x: auto; }
table.r { border-collapse: collapse; width: 100%; font-size: 13.5px; font-variant-numeric: tabular-nums; }
table.r th, table.r td { padding: 7px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
table.r thead th { font: 600 11px/1.2 var(--f-body); letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
table.r tbody tr:last-child td { border-bottom: 0; }
.site-tag { font: 600 12px/1 var(--f-mono); padding: 3px 6px; border-radius: 4px; border: 1px solid currentColor; white-space: nowrap; }
.pt { font-family: var(--f-mono); font-size: 12.5px; white-space: nowrap; }
.url { font-family: var(--f-mono); font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
.b { display: inline-flex; gap: 5px; align-items: center; font: 600 12px/1 var(--f-body); padding: 4px 7px; border-radius: 999px; white-space: nowrap; text-decoration: none; }
.b-yes, .b-here { background: var(--ok-soft); color: var(--ok); }
.b-part, .b-gap { background: var(--warn-soft); color: var(--warn); }
.b-no { background: var(--err-soft); color: var(--err); }
.b-tab { background: var(--tab-soft); color: var(--tab); }
.b-na { background: transparent; color: var(--muted); }
.ev { font: 500 10.5px/1 var(--f-mono); color: var(--muted); border: 1px solid var(--line); border-radius: 3px; padding: 2px 4px; margin-left: 4px; }
.why { display: block; font-size: 12px; color: var(--muted); margin-top: 4px; max-width: 46ch; }
.sites { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.site { padding: 14px 16px; display: grid; gap: 8px; align-content: start; border-top: 4px solid var(--c); }
.site h3 { color: var(--c); display: flex; justify-content: space-between; gap: 8px; }
.site dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; font-size: 12.5px; }
.site dt { color: var(--muted); }
.site dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.site .pts { display: flex; flex-wrap: wrap; gap: 4px; }
.site .pts span { font: 500 11.5px/1 var(--f-mono); background: var(--bg); border-radius: 3px; padding: 3px 5px; }
.seg { display: flex; flex-wrap: wrap; gap: 6px; }
.seg button {
    font: 600 13px/1 var(--f-body); color: var(--ink); background: var(--surface);
    border: 1px solid var(--line); border-radius: 6px; padding: 9px 14px; cursor: pointer;
}
.seg button[aria-pressed="true"] { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
.seg button:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
table.m { border-collapse: separate; border-spacing: 3px; font-size: 12px; }
table.m th { font: 600 11px/1.25 var(--f-body); color: var(--muted); text-align: left; padding: 4px 6px; vertical-align: bottom; }
table.m thead th { min-width: 82px; }
table.m tbody th { white-space: nowrap; color: var(--ink); font-size: 12.5px; }
table.m td { padding: 0; }
table.m td .b { width: 100%; justify-content: center; border-radius: 4px; padding: 7px 4px; }
.legend { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; font-size: 12.5px; color: var(--muted); }
.note { padding: 12px 16px; font-size: 13.5px; display: grid; gap: 6px; }
.note ul { margin: 0; padding-left: 18px; display: grid; gap: 6px; }
.gaps { display: grid; gap: 10px; }
.gap { padding: 12px 16px; display: grid; gap: 6px; }
.gap h3 { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.gap .id { font: 700 13px/1 var(--f-mono); color: var(--warn); }
.gap .code { font-size: 12.5px; color: var(--muted); }
@media (prefers-reduced-motion: no-preference) { .seg button { transition: background 0.12s, color 0.12s; } }
"""

SCRIPT = """
document.querySelectorAll('[data-views]').forEach((group) => {
    group.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-view]');
        if (!b) return;
        group.querySelectorAll('button[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        document.querySelectorAll('[data-matrix]').forEach((t) => { t.hidden = t.dataset.matrix !== b.dataset.view; });
    });
});
"""


def _site_tag(s):
    """The coloured site abbreviation."""
    return f'<span class="site-tag" style="color:var(--site-{E(s["key"])}, var(--site-other))">{E(s["abbr"])}</span>'


def _state_cell(c):
    """A 1b cell: state badge, evidence, why, gap link."""
    glyph, label = {'yes': ('✔', 'works'), 'part': ('◐', 'partly'), 'no': ('✗', 'missing'), 'na': ('—', 'n/a')}[c['state']]
    out = f'<span class="b b-{E(c["state"])}">{glyph} {label}</span><span class="ev">{E(c["ev"])}</span>'
    why = E(c.get('why', ''))
    if c.get('gap'):
        why += f' <a href="#{E(c["gap"])}">{E(c["gap"])}</a>'
    return out + (f'<span class="why">{why.strip()}</span>' if why else '')


def render_html(reg):
    """The whole NON-MB-COVERAGE.html text."""
    sites, fams = reg['sites'], reg['families']
    n_pts = sum(len(s['pts']) for s in sites)
    n_ip_no = sum(1 for s in sites for pt in s['pts'] if pt['ip']['state'] == 'no')
    n_ip_part = sum(1 for s in sites for pt in s['pts'] if pt['ip']['state'] == 'part')
    counts = [(len(sites), 'sites'), (n_pts, 'pageTypes'), (len(reg['readers']), 'preview readers'),
              (n_ip_no, 'PTs with no preview before a render'), (n_ip_part, 'PTs with some'), (len(reg['gaps']), 'open gaps')]
    o = ['<!doctype html>', '<html lang="en">', '<head>', '<meta charset="utf-8">',
         '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
         '<!-- SKELETON-END: everything above this line is dropped when the page is published as an Artifact. -->',
         '<title>Foreign Site Coverage</title>',
         '<meta name="claude:viewport-fit-sides" content="cover">',
         '<!-- Generated by scripts/build-coverage-report.py from docs/non-mb-coverage.json. Do not edit:'
         ' edit the JSON and run the script. -->',
         '<link rel="preconnect" href="https://fonts.googleapis.com">',
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,500..800'
         '&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap">',
         '<style>' + CSS + '</style>',
         '<!--EMBED-->',
         '<script type="application/json" id="mockup-images">{}</script>',
         '</head>', '<body>', '<div class="wrap">']
    o += ['<header class="top">', '<span class="eyebrow">ShowAllEntityData · non-MusicBrainz sites</span>',
          '<h1>Which other sites get tables and previews</h1>',
          '<p>Every site other than musicbrainz.org that the script supports: its pageTypes (PT), where link previews '
          '(a card on hover, a window on Space) work, and which links inside a preview window open there or in a new tab.</p>',
          '<div class="counts">' + ''.join(f'<div><b>{n}</b><span>{E(l)}</span></div>' for n, l in counts) + '</div>',
          '</header>']

    # 1a
    o += ['<section class="q"><div class="q-head"><span class="q-id">1a</span><h2>Sites with pageTypes</h2></div>',
          '<div class="sites">']
    for s in sites:
        o.append(f'<article class="panel site" style="--c:var(--site-{E(s["key"])}, var(--site-other))">'
                 f'<h3><span>{E(s["name"])}</span><span class="mono">{len(s["pts"])} PT</span></h3><dl>'
                 f'<dt>host</dt><dd class="mono">{E(s["host"])}</dd>'
                 f'<dt>switch</dt><dd class="mono">{E(s["gate"])}</dd>'
                 f'<dt>previews</dt><dd class="mono">{E(s["preview"] or "sa_pop_ext")}</dd>'
                 f'<dt>extRoot</dt><dd class="mono">{E(s["extRoot"] or "—")}</dd>'
                 f'<dt>doc</dt><dd class="mono">{E(s["doc"])}</dd></dl>'
                 '<div class="pts">' + ''.join(f'<span>{E(pt["type"])}</span>' for pt in s['pts']) + '</div></article>')
    o += ['</div></section>']

    # 1b
    o += ['<section class="q"><div class="q-head"><span class="q-id">1b</span>'
          '<h2>Previews on the initial page and on the rendered table</h2></div>',
          '<div class="legend"><span class="b b-yes">✔ works</span><span class="b b-part">◐ partly</span>'
          '<span class="b b-no">✗ missing</span><span>Evidence: '
          + ' · '.join(f'<span class="ev">{E(k)}</span> {E(v)}' for k, v in reg['evidence'].items()) + '</span></div>',
          '<div class="panel scroll"><table class="r"><thead><tr><th>Site</th><th>pageType</th><th>URL</th><th>Mode</th>'
          '<th>Initial page</th><th>Rendered table</th></tr></thead><tbody>']
    for s in sites:
        for pt in s['pts']:
            o.append(f'<tr><td>{_site_tag(s)}</td><td class="pt">{E(pt["type"])}</td><td class="url">{E(pt["url"])}</td>'
                     f'<td>{E(pt["mode"])}</td><td>{_state_cell(pt["ip"])}</td><td>{_state_cell(pt["frp"])}</td></tr>')
    o += ['</tbody></table></div></section>']

    # 2a
    win_ext, all_links = set(reg['winExtReaders']), set(reg['allLinksReaders'])
    o += ['<section class="q"><div class="q-head"><span class="q-id">2a</span><h2>Link families the preview reads</h2></div>',
          '<p class="muted">The readers of <code>_EXT_READERS</code>, in order: the first that takes a link reads it. '
          '“Any window”: its links open in place in every window. “All links”: every link a reader takes opens in place in its own window.</p>',
          '<div class="panel scroll"><table class="r"><thead><tr><th>#</th><th>Reader</th><th>Links it reads</th><th>Asks</th>'
          '<th>Its window</th><th>Any window</th><th>All links</th></tr></thead><tbody>']
    for i, r in enumerate(reg['readers']):
        yes = lambda b: '<span class="b b-here">yes</span>' if b else '<span class="b b-na">—</span>'
        o.append(f'<tr><td>{i + 1}</td><td class="pt">{E(r["id"])}</td><td class="url">{E(r["links"])}</td>'
                 f'<td class="url">{E(r["asks"])}</td><td>{E(r["window"])}</td><td>{yes(r["id"] in win_ext)}</td>'
                 f'<td>{yes(r["id"] in all_links)}</td></tr>')
    o += ['</tbody></table></div></section>']

    # 2b
    sup = lambda ns: ''.join(f'<sup>{E(n[1:])}</sup>' for n in ns)
    o += ['<section class="q"><div class="q-head"><span class="q-id">2b</span><h2>Inside a window: opens here, or a new tab</h2></div>',
          '<p>A plain left click. Ctrl, Shift, Alt, ⌘ and the middle button always keep the new tab. '
          'The answer depends on the site the page is on:</p>',
          '<div class="seg" role="group" aria-label="The page is on" data-views>'
          + ''.join(f'<button type="button" id="view-{E(v["key"])}" data-view="{E(v["key"])}" aria-pressed="{str(i == 0).lower()}">'
                    f'on {E(v["label"])}</button>' for i, v in enumerate(reg['views'])) + '</div>',
          '<div class="legend"><span class="b b-here">here</span> opens in the window, Back returns '
          '<span class="b b-tab">tab</span> new tab <span class="b b-gap">tab G1</span> new tab, a gap below '
          '<span class="b b-na">—</span> no such window there</div>']
    for i, v in enumerate(reg['views']):
        o.append(f'<div class="panel scroll" style="padding:8px" data-matrix="{E(v["key"])}"{"" if i == 0 else " hidden"}>'
                 f'<table class="m" aria-label="On {E(v["label"])}"><thead><tr><th>Window ↓ · link →</th>'
                 + ''.join(f'<th title="{E(f["example"])}">{E(f["label"])}</th>' for f in fams) + '</tr></thead><tbody>')
        for w in reg['windows']:
            cells = []
            for f in fams:
                st, ns, gap = resolve(v['key'], w, f)
                title = E(f'{w["label"]} → {f["label"]}')
                if st == 'gap':
                    cells.append(f'<td><a class="b b-gap" href="#{E(gap)}" title="{title}">tab {E(gap)}</a></td>')
                else:
                    lab = {'here': 'here', 'tab': 'tab', 'na': '—'}[st]
                    cells.append(f'<td><span class="b b-{st}" title="{title}">{lab}{sup(ns)}</span></td>')
            o.append(f'<tr><th title="{E(w["how"])}">{E(w["label"])}</th>' + ''.join(cells) + '</tr>')
        o.append('</tbody></table></div>')
    o += ['<div class="panel note"><ul>' + ''.join(f'<li><sup>{E(k[1:])}</sup> {E(t)}</li>' for k, t in reg['notes'].items())
          + '</ul></div></section>']

    # Gaps
    o += ['<section class="q"><div class="q-head"><span class="q-id">⚑</span><h2>Gaps</h2></div><div class="gaps">']
    if not reg['gaps']:
        o.append(f'<p class="muted">{E(NO_GAPS)}</p>')
    for g in reg['gaps']:
        o.append(f'<article class="panel gap" id="{E(g["id"])}"><h3><span class="id">{E(g["id"])}</span>{E(g["title"])}'
                 f'<span class="ev">{E(g["ev"])}</span></h3><p>{E(g["text"])}</p><p class="code">Code: <code>{E(g["where"])}</code></p></article>')
    o += ['</div></section>']

    o += ['<section class="panel note"><span class="eyebrow">Keeping it current</span>',
          '<p>Generated from <code>docs/non-mb-coverage.json</code> by <code>scripts/build-coverage-report.py</code>, '
          'which also writes <code>NON-MB-COVERAGE.org</code>. <code>--check</code> fails when a site, pageType or reader '
          'exists in the userscript and not here, or the other way round, or when this page is stale.</p></section>',
          '</div>', '<script>' + SCRIPT + '</script>', '</body>', '</html>']
    return '\n'.join(o) + '\n'


# --------------------------------------------------------------------------
# Self-test
# --------------------------------------------------------------------------

def selftest():
    """Built-in tests: rules, tables, and every check against planted defects."""
    fails = []

    def eq(name, got, want):
        if got != want:
            fails.append(f'{name}: got {got!r}, want {want!r}')

    # Route rules.
    fam = {'key': 'bbgig', 'route': {'dg': 'here', 'bb': 'here^n1', '*': 'all^n2/gap:G1'}}
    win_all = {'key': 'mbent', 'allLinks': True, 'only': ['mb', 'dg']}
    win_plain = {'key': 'spr', 'allLinks': False}
    eq('rule here', resolve('dg', win_plain, fam), ('here', [], None))
    eq('rule here note', resolve('bb', win_plain, fam), ('here', ['n1'], None))
    eq('rule all → here', resolve('mb', win_all, fam), ('here', ['n2'], None))
    eq('rule all → gap', resolve('mb', win_plain, fam), ('gap', [], 'G1'))
    eq('rule only', resolve('ia', win_all, fam), ('na', [], None))
    eq('rule all → tab', resolve('mb', win_plain, {'key': 'wp', 'route': {'*': 'all'}}), ('tab', [], None))
    eq('rule window note', resolve('mb', {'key': 'dgfam', 'allLinks': True, 'notes': {'dg': 'n5'}},
                                   {'key': 'dg', 'route': {'*': 'all'}}), ('here', ['n5'], None))
    for bad in ('there', 'here/gap:G1', 'all^x', 'gap:X1'):
        try:
            parse_rule(bad)
            fails.append(f'rule {bad!r} parsed')
        except ValueError:
            pass

    # Org tables: aligned, "|" replaced.
    eq('org table', org_table(['a', 'bb'], [['x|y', 1]]), '| a   | bb |\n|-----+----|\n| x¦y | 1  |')

    # A tiny userscript and its registry.
    src = '\n'.join([
        "    const _isXxHost = true;",
        "    const _isYyHost = true;",
        "    const configSchema = {",
        "        sa_enable_xx: {",
        "        sa_xx_preview: {",
        "    };",
        "    function _foo() {}",
        "    const _DP_SITES = {",
        "        'xx.example': {",
        "            setting: 'sa_xx_preview',",
        "            extRoot: '#main',",
        "        },",
        "    };",
        "    const _DP_WIN_EXT_READERS = new Set(['b']);",
        "    const _DP_WIN_ALL_LINKS_READERS = new Set(['a']);",
        "    const _DP_WIN_ALL_LINKS_SOURCES = new Set(['mb-entity']);",
        "    const _MB_FOREIGN_POP_HOST = !!(_isXxHost);",
        "    const pageDefinitions = [",
        "        {",
        "            type: 'mb-thing',",
        "            tableMode: 'single',",
        "        },",
        "        {",
        "            type: 'xx-list',",
        "            host: 'xx.example',",
        "            buttons: [{ type: 'nested', host: 'not-me' }],",
        "            tableMode: 'multi',",
        "        },",
        "    ];",
        "    const _EXT_READERS = [",
        "        { id: 'a' },",
        "        { id: 'b' },",
        "    ];",
    ])
    files = {'docs/xx.md': 'doc', 'tests/x.spec.js': "test('a card shows', async () => {});"}
    reg = {
        'sites': [{'key': 'xx', 'abbr': 'XX', 'name': 'Xx', 'host': 'xx.example', 'hostVar': '_isXxHost',
                   'gate': 'sa_enable_xx', 'preview': 'sa_xx_preview', 'extRoot': '#main', 'doc': 'docs/xx.md', 'view': 'xx',
                   'pts': [{'type': 'xx-list', 'url': 'https://xx.example/', 'mode': 'multi',
                            'ip': {'state': 'yes', 'ev': 'spec', 'spec': ['tests/x.spec.js', 'a card shows']},
                            'frp': {'state': 'no', 'ev': 'code', 'gap': 'G1'}}]}],
        'readers': [{'id': 'a'}, {'id': 'b'}],
        'winExtReaders': ['b'], 'allLinksReaders': ['a'], 'allLinksSources': ['mb-entity'], 'mbForeignSites': ['xx'],
        'views': [{'key': 'mb', 'label': 'mb', 'sites': []}, {'key': 'xx', 'label': 'xx', 'sites': ['xx']}],
        'windows': [{'key': 'w', 'label': 'W', 'how': '', 'allLinks': True, 'notes': {'f': 'n1'}}],
        'families': [{'key': 'f', 'label': 'F', 'example': '', 'route': {'xx': 'here^n1', '*': 'all/gap:G1'}}],
        'notes': {'n1': 'a note'},
        'gaps': [{'id': 'G1', 'ev': 'code', 'title': 't', 'text': 't', 'where': '_foo()'}],
    }
    read = lambda path: files.get(path)
    eq('extract pts', extract(src)['pts'], [('xx.example', 'xx-list', 'multi')])
    eq('clean registry', check(reg, src, read), [])

    def planted(name, mutate_src=None, mutate_reg=None, expect=''):
        """One planted defect: check() must report a problem containing `expect`."""
        s2 = mutate_src(src) if mutate_src else src
        r2 = json.loads(json.dumps(reg))
        if mutate_reg:
            mutate_reg(r2)
        probs = check(r2, s2, read)
        if not any(expect in x for x in probs):
            fails.append(f'planted "{name}" not caught (problems: {probs})')

    planted('new PT in the userscript',
            lambda s: s.replace("    ];\n    const _EXT_READERS", "        {\n            type: 'xx-new',\n            host: 'xx.example',\n        },\n    ];\n    const _EXT_READERS"),
            expect='pageType xx-new is in the userscript')
    planted('new host in the userscript',
            lambda s: s.replace("    ];\n    const _EXT_READERS", "        {\n            type: 'zz-list',\n            host: 'zz.example',\n        },\n    ];\n    const _EXT_READERS"),
            expect='site zz.example')
    planted('PT dropped from the registry', mutate_reg=lambda r: r['sites'][0]['pts'].clear(), expect='pageType xx-list is in the userscript')
    planted('tableMode changed', lambda s: s.replace("tableMode: 'multi'", "tableMode: 'single'"), expect="tableMode 'single'")
    planted('extRoot changed', lambda s: s.replace("extRoot: '#main'", "extRoot: '#main, main'"), expect='extRoot')
    planted('preview setting changed', lambda s: s.replace("setting: 'sa_xx_preview'", 'setting: null'), expect='setting is None')
    planted('new reader', lambda s: s.replace("        { id: 'b' },", "        { id: 'b' },\n        { id: 'c' },"), expect='readers:')
    planted('reader order', lambda s: s.replace("{ id: 'a' },\n        { id: 'b' }", "{ id: 'b' },\n        { id: 'a' }"), expect='readers:')
    planted('window set', lambda s: s.replace("new Set(['b'])", "new Set(['b', 'a'])"), expect='winExtReaders')
    planted('MB foreign hosts', lambda s: s.replace('!!(_isXxHost)', '!!(_isXxHost || _isYyHost)'), expect='mbForeignSites')
    planted('host flag gone', lambda s: s.replace('const _isXxHost', 'const _isXHost'), expect='host flag')
    planted('setting gone', lambda s: s.replace('        sa_enable_xx: {', '        sa_enable_x: {'), expect='configSchema')
    planted('spec title gone', mutate_reg=lambda r: r['sites'][0]['pts'][0]['ip']['spec'].__setitem__(1, 'no such'), expect='no test title')
    planted('spec file gone', mutate_reg=lambda r: r['sites'][0]['pts'][0]['ip']['spec'].__setitem__(0, 'tests/none.spec.js'), expect='does not exist')
    planted('doc gone', mutate_reg=lambda r: r['sites'][0].__setitem__('doc', 'docs/none.md'), expect='topic doc')
    planted('bad state', mutate_reg=lambda r: r['sites'][0]['pts'][0]['ip'].__setitem__('state', 'maybe'), expect='state')
    planted('unknown gap', mutate_reg=lambda r: r['sites'][0]['pts'][0]['frp'].__setitem__('gap', 'G9'), expect='gap G9')
    planted('bad rule', mutate_reg=lambda r: r['families'][0]['route'].__setitem__('*', 'sometimes'), expect='bad route rule')
    planted('rule without *', mutate_reg=lambda r: r['families'][0]['route'].pop('*'), expect='no "*" rule')
    planted('unknown note', mutate_reg=lambda r: r['families'][0]['route'].__setitem__('xx', 'here^n7'), expect='note n7')
    planted('gap symbol gone', lambda s: s.replace('function _foo()', 'function _bar()'), expect='_foo is not declared')
    planted('site not in a view', mutate_reg=lambda r: r['views'][1]['sites'].clear(), expect='views:')
    # Its host then reads as the entry above's: caught, under that entry's name.
    planted('reformatted pageDefinitions', lambda s: s.replace("            type: 'xx-list',", "          type: 'xx-list',"),
            expect='pageType xx-list is in the registry, not in the userscript')

    # The outputs build, and twice the same.
    eq('org deterministic', render_org(load_registry()), render_org(load_registry()))
    eq('html deterministic', render_html(load_registry()), render_html(load_registry()))

    for f in fails:
        print('FAIL', f)
    print(f'selftest: {"FAILED" if fails else "ok"} ({len(fails)} failure(s))')
    return 1 if fails else 0


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def load_registry():
    """The registry as parsed JSON."""
    with open(REGISTRY, encoding='utf-8') as fh:
        return json.load(fh)


def main():
    """Command line entry point."""
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--check', action='store_true', help='exit 1 on a mismatch with the userscript or a stale output')
    ap.add_argument('--selftest', action='store_true', help='run the built-in tests')
    args = ap.parse_args()
    if args.selftest:
        return selftest()

    reg = load_registry()
    with open(USERSCRIPT, encoding='utf-8') as fh:
        src = fh.read()
    problems = check(reg, src)
    for x in problems:
        print('MISMATCH', x)
    outputs = {OUT_HTML: render_html(reg), OUT_ORG: render_org(reg)}
    stale = []
    for path, text in outputs.items():
        old = None
        if os.path.isfile(path):
            with open(path, encoding='utf-8') as fh:
                old = fh.read()
        if old == text:
            continue
        stale.append(os.path.relpath(path, ROOT))
        if not args.check:
            with open(path, 'w', encoding='utf-8') as fh:
                fh.write(text)
    if args.check:
        for s in stale:
            print('STALE', s, '(run python3 scripts/build-coverage-report.py)')
        ok = not problems and not stale
        print(f'coverage report: {"ok" if ok else "FAILED"} ({len(problems)} mismatch(es), {len(stale)} stale output(s))')
        return 0 if ok else 1
    print(f'coverage report: wrote {", ".join(stale) if stale else "nothing (up to date)"}; {len(problems)} mismatch(es)')
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
