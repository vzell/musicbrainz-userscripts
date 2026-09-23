"""Generate ShowAllEntityData_CONFIG_DEFAULTS.json from the userscript's configSchema.

org/config-handling.org Item 4, Stage 1. The decision recorded there: commit a
defaults snapshot as a GENERATED ARTIFACT that nothing reads at runtime.

**Nothing in the userscript reads the output file**, and that is the point, not
an omission. org/config-handling.org's "Why it must not be read at runtime"
section has the four reasons; the short one is that `settingsInterface.init()`
is synchronous at construction, so a fetched defaults file would either block
startup or run a whole page load on the wrong defaults.

What the file IS for:

  - It makes F4's class of defect mechanically checkable. 167 sites read
    `Lib.settings.sa_X || literal`; 17 of them disagree with the schema default,
    so the same setting resolves differently depending on which path reads it
    while unset. Nothing could see that before, because no artifact recorded
    what a default IS. scripts/audit-config-defaults.py is the consumer.
  - It makes a default flip legible in review. Today it is a one-character diff
    inside a 2,800-line block; `bfb8ac3` changed seven at once.
  - It gives the shipped 💾 Save configuration export something to diff
    against. Same 2-space indent, one key per line, so a user's exported config
    and this file line up in any text-diff tool.

== Why this parses JavaScript by hand ==

configSchema is a 2,800-line object literal in a 90,000-line userscript. There
is no build step and no way to ask node for it without executing the whole
IIFE, which needs a DOM. So this scans the source.

**A naive brace-count does not work, and fails SILENTLY.** Measured on
9.99.1136: counting braces without skipping string literals ends the block at
line 3045 instead of its real end, because a `}` inside a description string
decrements the depth with nothing having incremented it. The result is a block
holding 214 `type:` keys instead of 238 — a plausible-looking number, off by
10%, with no error. Hence `_scan_object()`, which tracks string and comment
state, and `--verify` cross-checking the entry count against `count_in_code()`
over the same span.

**And the cross-check needs the same care as the parser.** A plain
`re.findall(r"type:")` over the block reports 277 against 276 real entries,
because one setting's description contains the prose *"…on every page type:
"Pending edits - Presence"…"*. A check that is fooled by the thing it is
checking is worse than none, so `count_in_code()` counts code positions only.

**The second trap is the LAST entry.** org/config-handling.org records it: the
obvious entry regex keys off `\\n        },`, and `sa_edits_color_zebra_even`
ends `}` with no trailing comma, so it is dropped. That is a 238-vs-237
undercount that looks like nothing. This splits entries structurally rather
than on a comma, so a trailing comma is irrelevant either way.

== The five type: 'table' settings ==

They carry no `default:` at all — they are lazy-seeded from code on first use.
Recording them as "no default" would hide exactly the kind of change this file
exists to surface, so their seed sources are parsed too and stored under
`tables`, with both the symbol name and the rows themselves.

usage:
  python3 scripts/dump-config-defaults.py             # write the committed file
  python3 scripts/dump-config-defaults.py --out /tmp/x.json
  python3 scripts/dump-config-defaults.py --verify    # self-checks, no write
"""
import argparse
import json
import os
import re
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
USERSCRIPT = os.path.join(ROOT, 'ShowAllEntityData.user.js')
DEFAULT_OUT = os.path.join(ROOT, 'ShowAllEntityData_CONFIG_DEFAULTS.json')

# The five lazy seeders' built-ins, as {config key: (const name, opening bracket)}.
#
# All five are module-level `const NAME = <literal>;` — which they were not
# until 9.99.1142. The three rel maps used to be written out TWICE, once as the
# `let REL_*` initializer and once as the object literal passed to _loadMap()
# inside _initRelMappings(), and this script had a whole second parsing branch
# to chase the call site. Hoisting them to one constant each (for
# `_TABLE_SEED_REGISTRY()`, which needs a third reader) deleted that branch and
# the duplication it existed to cope with.
TABLE_SEEDS = {
    'sa_default_hidden_columns':       ('SA_DEFAULT_HIDDEN_COLUMNS_DEFAULT', '['),
    'sa_unicode_char_picker_mappings': ('SA_UNICODE_CHARS_DEFAULT', '['),
    'sa_rel_url_icon_classes':         ('REL_URL_ICON_CLASSES_DEFAULT', '{'),
    'sa_rel_other_db_classes':         ('REL_OTHER_DB_CLASSES_DEFAULT', '{'),
    'sa_rel_streaming_classes':        ('REL_STREAMING_CLASSES_DEFAULT', '{'),
}


class ParseError(Exception):
    """Raised when the source does not look the way this script expects."""


# ── Scanning ────────────────────────────────────────────────────────────────

