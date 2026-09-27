#!/usr/bin/env python3
"""One-shot split of ShowAllEntityData/CLAUDE.md into a short core + docs/claude/*.md.

Why: Claude Code refuses to load a CLAUDE.md over 150k chars, and this one had
reached 229.5k. About 80% of it was per-feature design rationale that only
matters when touching that feature.

What it does, and why it is safe to re-run:

  - reads the ORIGINAL from git (`--source-rev`, default `main`), so it is
    repeatable on the branch and never reads its own output;
  - moves the topic sections VERBATIM into docs/claude/<topic>.md, headings
    unchanged (userscript comments and skills cite headings by name);
  - keeps the basics in CLAUDE.md, swaps three long sections (Performance,
    Settings, Testing (Playwright)) for a digest — their FULL text is also
    copied to docs/claude/, so nothing is lost — and adds a "Doc map";
  - refuses to write unless a lossless check passes: every heading is assigned
    exactly once, every moved section is byte-identical in its target, and
    every original line survives in some output except the few deliberately
    edited by REPLACEMENTS.

    python3 scripts/split-claude-md.py            # write
    python3 scripts/split-claude-md.py --check    # verify only, write nothing
"""

import argparse
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
GIT_ROOT = ROOT.parent
CLAUDE = ROOT / 'CLAUDE.md'
DOCS = ROOT / 'docs' / 'claude'
DATE = '2026-09-27'

# file -> (title, [heading prefixes]). Order inside a file follows the
# ORIGINAL file order, not this list's.
MOVES = {
    'fetch-and-render-pipeline.md': (
        'Fetch and render pipeline',
        ['`startFetchingProcess()` is entered TWICE',
         'The heading pre-processing must never',
         'Critical bug fix: user-tags container re-root',
         'HTTP failure classification',
         'A truncated fetch must never',
         'Release events: one request']),
    'artwork-caa-eaa.md': (
        'CAA/EAA artwork',
        ['CAA/EAA artwork — what must not break',
         'The artwork summary panel',
         'CAA/EAA retry']),
    'filter-and-cache-invariants.md': (
        'Filter, cache and collapse invariants',
        ['Writing cell text AFTER the render',
         '`collapsableColumns`: list vs. prose cells',
         'The collapsed-cell',
         'The cell finders must agree']),
    'deferred-columns-picard-relationships.md': (
        'Deferred columns: Picard and Relationships',
        ['Picard column',
         'Relationships column',
         'The automatic retry pass',
         'Relationships retry']),
    'release-tracks-and-length.md': (
        'release-tracks ARs and track length',
        ['`release-tracks`: dynamic AR-column classification',
         '`release-tracks` has TWO AR levels',
         'Track length precision']),
    'uniq-dropdown.md': (
        'Unique-values dropdown (📊)',
        ['Unique-values dropdown',
         'Flags in the dropdown']),
    'toolbar-and-header-ui.md': (
        'Toolbar, header controls and pills',
        ['Column-header toggle family',
         'The h1 toolbar',
         '↔️ Resize and 👁️ Visible',
         '❓ opens GitHub',
         'The h2/h3 control runs',
         'Column resize']),
}

# Sections whose FULL text goes to docs/claude/ while CLAUDE.md keeps a digest
# under the same heading.
DIGESTED = {
    'Performance is a priority': ('performance-rules.md', 'Performance rules'),
    'Settings keys': ('settings-and-config.md', 'Settings and config'),
    'Testing (Playwright)': ('testing-playwright.md', 'Testing with Playwright'),
}

# Everything else stays in CLAUDE.md as-is (subject to REPLACEMENTS).
KEPT = [
    'Project overview', 'File structure', 'Page definition anatomy',
    'Render pipeline', 'Testing expectations', 'Publishing:', 'Git Workflow',
    'File Safety', 'Tooling Conventions', 'Debugging DOM/Rendering Bugs',
    'DOM conventions', 'Things to check before any DOM-related fix',
    'Plan Mode', 'Debug channels', 'Debug material',
    'Adding a new page type', 'Adding a new column extractor',
    'Common pitfalls',
]

