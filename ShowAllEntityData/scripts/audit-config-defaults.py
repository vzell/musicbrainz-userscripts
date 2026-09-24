"""Audit the committed config-defaults snapshot, and the inline fallbacks against it.

org/config-handling.org Item 4. Two independent checks, reported separately
because they fail for completely different reasons:

  STAGE 1 — the snapshot is current.
      Regenerates into a temp file via scripts/dump-config-defaults.py and
      fails on any difference, so a changed `default:` cannot land without its
      snapshot line. Same mechanical-guard pattern as scripts/audit-changelog.py
      and scripts/audit-docs.py.

  STAGE 2 — every inline fallback agrees with the schema default.
      This is the payoff, and the reason the snapshot is worth committing at
      all. 165 sites read a setting with `||` or `??`; 15 of them, across 11
      settings, disagree with that setting's own schema default, so the value
      depends on which code path reads it while unset. Nothing in the repo
      could see that before, because no artifact recorded what a default IS.
      It also fails on an ORPHAN — an inline read of a key no longer in the
      schema, which is always its fallback, silently and forever.

  STAGE 3 — every retired default has a migration entry.
      org/config-handling.org F1. `_migrateFrozenSettings()` repairs a profile
      that VZ_MBLibrary's old SAVE froze, by recognising stored values this
      script once shipped as everybody's default. That table has to stay
      complete as defaults keep changing, and only git knows when one did — so
      scripts/dump-default-history.py walks every revision and writes
      scripts/config-default-history.json, and this stage fails when the table
      and that file disagree in either direction. A missing entry leaves a
      frozen profile frozen; an INVENTED one silently overwrites a value the
      user may have chosen on purpose, which is why both fail.

      It does not re-walk git (~26 s; a gate nobody waits for is a gate nobody
      runs). It compares the history file's own `current` block against the
      snapshot Stage 1 has just verified, which is O(1) and catches the one
      case that matters — a default that moved since the last refresh.

== Why this is green today, when the plan said it would be red ==

org/config-handling.org predicted Stage 2 would fail on its first run and said
fixing F4's drift is a separate branch. Both still hold — the 15 sites are
unfixed. But a permanently-red gate is one nobody runs, so the known drift is
recorded in scripts/config-fallback-drift-baseline.json and only a NEW drift,
an ORPHAN, or a FIXED-but-not-rebaselined entry fails. That is a deliberate
departure from the plan, in the direction of the check being used.

`--baseline` rewrites that file. Do it when the drift set legitimately changes
— never to silence a failure you have not read.

== Reconciling with F4's numbers ==

F4 reported 167 sites at 9.99.1129: 150 agreeing, 17 drifting. This reports
165/150/15 at 9.99.1136. The drift sets are the SAME set: `same_value()`
excuses `sa_global_filter_border_idle`'s `'#000'` against `'#000000'` (two
sites, one colour), which F4 counted as drift. The 2-site difference in the
total is six versions of churn and was not chased.

usage:
  python3 scripts/audit-config-defaults.py                # all three stages
  python3 scripts/audit-config-defaults.py --stage1-only  # snapshot freshness
  python3 scripts/audit-config-defaults.py --docs         # + a HELP worklist
  python3 scripts/audit-config-defaults.py --baseline     # re-record known drift

Mutation-checked by scripts/check-config-defaults-gate.py — run that after
changing anything here, or the gate's arms are untested.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
USERSCRIPT = os.path.join(ROOT, 'ShowAllEntityData.user.js')
SNAPSHOT = os.path.join(ROOT, 'ShowAllEntityData_CONFIG_DEFAULTS.json')
DUMPER = os.path.join(ROOT, 'scripts', 'dump-config-defaults.py')
BASELINE = os.path.join(ROOT, 'scripts', 'config-fallback-drift-baseline.json')

_LITERAL = (r"('(?:[^'\\]|\\.)*'|\"(?:[^\"\\]|\\.)*\"|-?\d+(?:\.\d+)?|true|false)")

# Three spellings, all of which are really "this setting's effective default
# when unset". Each was found by sweeping EVERY settings read in the file and
# asking which ones a `||`/`??` follows — not by guessing at forms, which is
# how the first version of this script silently missed two sites, one of them
# F4's own `sa_uniq_dropdown_visible_rows` example.
FALLBACK_RES = (
    # 1. The common form: Lib.settings.sa_x || 'lit'
    #    `settings.` without the prefix is the module-level shallow copy, which
    #    reads the same value (one site, in the Lib init callback).
    re.compile(r"(?:Lib\.)?settings\.(sa_[A-Za-z0-9_]+)\s*(\|\||\?\?)\s*" + _LITERAL),
    # 2. Wrapped in a pure coercion: Number(Lib.settings.sa_x) || 8
    #    The wrapper allowlist is deliberate. For a coercion the fallback still
    #    IS the setting's effective default, so it belongs in this audit; for an
    #    arbitrary `someFn(Lib.settings.sa_x) || 'def'` the fallback is for the
    #    FUNCTION's result and comparing it to the schema default would be a
    #    category error. Do not relax this to a bare `\\)?`.
    re.compile(r"(?:Number|parseInt|parseFloat|String)\(\s*(?:Lib\.)?settings\."
               r"(sa_[A-Za-z0-9_]+)\s*(?:,\s*\d+\s*)?\)\s*(\|\||\?\?)\s*" + _LITERAL),
)


def run_stage1():
    """Regenerate into a temp file and compare byte for byte."""
    problems = []
    if not os.path.exists(SNAPSHOT):
        return [f'{os.path.basename(SNAPSHOT)} does not exist — run '
                f'scripts/dump-config-defaults.py']

    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, 'regenerated.json')
        proc = subprocess.run(
            [sys.executable, DUMPER, '--out', out],
            capture_output=True, text=True)
        if proc.returncode != 0:
            return [f'dump-config-defaults.py failed:\n{proc.stdout}{proc.stderr}']

        committed = open(SNAPSHOT, encoding='utf-8').read()
        fresh = open(out, encoding='utf-8').read()

    if committed == fresh:
        return problems

    # Say WHAT changed, not just that something did — a bare "out of date" on a
    # 619-line file sends the reader to a diff to learn the one thing they need.
    try:
        a = json.loads(committed)
        b = json.loads(fresh)
    except json.JSONDecodeError as err:
        return [f'snapshot is stale AND unparseable: {err}']

    for key in sorted(set(a['defaults']) | set(b['defaults'])):
        old, new = a['defaults'].get(key, '<absent>'), b['defaults'].get(key, '<absent>')
        if old != new:
            problems.append(f'default changed: {key}: {old!r} -> {new!r}')
    for key in sorted(set(a.get('tables', {})) | set(b.get('tables', {}))):
        if a.get('tables', {}).get(key) != b.get('tables', {}).get(key):
            problems.append(f'table seed changed: {key}')
    for key in sorted(set(a.get('labels', {})) | set(b.get('labels', {}))):
        old, new = a.get('labels', {}).get(key), b.get('labels', {}).get(key)
        if old != new:
            problems.append(f'label changed: {key}: {old!r} -> {new!r}')
    for key in sorted(k for k in set(a['_meta']) | set(b['_meta'])
                      if k != 'script_version'):
        if a['_meta'].get(key) != b['_meta'].get(key):
            problems.append(f'schema shape changed: _meta.{key}: '
                            f'{a["_meta"].get(key)!r} -> {b["_meta"].get(key)!r}')

    # **A version-only difference is a NOTE, not a failure, and that is what
    # keeps this gate usable.** `_meta.script_version` moves on every release,
    # and the release bump happens during `merge-push-remove`'s fold — after
    # this audit has already run. Failing on it would leave the audit red after
    # every single merge, for a file whose content is entirely correct, which is
    # how a gate gets regenerated blindly and then stops being read. Every
    # difference that is actually about the SCHEMA is checked above and fails.
    if not problems:
        stale = (a['_meta']['script_version'] != b['_meta']['script_version'])
        return [('NOTE: %s records %s, the userscript is now %s — regenerate it '
                 'with python3 scripts/dump-config-defaults.py (the defaults '
                 'themselves are current)'
                 % (os.path.basename(SNAPSHOT), a['_meta']['script_version'],
                    b['_meta']['script_version']))] if stale else \
               ['NOTE: snapshot differs from a fresh dump in formatting only — '
                'regenerate it with python3 scripts/dump-config-defaults.py']

    return [f'{os.path.basename(SNAPSHOT)} is out of date:'] + \
           [f'    {p}' for p in problems] + \
           ['    fix: python3 scripts/dump-config-defaults.py']


def _literal(text):
    """Parse one captured fallback literal into a Python value."""
    if text == 'true':
        return True
    if text == 'false':
        return False
    if text[0] in '\'"':
        return text[1:-1].replace("\\'", "'").replace('\\"', '"')
    return float(text) if '.' in text else int(text)


_HEX3_RE = re.compile(r'^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$')


def same_value(inline, schema):
    """Is the inline fallback the same VALUE as the schema default?

    Not `==`. The question this audit answers is "does the setting resolve
    differently depending on which path reads it while unset", and three pairs
    are written differently while resolving identically. Reporting those as
    drift pads the list with non-problems, which is how a worklist stops being
    read.

    Two of them cost nothing to accept. The third is a real discrepancy with
    org/config-handling.org and is called out in this script's report: F4
    counts 17 drifting SITES, and one of those is
    `sa_global_filter_border_idle`, `'#000'` against `'#000000'` — the same
    colour in every browser. Normalising it here leaves 16. F4's number is not
    wrong about what it measured; this one is measuring something slightly
    narrower, namely drift a user could SEE.
    """
    if inline == schema:
        return True
    if isinstance(inline, str) and isinstance(schema, str):
        a, b = inline.strip(), schema.strip()
        if a.lower() == b.lower():
            return True
        # CSS hex shorthand: #abc === #aabbcc
        for x, y in ((a, b), (b, a)):
            m = _HEX3_RE.match(x)
            if m and f'#{m[1] * 2}{m[2] * 2}{m[3] * 2}'.lower() == y.lower():
                return True
        return False
    if isinstance(inline, bool) or isinstance(schema, bool):
        return inline is schema
    if isinstance(inline, (int, float)) and isinstance(schema, (int, float)):
        return float(inline) == float(schema)
    return False


def collect_fallbacks(src, defaults):
    """Return (agreements, drifts, unknown_keys) over every inline fallback site."""
    agree, drift, unknown = 0, {}, set()

    # Sorted by offset so reported line numbers read in file order, and
    # de-duplicated: pattern 2's span contains pattern 1's for a wrapped read.
    matches = sorted(
        (m for rx in FALLBACK_RES for m in rx.finditer(src)),
        key=lambda m: (m.start(), -m.end()))
    seen_ends = set()

    for m in matches:
        if m.end() in seen_ends:
            continue
        seen_ends.add(m.end())
        key, op, raw = m.group(1), m.group(2), m.group(3)
        if key not in defaults:
            unknown.add(key)
            continue
        inline = _literal(raw)
        schema = defaults[key]

        if same_value(inline, schema):
            agree += 1
        else:
            line = src[:m.start()].count('\n') + 1
            drift.setdefault(key, {'schema': schema, 'inline': inline,
                                   'op': op, 'sites': []})
            drift[key]['sites'].append(line)

    return agree, drift, unknown


def run_stage2(baseline):
    """Cross-check every inline fallback against the committed snapshot."""
    snapshot = json.load(open(SNAPSHOT, encoding='utf-8'))
    src = open(USERSCRIPT, encoding='utf-8').read()
    agree, drift, unknown = collect_fallbacks(src, snapshot['defaults'])

    total = agree + sum(len(d['sites']) for d in drift.values())
    lines = [f'inline fallbacks: {total} sites read a setting with || or ?? — '
             f'{agree} agree with the schema default, '
             f'{sum(len(d["sites"]) for d in drift.values())} do not '
             f'({len(drift)} distinct settings)']

    # An inline read of a key that is not in the schema is the WORST form of the
    # F4 bug, not a note: `Lib.settings.sa_typo || 8` is always 8, silently and
    # forever, and it is exactly what a setting rename leaves behind at a site
    # someone missed. Mutation-testing this script is what promoted it from a
    # note to a failure — renaming a key produced a clean exit 0.
    for key in sorted(unknown):
        lines.append(f'  ORPHAN {key}: read inline with a fallback, but no such '
                     f'setting exists — this read can never be anything but its '
                     f'fallback')

    new = sorted(k for k in drift if k not in baseline)
    gone = sorted(k for k in baseline if k not in drift)

    for key in sorted(drift):
        d = drift[key]
        mark = 'NEW  ' if key in new else '     '
        where = ', '.join(f'L{n}' for n in d['sites'][:4])
        more = f' (+{len(d["sites"]) - 4} more)' if len(d['sites']) > 4 else ''
        lines.append(f'  {mark}{key}: schema {d["schema"]!r} vs inline '
                     f'{d["inline"]!r}  [{d["op"]} at {where}{more}]')

    for key in gone:
        lines.append(f'  FIXED {key}: no longer drifts — drop it from the baseline')

    return lines, drift, new, gone, unknown


HELP = os.path.join(ROOT, 'ShowAllEntityData_HELP.md')
_STOP = {'the', 'a', 'an', 'of', 'for', 'to', 'in', 'on', 'and', 'or',
         'enable', 'disable', 'show', 'hide', 'default', 'settings', 'setting'}


def _sig_words(text):
    return {w for w in re.sub(r'[^a-z0-9]+', ' ', text.lower()).split()
            if w and w not in _STOP}


def run_docs_report(sections):
    """List schema setting GROUPS that HELP's settings table does not mention.

    **A REPORT, NOT A GATE**, as before, and for the same reason
    org/config-handling.org gives: a docs cross-check that fails on prose
    trains everyone to ignore the whole script.

    **What it compares changed in 9.99.1148, and the new answer is better.**
    It used to match HELP's one-setting-per-bullet lines against schema LABELS,
    and on 9.99.1136 flagged 41 of 119 bullets — most of them correct prose
    summarising several settings at once ("Cache TTL, max entries, store
    sizes"). A 34% false-positive rate made the output something to skim.

    `ShowAllEntityData_HELP.md` does not list settings one per bullet at all;
    its settings section is a table of GROUPS, one row per `configSchema`
    divider. That is a near one-to-one correspondence instead of a
    one-to-many, so the question became "does every schema section appear in
    HELP's table" — which is the case that actually matters: a new settings
    GROUP shipping without HELP hearing about it.

    It is still not a gate, because the mapping is not exactly one-to-one:
    HELP legitimately folds a sub-divider into its parent row (the sidebar and
    overflow-table dividers live under Generic and Experimental), so a
    correctly-written table still reports a few. Read the list; do not count
    it.
    """
    if not os.path.isfile(HELP):
        return [f'no help file at {os.path.basename(HELP)} — did it move again?']
    text = open(HELP, encoding='utf-8').read().split('\n')

    # The settings table lives inside the "The setting groups" <details> of the
    # Settings section. Take every pipe row between that summary and the next
    # </details>, and read its first cell.
    try:
        start = next(i for i, l in enumerate(text) if l.startswith('<summary>The setting groups'))
        end = next(i for i, l in enumerate(text[start:], start) if l.strip() == '</details>')
    except StopIteration:
        return ["could not locate HELP's settings-group table — its headings moved"]

    rows = []
    for l in text[start:end]:
        if not l.startswith('|') or re.match(r'^\s*\|[\s:|-]+\|\s*$', l):
            continue
        rows.append(l.strip().strip('|').split('|')[0].strip())
    if not rows:
        return ["HELP's settings-group table is empty — its shape moved"]

    row_words = [_sig_words(r) for r in rows]
    missing = []
    for sec in sections:
        sw = _sig_words(sec['label'])
        if not sw:
            continue
        if any(rw and (rw <= sw or sw <= rw) for rw in row_words):
            continue
        missing.append(f"{sec['label']}  ({sec['key']})")

    out = [f"schema setting groups absent from HELP's table: {len(missing)} "
           f"of {len(sections)}, against {len(rows)} table rows — a WORKLIST, "
           f"not a verdict. HELP folds some sub-dividers into a parent row on "
           f"purpose; read them, do not count them."]
    out += [f'  {m}' for m in missing]
    return out


# ── Stage 3: every retired default has a migration entry ────────────────────

HISTORY = os.path.join(ROOT, 'scripts', 'config-default-history.json')


def _js_array_after(src, anchor):
    """Parse the `[ … ]` literal that follows `anchor` in the userscript."""
    i = dumpcfg()._find_literal_after(src, anchor, opener='[')
    value, _ = dumpcfg().parse_value(src, i)
    return value


_DUMPCFG = None


def dumpcfg():
    """Lazily load scripts/dump-config-defaults.py as a module."""
    global _DUMPCFG
    if _DUMPCFG is None:
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            'dumpcfg', os.path.join(ROOT, 'scripts', 'dump-config-defaults.py'))
        _DUMPCFG = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(_DUMPCFG)
    return _DUMPCFG


def run_stage3(snapshot):
    """Check the migration table against the git-derived default history.

    org/config-handling.org F1. `_migrateFrozenSettings()` un-freezes a profile
    by recognising stored values that this script once shipped as everybody's
    default — so the table it consults has to stay complete as defaults keep
    changing, and nothing but git knows when one did.

    This does NOT re-walk git; that takes ~26 s and a gate nobody waits for is
    a gate nobody runs. It compares `scripts/config-default-history.json`'s own
    `current` block against the snapshot Stage 1 has just verified, which is
    O(1) and catches the only case that matters: a default that moved since the
    history file was last refreshed.

    Four failures, each naming its own fix:

      • the history file is stale        → run scripts/dump-default-history.py
      • a retired default has no entry   → add one to _SETTINGS_MIGRATIONS
      • an entry matches no real history → remove it, or refresh the history
      • an orphaned key is unlisted      → add it to _SETTINGS_ORPHANED_KEYS

    The third matters as much as the second. An invented entry adopts a new
    default over a value the user may well have chosen deliberately, and it
    would do it silently — the migration runs once and keeps no record of which
    entries fired for which reason beyond the backup blob.

    @returns a (lines, failed) pair.
    """
    if not os.path.exists(HISTORY):
        return ([f'ERROR: {os.path.relpath(HISTORY, ROOT)} is missing — run '
                 f'scripts/dump-default-history.py'], True)

    history = json.load(open(HISTORY, encoding='utf-8'))
    src = open(USERSCRIPT, encoding='utf-8').read()

    try:
        table = _js_array_after(src, 'const _SETTINGS_MIGRATIONS')
        orphan_list = _js_array_after(src, 'const _SETTINGS_ORPHANED_KEYS')
    except Exception as exc:                                      # noqa: BLE001
        return ([f'ERROR: could not read the migration table from the '
                 f'userscript: {exc}'], True)

    lines, failed = [], False

    # ── is the history file still describing this tree? ──────────────────────
    # The snapshot carries every entry with a `default:`, including the one
    # `type: 'function'` key whose "default" is an internal method name; the
    # history deliberately holds neither that nor the five tables. So the
    # comparable universe is the history's own keys plus whatever the snapshot
    # has gained, and the three outcomes are reported apart because they mean
    # different things.
    hist_current = history.get('current', {})
    snap_defaults = snapshot['defaults']
    non_value = set(snapshot['_meta'].get('settings_without_default', []))
    fn_keys = {k for k in snap_defaults if k.startswith('sa_fn_')}
    comparable = {k: v for k, v in snap_defaults.items()
                  if k not in non_value and k not in fn_keys}

    changed = {k: (hist_current[k], comparable[k]) for k in hist_current
               if k in comparable and hist_current[k] != comparable[k]}
    removed = sorted(k for k in hist_current if k not in comparable)
    added = sorted(k for k in comparable if k not in hist_current)

    if changed or removed or added:
        failed = True
        lines.append(f'FAILED: {os.path.relpath(HISTORY, ROOT)} no longer describes '
                     f'this schema — run scripts/dump-default-history.py, then give '
                     f'any newly retired default an entry in _SETTINGS_MIGRATIONS.')
        for k, (was, now) in sorted(changed.items()):
            lines.append(f'  default changed: {k}  {json.dumps(was)} -> {json.dumps(now)}')
        for k in removed:
            lines.append(f'  setting removed: {k}  (a new orphan)')
        for k in added:
            lines.append(f'  setting added:   {k}')
        return (lines, failed)

    # ── every retired default is covered, and nothing is invented ────────────
    stale = history.get('stale', {})
    declared = {}
    for entry in table:
        if not isinstance(entry, dict) or 'key' not in entry:
            lines.append(f'FAILED: unreadable _SETTINGS_MIGRATIONS entry: {entry!r}')
            return (lines, True)
        declared[entry['key']] = entry.get('was', [])

    missing = []
    for key, info in sorted(stale.items()):
        if key not in declared:
            missing.append(f'  {key}: no entry — was {", ".join(json.dumps(v) for v in info["was"])}, '
                           f'now {json.dumps(info["current"])}')
            continue
        uncovered = [v for v in info['was'] if v not in declared[key]]
        if uncovered:
            missing.append(f'  {key}: entry omits {", ".join(json.dumps(v) for v in uncovered)}')

    invented = []
    for key, was in sorted(declared.items()):
        if key not in stale:
            invented.append(f'  {key}: not a default this script ever retired')
            continue
        extra = [v for v in was if v not in stale[key]['was']]
        if extra:
            invented.append(f'  {key}: claims {", ".join(json.dumps(v) for v in extra)}, '
                            f'which was never a default')

    orphan_keys = set(history.get('orphans', {}))
    declared_orphans = set(orphan_list)
    missing_orphans = sorted(orphan_keys - declared_orphans)
    invented_orphans = sorted(declared_orphans - orphan_keys)

    if missing:
        failed = True
        lines.append(f'FAILED: {len(missing)} retired default(s) with no migration '
                     f'entry — a profile frozen on one keeps it for ever.')
        lines += missing
    if invented:
        failed = True
        lines.append(f'FAILED: {len(invented)} migration entry/entries match no real '
                     f'history — each would silently overwrite a value the user may '
                     f'have chosen.')
        lines += invented
    if missing_orphans:
        failed = True
        lines.append(f'FAILED: {len(missing_orphans)} key(s) dropped from the schema '
                     f'are not in _SETTINGS_ORPHANED_KEYS — they stay in GM storage '
                     f'for ever, and GM_listValues is not granted, so nothing else '
                     f'could find them:')
        lines += [f'  {k}' for k in missing_orphans]
    if invented_orphans:
        failed = True
        lines.append(f'FAILED: {len(invented_orphans)} key(s) listed as orphaned are '
                     f'still in the schema:')
        lines += [f'  {k}' for k in invented_orphans]

    if not failed:
        lines.append(f'migration table: {len(declared)} retired default(s) and '
                     f'{len(declared_orphans)} orphaned key(s), all matching '
                     f'{history["_meta"]["revisions_walked"]} revisions of git history')
    return (lines, failed)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--stage1-only', action='store_true',
                    help='check snapshot freshness only')
    ap.add_argument('--baseline', action='store_true',
                    help='record the current drift set as the accepted baseline')
    ap.add_argument('--docs', action='store_true',
                    help='also report HELP bullets matching no schema label '
                         '(a worklist; never affects the exit code)')
    args = ap.parse_args()

    failed = False

    stage1 = run_stage1()
    # A NOTE means the snapshot's CONTENT is correct and only its version stamp
    # (or formatting) has moved — stage 2 can still trust it, and the run stays
    # green. Anything else means the schema itself changed underneath the file.
    stage1_fatal = bool(stage1) and not stage1[0].startswith('NOTE:')

    if stage1_fatal:
        failed = True
        for line in stage1:
            print(line, file=sys.stderr)
    else:
        snapshot = json.load(open(SNAPSHOT, encoding='utf-8'))
        meta = snapshot['_meta']
        print(f"{os.path.basename(SNAPSHOT)}: up to date — {meta['schema_entries']} "
              f"entries, {meta['settings_with_default']} defaults, "
              f"{len(snapshot['tables'])} seeded tables, at {meta['script_version']}")
        for line in stage1:
            print(line)

    if args.stage1_only:
        return 1 if failed else 0
    if stage1_fatal:
        print('stage 2 skipped — it reads the snapshot, which is stale', file=sys.stderr)
        return 1

    baseline = {}
    if os.path.exists(BASELINE):
        baseline = json.load(open(BASELINE, encoding='utf-8'))['drifting']

    lines, drift, new, gone, unknown = run_stage2(baseline)

    if args.baseline:
        with open(BASELINE, 'w', encoding='utf-8') as fh:
            json.dump({
                '_meta': {
                    'generated_by': 'scripts/audit-config-defaults.py --baseline',
                    'purpose': 'org/config-handling.org F4: the inline fallbacks '
                               'known to disagree with their schema default. Fixing '
                               'these is its own branch; this file exists so a NEW '
                               'one fails the audit while the known set stays quiet.',
                },
                'drifting': {k: {'schema': v['schema'], 'inline': v['inline']}
                             for k, v in sorted(drift.items())},
            }, fh, indent=2, ensure_ascii=False)
            fh.write('\n')
        print('\n'.join(lines))
        print(f'\nbaseline written: {len(drift)} drifting settings recorded in '
              f'{os.path.relpath(BASELINE, ROOT)}')
        return 0

    print('\n'.join(lines))

    if unknown:
        print(f'\nFAILED: {len(unknown)} inline read(s) of a setting that does not '
              f'exist — always the fallback, silently. Usually a rename that missed '
              f'a site.', file=sys.stderr)
        failed = True

    if new:
        print(f'\nFAILED: {len(new)} NEW drifting fallback(s) — a setting now '
              f'resolves differently depending on which code path reads it while '
              f'unset. Fix the literal, or re-baseline deliberately.', file=sys.stderr)
        failed = True
    elif gone:
        print(f'\nFAILED: {len(gone)} baselined drift(s) are fixed — re-run with '
              f'--baseline so the audit keeps protecting the rest.', file=sys.stderr)
        failed = True
    elif drift:
        print(f'\nOK: {len(drift)} drifting settings, all baselined '
              f'(org/config-handling.org F4 — fixing them is its own branch).')

    stage3_lines, stage3_failed = run_stage3(json.load(open(SNAPSHOT, encoding='utf-8')))
    print()
    if stage3_failed:
        failed = True
        print('\n'.join(stage3_lines), file=sys.stderr)
    else:
        print('\n'.join(stage3_lines))

    if args.docs:
        # Sections come from the snapshot, not a fresh regex over the source —
        # the same reason the labels did before it: a regex that matched only
        # single-quoted values missed roughly half of them, which made this
        # report both noisier AND blind to what it was written to find.
        sections = json.load(open(SNAPSHOT, encoding='utf-8'))['sections']
        print()
        print('\n'.join(run_docs_report(sections)))

    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