def _skip_to_code(src, i):
    """Advance past any string, template literal or comment starting at `i`.

    Returns the index just past it, or `i` unchanged when `src[i]` starts none
    of those. This is the whole reason the brace counting below is reliable:
    every `{` and `}` inside quotes or comments is stepped over rather than
    counted. See the module docstring for what happens without it.
    """
    c = src[i]
    if c in '\'"`':
        quote = c
        j = i + 1
        while j < len(src):
            if src[j] == '\\':
                j += 2
                continue
            if src[j] == quote:
                return j + 1
            j += 1
        raise ParseError(f'unterminated {quote} string at offset {i}')
    if src.startswith('//', i):
        nl = src.find('\n', i)
        return len(src) if nl == -1 else nl
    if src.startswith('/*', i):
        end = src.find('*/', i + 2)
        if end == -1:
            raise ParseError(f'unterminated block comment at offset {i}')
        return end + 2
    return i


def _scan_object(src, open_brace):
    """Return the index of the `}` matching the `{` at `open_brace`.

    Brace-counts in CODE state only — `_skip_to_code()` steps over strings and
    comments. Regex literals are deliberately NOT handled: every span this
    script scans is a data literal, and a `/` in one is inside a string. If that
    ever stops being true this raises rather than miscounting, because the depth
    would not return to zero.
    """
    if src[open_brace] != '{':
        raise ParseError(f'expected {{ at offset {open_brace}')
    depth = 0
    i = open_brace
    while i < len(src):
        j = _skip_to_code(src, i)
        if j != i:
            i = j
            continue
        if src[i] == '{':
            depth += 1
        elif src[i] == '}':
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise ParseError(f'unbalanced braces from offset {open_brace}')


def _find_literal_after(src, anchor, opener='{'):
    """Find the literal opening with `opener` that follows `anchor` in `src`."""
    at = src.index(anchor)
    start = src.index(opener, at)
    return start


def count_in_code(text, pattern):
    """Count `pattern` matches that land in CODE, not in a string or comment.

    The cross-check in `verify()` needs a count derived independently of the
    entry splitter — otherwise it only proves the splitter agrees with itself.
    A plain `re.findall` is not that count: measured on 9.99.1136 it reports
    277 `type:` against 276 real entries, because one description contains the
    prose *"…on every page type: "Pending edits - Presence"…"*. Counting only
    code positions keeps the check independent while not being fooled by a
    setting that happens to describe the schema.
    """
    in_code = bytearray(len(text))
    i = 0
    while i < len(text):
        j = _skip_to_code(text, i)
        if j != i:
            i = j
            continue
        in_code[i] = 1
        i += 1
    return sum(1 for m in re.finditer(pattern, text) if in_code[m.start()])


# ── JS literal values ───────────────────────────────────────────────────────

_NUM_RE = re.compile(r'-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?')
_IDENT_RE = re.compile(r'[A-Za-z_$][A-Za-z0-9_$]*')

_ESCAPES = {'n': '\n', 't': '\t', 'r': '\r', 'b': '\b', 'f': '\f',
            '0': '\0', '\\': '\\', "'": "'", '"': '"', '`': '`', '/': '/'}


def _read_string(src, i):
    """Read one quoted string starting at `i`; returns (value, next index)."""
    quote = src[i]
    out = []
    j = i + 1
    while j < len(src):
        c = src[j]
        if c == '\\':
            nxt = src[j + 1]
            if nxt == 'u':
                out.append(chr(int(src[j + 2:j + 6], 16)))
                j += 6
                continue
            if nxt == 'x':
                out.append(chr(int(src[j + 2:j + 4], 16)))
                j += 4
                continue
            if nxt == '\n':          # line continuation
                j += 2
                continue
            out.append(_ESCAPES.get(nxt, nxt))
            j += 2
            continue
        if c == quote:
            return ''.join(out), j + 1
        out.append(c)
        j += 1
    raise ParseError(f'unterminated string at offset {i}')


def _skip_ws(src, i):
    """Advance past whitespace AND comments — both appear between entries."""
    while i < len(src):
        if src[i].isspace():
            i += 1
            continue
        if src.startswith('//', i) or src.startswith('/*', i):
            i = _skip_to_code(src, i)
            continue
        break
    return i