# Small edits to KEPT sections whose "below"/"above" now points at a moved
# section. Each `old` must occur exactly once.
REPLACEMENTS = {
    'Project overview': [
        ('see its own section below)',
         'see docs/claude/toolbar-and-header-ui.md)'),
    ],
    'File structure': [
        ("(see its own section below)",
         "(see docs/claude/release-tracks-and-length.md)"),
    ],
    'Testing expectations': [
        ('CAA/EAA presence-sorting bug above went unnoticed',
         'CAA/EAA presence-sorting bug (docs/claude/artwork-caa-eaa.md) went unnoticed'),
    ],
    'DOM conventions': [
        ('spans; see its own section',
         'spans; see docs/claude/filter-and-cache-invariants.md'),
        ('(see `collapsableColumns` below)',
         '(see `collapsableColumns` in docs/claude/filter-and-cache-invariants.md)'),
        ('the precedent `collapsableColumns` below points to',
         'the precedent `collapsableColumns` (docs/claude/filter-and-cache-invariants.md) points to'),
        ('(see `SYN_SECTION_META` below)',
         '(see `SYN_SECTION_META` in docs/claude/uniq-dropdown.md)'),
    ],
    'Debug material': [
        ('index-only exception to an ignore rule. Always read it before starting work,\n'
         '  and append a dated entry when you finish — write it as durable, reviewable\n'
         '  material, not scratch',
         'index-only exception to an ignore rule. **It is ~1 MB with 200+ dated\n'
         '  entries — never read it whole**: `grep -n` for the function, pageType or\n'
         '  symptom you are about to touch and read those entries, plus the last\n'
         '  three, before starting work. Append a dated entry when you finish —\n'
         '  write it as durable, reviewable material, not scratch'),
    ],
}

DOC_MAP = '''## Doc map — what to read, and when

This file is deliberately the short version. Per-feature design rationale lives
in `docs/claude/`, split out of this file **verbatim** on %(date)s with every
section heading unchanged (userscript comments and skills cite headings by
name, so `grep -rn "<heading text>" docs/claude/` finds them). **Read the topic
file BEFORE changing code in its area** — each one records rules that fail
silently when broken. Plain paths, not imports: nothing below is in context
until you open it.

| Read (under `docs/claude/`)               | When you touch                                                                                          | The one rule to carry even if you do not open it                                                                                           |
|-------------------------------------------|---------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| `fetch-and-render-pipeline.md`            | `startFetchingProcess()`, resume, heading pre-processing, `user/*/tags`, WS/2 retries, partial fetches  | A second press RELOADS (only `_isResume` re-enters); only a SUCCESSFUL WS/2 answer is cached; a short fetch goes through `_fetchIncompleteSummary()` |
| `artwork-caa-eaa.md`                      | CAA/EAA columns, inline thumbnails, big-image strips, artwork sorting/filtering, retry, summary panel   | Sorting/filtering by artwork keep working — presence sort goes through `_sortCellText()`; the summary panel makes ZERO requests           |
| `filter-and-cache-invariants.md`          | Anything that writes cell text after render, `collapsableColumns`, highlights, `colFilters`             | Post-render cell writes owe FOUR things (uniq cache, `_filterResultCache`, `_rowTextCache` on the SOURCE row, re-run `runFilter()`); `colFilters` can hold two entries per column |
| `deferred-columns-picard-relationships.md`| Picard column, Relationships column (load states, retry, batching, auto-retry)                          | Never remove the deferred column\'s `<td>`; write to master rows too (multi-table clones); the auto-retry is bounded four ways             |
| `release-tracks-and-length.md`            | `release-tracks` AR columns, `treleases`/Length precision, ⏱ millisecond toggle, length-mismatch flags  | AR finders use `.filter()`, never `.find()`; `_findAllArDts()` stays `:scope > dl.ars > dt`; ask `_isJesus2099Treleases()`, never the bare class |
| `uniq-dropdown.md`                        | 📊 dropdown sections/entries (`SYN_SECTION_META`), flag icons in entries                                | A new section = `SYN_SECTION_META` + the two lookup tables; a real flag goes AFTER the label, never in the marker slot                     |
| `toolbar-and-header-ui.md`                | Column-header buttons, h1 toolbar menus, h2/h3 button runs, ❓ help, column resize                      | Extend the shared CSS selector lists, never copy a block; NO backtick in a `GM_addStyle` comment; menus ADOPT existing buttons, activate via `_toolbarInvoke()` |
| `settings-and-config.md`                  | `configSchema`, `default:` changes, settings dialog, config export/import                               | See the digest below; full text has the migration and workspace-export rules                                                               |
| `testing-playwright.md`                   | Writing/running specs, fixtures, live specs, harness helpers                                            | See the digest below; full text has the CAA/EAA and threshold-dialog traps                                                                 |
| `performance-rules.md`                    | Anything on the filter/sort/render/artwork hot path, measurements                                       | See the digest below; full text has the baselines                                                                                          |

**Big files — grep, never read whole** (a whole read costs 10–250k tokens):
`DEBUG-NOTES.md` (dated root-cause log, ~1 MB), `PERFORMANCE.org`,
`tests/MEASUREMENTS.org`, `tests/live/registry.org`,
`tests/snapshots/registry.org`, `PAGETYPES-TESTING-REFERENCE.org`, `AUDIT.md`,
`org/503-handling.org`, `org/config-handling.org`,
`ShowAllEntityData_HELP.md`. Grep by function, `Step N`, pageType or symptom
and `Read` with `offset`/`limit`.

**Small and current:** `tests/README.org` (how to run each suite),
`FORUM.org`, `org/picard.org`, `org/relationships.org`,
`org/action-button-redesign.org`. **Backlog:** `org/TODO.org` (active),
`REFACTORING.org`.

**Historical — do not read unless asked:** the other `org/*.org` files
(finished prompt/answer session logs; their conclusions already live in
`DEBUG-NOTES.md` and `PERFORMANCE.org`), `org/artist-releases-filterSort-test-report*.org`
(generated), `org/tag-rock-*.org` (raw HTML dumps), `tasks/*.md` (old plans;
`tasks/task-playwright-*` are cited by two skills), and the repo-root
`README.org` (pasted terminal transcripts).
''' % {'date': DATE}