def parse_value(src, i):
    """Parse one JS literal at `i`; returns (python value, next index).

    Handles exactly what configSchema and the three seed constants contain:
    strings (with `+` concatenation, which every long description uses),
    numbers, booleans, null, arrays and object literals. Anything else raises,
    so an expression that silently evaluated to the wrong thing cannot slip
    through as a default.
    """
    i = _skip_ws(src, i)
    c = src[i]

    if c in '\'"`':
        value, i = _read_string(src, i)
        # String concatenation: 'a' + 'b' + 'c', spanning lines.
        while True:
            j = _skip_ws(src, i)
            if j < len(src) and src[j] == '+':
                k = _skip_ws(src, j + 1)
                if src[k] in '\'"`':
                    more, i = _read_string(src, k)
                    value += more
                    continue
            break
        return value, i

    if c == '[':
        out = []
        i += 1
        while True:
            i = _skip_ws(src, i)
            if src[i] == ']':
                return out, i + 1
            if src[i] == ',':
                i += 1
                continue
            item, i = parse_value(src, i)
            out.append(item)

    if c == '{':
        out = {}
        i += 1
        while True:
            i = _skip_ws(src, i)
            if src[i] == '}':
                return out, i + 1
            if src[i] == ',':
                i += 1
                continue
            if src[i] in '\'"':
                key, i = _read_string(src, i)
            else:
                m = _IDENT_RE.match(src, i)
                if not m:
                    raise ParseError(f'expected a key at offset {i}: {src[i:i + 40]!r}')
                key, i = m.group(0), m.end()
            i = _skip_ws(src, i)
            if src[i] != ':':
                raise ParseError(f'expected : after {key!r} at offset {i}')
            out[key], i = parse_value(src, i + 1)

    if src.startswith('true', i):
        return True, i + 4
    if src.startswith('false', i):
        return False, i + 5
    if src.startswith('null', i):
        return None, i + 4

    m = _NUM_RE.match(src, i)
    if m:
        text = m.group(0)
        return (float(text) if ('.' in text or 'e' in text.lower()) else int(text)), m.end()

    raise ParseError(f'unparseable value at offset {i}: {src[i:i + 60]!r}')


# ── configSchema ────────────────────────────────────────────────────────────

def parse_config_schema(src):
    """Return configSchema as an ordered list of (key, dict-of-fields)."""
    open_brace = _find_literal_after(src, 'const configSchema')
    close = _scan_object(src, open_brace)
    body_start, body_end = open_brace + 1, close

    entries = []
    i = body_start
    while True:
        i = _skip_ws(src, i)
        if i >= body_end:
            break
        if src[i] == ',':
            i += 1
            continue
        if src[i] in '\'"':
            key, i = _read_string(src, i)
        else:
            m = _IDENT_RE.match(src, i)
            if not m:
                raise ParseError(f'expected a configSchema key at offset {i}: {src[i:i + 40]!r}')
            key, i = m.group(0), m.end()
        i = _skip_ws(src, i)
        if src[i] != ':':
            raise ParseError(f'expected : after {key!r} at offset {i}')
        fields, i = parse_value(src, i + 1)
        if not isinstance(fields, dict):
            raise ParseError(f'{key!r} is not an object literal')
        entries.append((key, fields))

    return entries, src[body_start:body_end]


def _to_gm_rows(key, literal):
    """Convert a seed literal into the ROW SHAPE the seeder writes to GM storage.

    The source literals and the stored rows are different shapes, and the stored
    shape is the one worth recording: it is what a user's 💾 Save configuration
    export contains, so the two files diff directly — one of the four reasons
    org/config-handling.org gives for having this artifact at all.

    Each branch mirrors one line of the userscript, named below. **That
    duplication is the cost**, and `verify()` is what contains it: every table's
    schema entry declares its own `columns:`, so a drifted transform shows up as
    a row whose length no longer matches the column count the settings dialog
    renders.
    """
    if key == 'sa_default_hidden_columns':
        # _loadDefaultHiddenColumnsMap(): .map(e => [e.pageType, e.columns])
        return [[e['pageType'], e['columns']] for e in literal]
    if key == 'sa_unicode_char_picker_mappings':
        # _loadUnicodeCharsMappings(): .map(e => [e.code, e.name,
        #   e.default ? 'true' : 'false', e.examples || ''])
        return [[e['code'], e['name'],
                 'true' if e.get('default') else 'false',
                 e.get('examples') or ''] for e in literal]
    # _initRelMappings()'s _loadMap(): Object.entries(defaultObj)
    return [[k, v] for k, v in literal.items()]


def parse_table_seeds(src):
    """Parse the five lazy seeders' built-in rows.

    Recorded because the 5 `type: 'table'` settings have no `default:`: their
    built-ins live in code, so "no default" in the snapshot would hide a change
    to them completely — the exact blindness this artifact exists to remove.

    That blindness is now load-bearing in a second way. `_seedNewTableRows()`
    offers a profile any built-in row it has never been shown, and the ledger
    it keeps makes a row ADDED here reach existing users. So a change to one of
    these literals is a user-visible change, and this snapshot is what makes it
    show up in a diff.
    """
    seeds = {}

    for key, (symbol, opener) in TABLE_SEEDS.items():
        start = _find_literal_after(src, f'const {symbol}', opener)
        literal, _ = parse_value(src, start)
        seeds[key] = {'seed_source': symbol,
                      'seed_rows': _to_gm_rows(key, literal)}

    return seeds