DIGEST_PERF = '''## Performance is a priority

**A gate, not an afterthought. If a change would make filtering, sorting,
rendering or artwork throughput worse, flag it BEFORE implementing and let the
user decide** — including when the change is otherwise correct and the
regression is the price of correctness. Say what gets slower, by roughly how
much, and what the alternative would be.

- `PERFORMANCE.org` holds the measurements and the numbered Steps (grep
  `Step N`); its TODO/DONE keyword tracks "landed on `main`", not effort.
  Re-read it for prose your change made FALSE when you implement AND when you
  merge, then run `python3 scripts/audit-docs.py` (derives the "DONE set is
  exactly Steps …" sentence; fails on a `~:NNNNN~` line reference — name the
  symbol instead).
- **Every timing records the machine and the wall-clock time** — host, UTC
  start/finish; `capture-interaction-perf.js`/`capture-snapshots.js` write a
  `machine` block. Filenames carry version, capture date and hostname. Rows go
  in `tests/MEASUREMENTS.org` with the page's pageType, `tableMode` and title.
- **Never quote an absolute across versions or sessions.** Capture your own
  `main` arm beside your branch's in one session and quote only the ratio;
  bisect before attributing a gap to anything.
- Committed baselines: `tests/snapshots/artist-events/interaction-perf-*.json`
  and `tests/snapshots/artist-releasegroups/perf-baseline*.json`; the
  `run-perf-comparison` skill runs and interprets them.

Full text, reference numbers and reasoning: `docs/claude/performance-rules.md`.
'''

DIGEST_SETTINGS = '''## Settings keys (GM storage via `Lib.settings`)

All settings are prefixed `sa_`. The full set is
`ShowAllEntityData_CONFIG_DEFAULTS.json` (generated from `configSchema` by
`scripts/dump-config-defaults.py`) — read it rather than memory; nothing in the
userscript reads that file.

- **Changing a `default:` owes three things**: the schema value, every inline
  fallback literal (`Lib.settings.sa_X || literal` — grep the key), and an
  entry in `_SETTINGS_MIGRATIONS` naming the value it moved away from
  (otherwise everyone who ever pressed SAVE keeps the old one). Run
  `scripts/audit-config-defaults.py`; refresh
  `scripts/config-default-history.json` with `scripts/dump-default-history.py`.
- **Read numeric settings with `typeof === 'number' && >= 0` or `??`, never
  `|| default`** — `0` is falsy (`sa_render_threshold` has this defect).
- **Every route to the settings dialog goes through `Lib.configureSettings()`**;
  `_registerSettingsIntegration()` records the registry and `beforeOpen` hook
  once — never pass them at a call site.
- `type: 'table'` settings receive new built-in rows through
  `sa_table_seed_ledger`; `_seedNewTableRows()` is called at the FOOT of the
  IIFE (TDZ). The config export's `workspace` block is declared only by
  `_CFG_WORKSPACE_GROUPS` — verbatim values, allowlist not sweep.
- Only `applyVisibility()` may assign `display` to a settings row or header.
- A fixture profile is not pristine (`FIXTURE_SETTINGS_OVERRIDE` forces two
  settings off).

Full text: `docs/claude/settings-and-config.md`; design history:
`org/config-handling.org`.
'''