def script_version(src):
    m = re.search(r'^// @version\s+(\S+)', src, re.M)
    if not m:
        raise ParseError('no // @version line found')
    return m.group(1)


def build_snapshot(src):
    entries, block = parse_config_schema(src)
    types = Counter(f.get('type', '<missing>') for _, f in entries)

    sections = [{'key': k, 'label': f.get('label', '')}
                for k, f in entries if f.get('type') == 'divider']
    settings = [(k, f) for k, f in entries if f.get('type') != 'divider']

    defaults = {k: f['default'] for k, f in settings if 'default' in f}
    no_default = sorted(k for k, f in settings if 'default' not in f)

    return entries, {
        '_meta': {
            'generated_by': 'scripts/dump-config-defaults.py',
            'purpose': 'Generated artifact. NOTHING in the userscript reads this file. '
                       'See org/config-handling.org Item 4.',
            'script_version': script_version(src),
            'schema_entries': len(entries),
            'sections': len(sections),
            'settings': len(settings),
            'settings_with_default': len(defaults),
            'settings_without_default': no_default,
            'types': dict(sorted(types.items(), key=lambda kv: (-kv[1], kv[0]))),
        },
        'sections': sections,
        # The user-facing name of each setting, as the settings dialog renders
        # it. Recorded because it is the only handle documentation has on a
        # setting — ShowAllEntityData_HELP.txt names settings by label and never
        # by key — so a docs-vs-schema check has nothing to match on without it.
        'labels': {k: f.get('label', '') for k, f in sorted(settings)},
        'defaults': dict(sorted(defaults.items())),
        'tables': parse_table_seeds(src),
    }, block


def verify(snapshot, block, entries_index):
    """Self-checks that would each have caught a silently wrong parse."""
    problems = []

    # The check the module docstring exists for: a count of the same span taken
    # independently of the entry splitter.
    raw = count_in_code(block, r"\btype:\s*['\"]")
    parsed = snapshot['_meta']['schema_entries']
    if raw != parsed:
        problems.append(f'entry count disagrees with an independent type: count '
                        f'of the same span — parsed {parsed}, counted {raw}')

    # The LAST entry has no trailing comma (org/config-handling.org's trap).
    if 'sa_edits_color_zebra_even' not in snapshot['defaults']:
        problems.append('sa_edits_color_zebra_even is missing — that is the '
                        'no-trailing-comma last entry; the splitter regressed')

    # Only the 5 tables may lack a default.
    without = snapshot['_meta']['settings_without_default']
    if sorted(without) != sorted(TABLE_SEEDS):
        problems.append(f'settings without a default should be exactly the 5 '
                        f'tables, got {without}')

    # Each table's own `columns:` is the declared arity of its rows. This is
    # what contains _to_gm_rows()'s duplicated transforms: a drifted one
    # produces rows the settings dialog could not render.
    by_key = dict(entries_index)
    for key, rec in snapshot['tables'].items():
        rows = rec['seed_rows']
        if not rows:
            problems.append(f'{key}: seed rows parsed as empty')
            continue
        want = len(by_key.get(key, {}).get('columns', []))
        bad = sorted({len(r) for r in rows if len(r) != want})
        if want and bad:
            problems.append(f'{key}: schema declares {want} columns but seed '
                            f'rows have {bad} — _to_gm_rows() has drifted from '
                            f'the seeder it mirrors')

    return problems


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--out', default=DEFAULT_OUT, help='output path')
    ap.add_argument('--verify', action='store_true',
                    help='run the self-checks and report, writing nothing')
    args = ap.parse_args()

    src = open(USERSCRIPT, encoding='utf-8').read()
    try:
        entries_index, snapshot, block = build_snapshot(src)
    except ParseError as err:
        print(f'PARSE ERROR: {err}', file=sys.stderr)
        return 2

    problems = verify(snapshot, block, entries_index)
    if problems:
        for p in problems:
            print(f'VERIFY FAILED: {p}', file=sys.stderr)
        return 1

    meta = snapshot['_meta']
    summary = (f"{meta['schema_entries']} entries — {meta['settings']} settings "
               f"({meta['settings_with_default']} with a default, "
               f"{len(meta['settings_without_default'])} tables seeded from code) "
               f"in {meta['sections']} sections, at {meta['script_version']}")

    if args.verify:
        print(f'{summary}; self-checks clean, nothing written.')
        return 0

    with open(args.out, 'w', encoding='utf-8') as fh:
        json.dump(snapshot, fh, indent=2, ensure_ascii=False)
        fh.write('\n')
    print(f'{os.path.relpath(args.out, ROOT)}: {summary}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