DIGEST_TESTING = '''## Testing (Playwright)

The harness lives under `tests/`; how to run each suite and what it costs:
`tests/README.org`.

- **`chromium-fixtures`** (`tests/fixtures/*.spec.js`, local HTML, no
  network): `npm test` = everything except `@slow`; `npm run test:slow`;
  **`npm run test:full` is the merge gate**. The two `@slow` specs
  (`rel-auto-retry-failed` ~295 s, `resume-from-failed-page` ~84 s) spend
  their time in the rate gates and backoffs under test — do not shorten them.
- **`chromium-live`** (`tests/live/*.spec.js`, real musicbrainz.org, one tag
  each): `@core` (`npm run test:live`), `@extended`, `@perf`;
  `npm run test:all` runs everything. `npm run auth:login` writes
  `playwright/.auth/vzell.json` (gitignored) — without it live specs run
  logged out, silently.
- Registries: `tests/pagetypes.json`, `tests/snapshots/registry.org` (what is
  captured + "Expected drift"), `tests/live/registry.org`,
  `PAGETYPES-TESTING-REFERENCE.org` (coverage plan). Helpers:
  `tests/support/{customDialog,diskFixture,subtableTab,toolbarMenu,liveAssertions}.js`.
- **`FIXTURE_SETTINGS_OVERRIDE`** (`tests/support/loadPage.js`) forces
  `sa_enable_caa_pics` and `sa_enable_relationships_column` OFF — a "cannot
  reproduce" means nothing until they are back on.

**Threshold dialogs will stall a test.** Four blocking plain-DOM overlays (not
native `confirm()`, so `page.on('dialog')` never fires):

| Gate                         | Fires when                                                    | Cleared by                                        |
|------------------------------|---------------------------------------------------------------|---------------------------------------------------|
| `ℹ️ Unknown Page Count`       | `features.unboundedPagination` + ambiguous pagination widget  | `dismissCustomConfirmDialog()`                    |
| `⚠️ High Page Count`          | `maxPage > sa_max_page` (default **50**)                      | `dismissCustomConfirmDialog()`                    |
| `showRenderDecisionDialog()` | `totalRows > sa_render_threshold` (default **5000**)          | click `#mb-dialog-render` — the helper cannot     |
| `⚠️ Large Render Warning`     | `totalRows > sa_render_warning_threshold` (default **10000**) | `dismissCustomConfirmDialog()`                    |

Prefer seeding settings so they never fire (`seedGmValues` in
`tests/pagetypes.json`, `buildGmStubsScript(initialValues)`, `realNetworkGmXhr`'s
`settingsOverride`). **`sa_render_threshold: 0` does NOT disable** (falsy →
5000) — seed a large number. The last two gates fire AFTER the fetch, so
hitting one burns the whole fetch.

**CAA/EAA specs:** expand every sub-table and uncollapse the big-image strips
BEFORE measuring, and assert it worked; never click the master toggle
unconditionally; re-expand after every discography view switch; settle, don't
sleep. `waitForCaaEaaComplete()` / `waitForRelationshipsComplete()` do NOT work
on a large page — poll the painted count until stable.

Full text: `docs/claude/testing-playwright.md`.
'''

DIGESTS = {
    'Performance is a priority': DIGEST_PERF,
    'Settings keys': DIGEST_SETTINGS,
    'Testing (Playwright)': DIGEST_TESTING,
}


def git_show(rev):
    """Returns the CLAUDE.md text at a git revision."""
    rel = CLAUDE.relative_to(GIT_ROOT)
    return subprocess.run(['git', 'show', f'{rev}:{rel}'], cwd=GIT_ROOT,
                          check=True, capture_output=True, text=True).stdout


def parse(text):
    """Splits into (preamble, [(heading_line, section_text)]) on top-level '## '."""
    lines = text.split('\n')
    preamble, sections, cur, fence = [], [], None, False
    for line in lines:
        if line.startswith('```'):
            fence = not fence
        if not fence and line.startswith('## '):
            cur = [line]
            sections.append(cur)
        elif cur is None:
            preamble.append(line)
        else:
            cur.append(line)
    return ('\n'.join(preamble),
            [(s[0], '\n'.join(s)) for s in sections])


def classify(heading):
    """Returns ('move', file) | ('digest', key) | ('keep', None) for a '## ' line."""
    name = heading[3:]
    for fname, (_, prefixes) in MOVES.items():
        if any(name.startswith(p) for p in prefixes):
            return 'move', fname
    for key in DIGESTED:
        if name.startswith(key):
            return 'digest', key
    for key in KEPT:
        if name.startswith(key):
            return 'keep', key
    return None, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source-rev', default='main')
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()

    original = git_show(args.source_rev)
    preamble, sections = parse(original)
    problems = []

    rebuilt = preamble + '\n' + '\n'.join(t for _, t in sections)
    if rebuilt.strip() != original.strip():
        problems.append('parse is not lossless: preamble + sections != original')

    outputs = {}            # filename -> list of section texts (docs)
    core = []               # (kind, text)
    seen_keep = set()
    for heading, text in sections:
        kind, key = classify(heading)
        if kind is None:
            problems.append(f'unclassified heading: {heading}')
            continue
        if kind == 'move':
            outputs.setdefault(key, []).append(text)
        elif kind == 'digest':
            fname = DIGESTED[key][0]
            outputs.setdefault(fname, []).append(text)
            core.append(('digest', DIGESTS[key]))
        else:
            seen_keep.add(key)
            new = text
            for old, rep in REPLACEMENTS.get(key, []):
                if new.count(old) != 1:
                    problems.append(f'REPLACEMENT for "{key}" matches '
                                    f'{new.count(old)}x, need 1: {old[:50]!r}')
                else:
                    new = new.replace(old, rep)
            core.append(('keep', new))
    for key in KEPT:
        if key not in seen_keep:
            problems.append(f'KEPT heading never matched: {key}')
    moved_headings = sum(len(v) for v in outputs.values())
    expected = sum(len(p) for _, p in MOVES.values()) + len(DIGESTED)
    if moved_headings != expected:
        problems.append(f'moved {moved_headings} sections, expected {expected}')

    titles = {f: t for f, (t, _) in MOVES.items()}
    titles.update({f: t for f, t in DIGESTED.values()})
    docs = {}
    for fname, texts in outputs.items():
        head = (f'<!-- Split out of ShowAllEntityData/CLAUDE.md on {DATE}, verbatim '
                f'(section headings unchanged). This file is the authority for its '
                f'topic; CLAUDE.md keeps only a digest and the doc map. -->\n\n'
                f'# {titles[fname]}\n\n')
        docs[fname] = head + '\n\n'.join(t.strip('\n') for t in texts) + '\n'

    # Assemble core: preamble, first kept section, doc map, the rest.
    parts = [preamble.strip('\n')]
    doc_map_done = False
    for kind, text in core:
        parts.append(text.strip('\n'))
        if not doc_map_done:
            parts.append(DOC_MAP.strip('\n'))
            doc_map_done = True
    new_core = '\n\n'.join(parts) + '\n'

    # Lossless checks.
    for _, text in sections:
        kind, key = classify(text.split('\n')[0])
        if kind == 'move' and text.strip('\n') not in docs[key]:
            problems.append(f'moved section not byte-identical: {text.split(chr(10))[0]}')
        if kind == 'digest' and text.strip('\n') not in docs[DIGESTED[key][0]]:
            problems.append(f'digested section not copied in full: {text.split(chr(10))[0]}')
    out_lines = set(new_core.split('\n'))
    for d in docs.values():
        out_lines.update(d.split('\n'))
    olds = [old for reps in REPLACEMENTS.values() for old, _ in reps]
    for line in original.split('\n'):
        if line in out_lines or not line.strip():
            continue
        if any(line.strip() in old or old in line for old in olds):
            continue
        problems.append(f'original line lost: {line[:100]!r}')

    for fname, d in sorted(docs.items()):
        print(f'{len(d):8d} chars  docs/claude/{fname}')
    print(f'{len(new_core):8d} chars  CLAUDE.md   (original {len(original)})')
    if problems:
        print('\nFAILED:')
        for p in problems:
            print('  -', p)
        sys.exit(1)
    print('lossless check passed')
    if args.check:
        return
    DOCS.mkdir(parents=True, exist_ok=True)
    for fname, d in docs.items():
        (DOCS / fname).write_text(d, encoding='utf-8')
    CLAUDE.write_text(new_core, encoding='utf-8')
    print(f'wrote {len(docs)} docs + CLAUDE.md')


if __name__ == '__main__':
    main()
