"""Build the two GitHub-rendered changelogs from their sources.

ShowAllEntityData's Tampermonkey "📜 ChangeLog" entry and the SAED menu's
Changelog group open GitHub pages, not an in-page dialog (the library used to
fetch, cache and parse the whole 1.75 MB JSON changelog on EVERY page for a
dialog most visits never opened; org/userscript-size.org 2.3). There are two
pages, one per reader:

  ShowAllEntityData_RELEASES.md                  "What's new": per PUBLISHED
      release, in plain words, newest first. Source: the
      "## Changes since last version (A -> B)" sections of FORUM.org, which are
      already written for end users (the forum-section skill writes them), so
      there is one source and no second copy to keep in step. A section's own
      text goes through unchanged: it is already Markdown.

  ShowAllEntityData_CHANGELOG.md                 "Full development log": every
  ShowAllEntityData_CHANGELOG/YYYY-MM[-N].md     version with the technical
      details. Source: ShowAllEntityData_CHANGELOG.json. The index holds the
      newest INDEX_ENTRIES versions and links every month; each month page
      links its neighbours and the index.

GitHub renders only about the first 512 KB of a Markdown file (users report
the truncation; GitHub documents no number), so no page may come near it: a
month bigger than PAGE_BUDGET bytes is split into parts (2026-03 alone is
512 KB of JSON).

Changelog item text is escaped for Markdown and HTML outside backtick code
spans: items quote URL patterns such as /user/<name>/edits, and an unescaped
"<name>" is an HTML tag GitHub silently drops.

Nothing here carries a timestamp, so a rebuild of unchanged sources is
byte-identical and --check is meaningful.

usage:
  python3 scripts/build-changelog-pages.py             write what changed
  python3 scripts/build-changelog-pages.py --check     exit 1 when stale
  python3 scripts/build-changelog-pages.py --selftest  built-in tests
"""
import argparse
import json
import os
import re
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

BASE = 'ShowAllEntityData'
CHANGELOG_JSON = f'{BASE}_CHANGELOG.json'
FORUM = 'FORUM.org'
RELEASES_MD = f'{BASE}_RELEASES.md'
LOG_INDEX_MD = f'{BASE}_CHANGELOG.md'
LOG_DIR = f'{BASE}_CHANGELOG'

INDEX_ENTRIES = 100
PAGE_BUDGET = 400_000          # bytes per page; GitHub truncates near 512 KB

MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
          'August', 'September', 'October', 'November', 'December']

FORUM_SECTION_RE = re.compile(r'^## Changes since last version \((\S+) -> (\S+)\)\s*$')
CODE_SPAN_RE = re.compile(r'(`+)(.+?)\1', re.S)


class BuildError(Exception):
    """A source the pages cannot be built from (reported, never skipped)."""


def month_title(ym):
    """'2026-10' -> 'October 2026'."""
    year, month = ym.split('-')
    return f'{MONTHS[int(month) - 1]} {year}'


def long_date(iso):
    """'2026-10-22' -> '22 October 2026'; anything else is returned as is."""
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})$', iso or '')
    if not m:
        return iso or ''
    return f'{int(m.group(3))} {MONTHS[int(m.group(2)) - 1]} {m.group(1)}'


def escape_plain(text):
    """Escapes Markdown and HTML in text that holds no code span."""
    text = text.replace('\\', '\\\\')
    text = re.sub(r'&(?=#?\w+;)', '&amp;', text)
    text = text.replace('<', '&lt;').replace('>', '&gt;')
    return re.sub(r'([*_\[\]~|#])', r'\\\1', text)


def md_inline(text):
    """Item text as one Markdown line: code spans kept, the rest escaped, newlines <br>."""
    out = []
    pos = 0
    for m in CODE_SPAN_RE.finditer(text):
        out.append(escape_plain(text[pos:m.start()]))
        out.append(m.group(0).replace('\n', ' '))
        pos = m.end()
    out.append(escape_plain(text[pos:]))
    return '<br>'.join(part.strip(' ') for part in ''.join(out).split('\n'))


def render_item(item, depth, lines):
    """Appends one changelog item (string or {text, sub}) as bullets at `depth`."""
    pad = '  ' * depth
    if isinstance(item, dict):
        lines.append(f'{pad}- {md_inline(str(item.get("text", "")))}')
        for sub in item.get('sub') or []:
            render_item(sub, depth + 1, lines)
    else:
        lines.append(f'{pad}- {md_inline(str(item))}')


def render_entry(entry):
    """One changelog version as a Markdown block."""
    lines = [f'## {entry.get("version", "?")} — {entry.get("date", "")}', '']
    for section in entry.get('sections') or []:
        lines.append(f'**{md_inline(str(section.get("label", "")))}**')
        lines.append('')
        for item in section.get('items') or []:
            render_item(item, 0, lines)
        lines.append('')
    return '\n'.join(lines) + '\n'


def split_pages(entries, budget):
    """Splits one month's entries (newest first) into parts of at most `budget` bytes."""
    parts, current, size = [], [], 0
    for entry in entries:
        block = render_entry(entry)
        n = len(block.encode('utf-8'))
        if current and size + n > budget:
            parts.append(current)
            current, size = [], 0
        current.append(block)
        size += n
    if current:
        parts.append(current)
    return parts


def build_log(changelog, budget=PAGE_BUDGET, index_entries=INDEX_ENTRIES):
    """The development log: {relative path: content}."""
    by_month = {}
    for entry in changelog:
        ym = str(entry.get('date', ''))[:7]
        if not re.match(r'^\d{4}-\d{2}$', ym):
            raise BuildError(f'{CHANGELOG_JSON}: entry {entry.get("version")!r} has no usable date')
        by_month.setdefault(ym, []).append(entry)

    # Pages newest first: each month, its parts in order (part 1 is newest).
    pages = []
    for ym in sorted(by_month, reverse=True):
        parts = split_pages(by_month[ym], budget)
        for i, blocks in enumerate(parts, 1):
            name = f'{ym}.md' if len(parts) == 1 else f'{ym}-{i}.md'
            title = month_title(ym) if len(parts) == 1 else f'{month_title(ym)} ({i} of {len(parts)})'
            pages.append({'name': name, 'title': title, 'blocks': blocks})

    out = {}
    index_link = f'../{LOG_INDEX_MD}'
    for i, page in enumerate(pages):
        newer = pages[i - 1] if i > 0 else None
        older = pages[i + 1] if i + 1 < len(pages) else None
        nav = [f'[↑ Index]({index_link})']
        if older:
            nav.append(f'[‹ {older["title"]}]({older["name"]})')
        if newer:
            nav.append(f'[{newer["title"]} ›]({newer["name"]})')
        text = (f'# {BASE} — Development log, {page["title"]}\n\n'
                + ' · '.join(nav) + '\n\n---\n\n'
                + '\n'.join(page['blocks'])
                + '\n---\n\n' + ' · '.join(nav) + '\n\n'
                + f'*Generated from {CHANGELOG_JSON} by scripts/build-changelog-pages.py — do not edit by hand.*\n')
        out[f'{LOG_DIR}/{page["name"]}'] = text

    month_links = ' · '.join(f'[{p["title"]}]({LOG_DIR}/{p["name"]})' for p in pages)
    newest = ''.join(render_entry(e) + '\n' for e in changelog[:index_entries])
    out[LOG_INDEX_MD] = (
        f'# {BASE} — Full development log\n\n'
        f'Every version, newest first, with the technical details behind each change. '
        f'For what changed for you in each published release, in plain words, see '
        f"[What's new]({RELEASES_MD}).\n\n"
        f'**Months:** {month_links}\n\n'
        f'This page shows the newest {min(index_entries, len(changelog))} of '
        f'{len(changelog)} versions; the month pages hold all of them.\n\n---\n\n'
        + newest
        + '---\n\n'
        f'**Older versions:** {month_links}\n\n'
        f'*Generated from {CHANGELOG_JSON} by scripts/build-changelog-pages.py — do not edit by hand.*\n')
    return out


def forum_sections(forum_text):
    """FORUM.org's release sections, oldest first: [(from, to, body)]."""
    lines = forum_text.split('\n')
    starts = [(i, m) for i, line in enumerate(lines) if (m := FORUM_SECTION_RE.match(line))]
    sections = []
    for n, (i, m) in enumerate(starts):
        end = starts[n + 1][0] if n + 1 < len(starts) else len(lines)
        # A Markdown h1, or an org heading of level 2 or deeper, closes the
        # section too, so text after the last release (notes, a TODO) never
        # reaches the page. A level-1 org heading ("* …") cannot: in this
        # file that is also how every Markdown bullet starts.
        for j in range(i + 1, end):
            if re.match(r'^# ', lines[j]) or re.match(r'^\*+ [^*]', lines[j]) and not lines[j].startswith('* '):
                end = j
                break
        body = '\n'.join(lines[i + 1:end]).strip('\n')
        sections.append((m.group(1), m.group(2), body))
    return sections


def build_releases(forum_text, changelog):
    """"What's new": {relative path: content}."""
    dates = {str(e.get('version')): str(e.get('date', '')) for e in changelog}
    sections = forum_sections(forum_text)
    if not sections:
        raise BuildError(f'{FORUM}: no "## Changes since last version (A -> B)" section')
    blocks = []
    for frm, to, body in reversed(sections):
        if to not in dates:
            raise BuildError(f'{FORUM}: release {to} is not in {CHANGELOG_JSON} '
                             f'(a typo in the section heading, or a version that was never folded)')
        blocks.append(f'## {to} — {long_date(dates[to])}\n\n*Changes since {frm}.*\n\n{body}\n')
    oldest_from = sections[0][0]
    text = (f"# {BASE} — What's new\n\n"
            f'What changed for you in each published release, newest first: new pages, '
            f'new features and fixes, in plain words. The technical details of every single '
            f'version are in the [full development log]({LOG_INDEX_MD}).\n\n'
            f'Releases up to {oldest_from} have no notes of their own here; the development '
            f'log has them.\n\n---\n\n'
            + '\n---\n\n'.join(blocks)
            + '\n---\n\n'
            f'*Generated from {FORUM} by scripts/build-changelog-pages.py — do not edit by hand.*\n')
    return {RELEASES_MD: text}


def build(project_dir, budget=PAGE_BUDGET):
    """Every generated page for `project_dir`: {relative path: content}."""
    with open(os.path.join(project_dir, CHANGELOG_JSON), encoding='utf-8') as fh:
        changelog = json.load(fh)
    if not isinstance(changelog, list) or not changelog:
        raise BuildError(f'{CHANGELOG_JSON} is not a non-empty JSON array')
    with open(os.path.join(project_dir, FORUM), encoding='utf-8') as fh:
        forum_text = fh.read()
    out = build_log(changelog, budget)
    out.update(build_releases(forum_text, changelog))
    return out


def existing_pages(project_dir):
    """Generated pages on disk now: {relative path: content}."""
    found = {}
    for rel in (RELEASES_MD, LOG_INDEX_MD):
        path = os.path.join(project_dir, rel)
        if os.path.isfile(path):
            with open(path, encoding='utf-8') as fh:
                found[rel] = fh.read()
    log_dir = os.path.join(project_dir, LOG_DIR)
    if os.path.isdir(log_dir):
        for name in sorted(os.listdir(log_dir)):
            if name.endswith('.md'):
                with open(os.path.join(log_dir, name), encoding='utf-8') as fh:
                    found[f'{LOG_DIR}/{name}'] = fh.read()
    return found


def stale(project_dir, budget=PAGE_BUDGET):
    """What --check reports: [(relative path, 'missing'|'differs'|'obsolete')]."""
    want = build(project_dir, budget)
    have = existing_pages(project_dir)
    report = []
    for rel in sorted(set(want) | set(have)):
        if rel not in have:
            report.append((rel, 'missing'))
        elif rel not in want:
            report.append((rel, 'obsolete'))
        elif want[rel] != have[rel]:
            report.append((rel, 'differs'))
    return report


def write(project_dir, budget=PAGE_BUDGET):
    """Writes changed pages and removes obsolete ones; returns the report it acted on."""
    want = build(project_dir, budget)
    report = stale(project_dir, budget)
    for rel, state in report:
        path = os.path.join(project_dir, rel)
        if state == 'obsolete':
            os.remove(path)
        else:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'w', encoding='utf-8', newline='\n') as fh:
                fh.write(want[rel])
    return report


def selftest():
    """Builds from small sources in a temp directory and checks the output."""
    changelog = [
        {'version': '9.99.12', 'date': '2026-02-03', 'sections': [
            {'label': '🚀 Feature', 'items': [
                'Pages like /user/<name>/edits get a button; `sa_enable_x` stays *off* & so_on_here.',
                {'text': 'A parent item', 'sub': ['child one', {'text': 'child two', 'sub': ['grandchild']}]},
                'Two lines\nin one item | with a pipe [and brackets]',
            ]}]},
        {'version': '9.99.11', 'date': '2026-02-01', 'sections': [
            {'label': '🐛 Fix', 'items': ['x' * 300]}]},
        {'version': '9.99.10', 'date': '2026-01-30', 'sections': [
            {'label': '🐛 Fix', 'items': ['January fix']}]},
    ]
    forum = '\n'.join([
        '* actual forum post', '',
        '# [Title](https://example.org)', '',
        '## Changes since last version (9.99.1 -> 9.99.10)', '',
        '### Fixes', '', '* **A fix** --- kept as written.', '',
        '## Changes since last version (9.99.10 -> 9.99.12)', '',
        '### New: something', '', '| A | B |', '|---|---|', '| 1 | 2 |', '',
        '* trailing bullet', '',
    ])
    failures = []

    def check(cond, what):
        if not cond:
            failures.append(what)

    with tempfile.TemporaryDirectory() as tmp:
        with open(os.path.join(tmp, CHANGELOG_JSON), 'w', encoding='utf-8') as fh:
            json.dump(changelog, fh, ensure_ascii=False)
        with open(os.path.join(tmp, FORUM), 'w', encoding='utf-8') as fh:
            fh.write(forum)

        pages = build(tmp)
        log_feb = pages.get(f'{LOG_DIR}/2026-02.md', '')
        check(f'{LOG_DIR}/2026-01.md' in pages and f'{LOG_DIR}/2026-02.md' in pages, 'one page per month')
        check('/user/&lt;name&gt;/edits' in log_feb, 'angle brackets escaped, so <name> cannot vanish as a tag')
        check('`sa_enable_x`' in log_feb, 'a code span is kept verbatim')
        check('\\*off\\*' in log_feb and 'so\\_on\\_here' in log_feb, 'emphasis markers escaped outside code')
        check('&amp;' not in log_feb and ' & ' in log_feb, 'a bare & is left alone')
        check('Two lines<br>in one item \\| with a pipe \\[and brackets\\]' in log_feb, 'newline as <br>, | [ ] escaped')
        check('- A parent item\n  - child one\n  - child two\n    - grandchild' in log_feb, 'nested items become nested bullets')
        check('[‹ January 2026](2026-01.md)' in log_feb, 'the newer month links the older one')
        check('[February 2026 ›](2026-02.md)' in pages.get(f'{LOG_DIR}/2026-01.md', ''), 'the older month links the newer one')
        check(pages[LOG_INDEX_MD].count('\n## 9.99.') + pages[LOG_INDEX_MD].startswith('## 9.99.') == 3, 'index holds the newest versions')

        small = build_log(changelog, budget=200, index_entries=1)
        check(f'{LOG_DIR}/2026-02-1.md' in small and f'{LOG_DIR}/2026-02-2.md' in small,
              'a month over the budget is split into parts')
        check('February 2026 (1 of 2)' in small[f'{LOG_DIR}/2026-02-1.md'], 'a part names its place')
        check(small[LOG_INDEX_MD].count('## 9.99.') == 1, 'the index honours its entry count')

        rel = pages[RELEASES_MD]
        check(rel.index('## 9.99.12 — 3 February 2026') < rel.index('## 9.99.10 — 30 January 2026'),
              'releases newest first, dated from the JSON')
        check('*Changes since 9.99.10.*' in rel, 'each release names the one before it')
        check('| A | B |\n|---|---|' in rel and '* **A fix** --- kept as written.' in rel,
              'forum text goes through unchanged')
        check('Releases up to 9.99.1 have no notes' in rel, 'the intro names where the notes start')
        check('# [Title]' not in rel and 'actual forum post' not in rel, 'nothing outside the sections leaks in')

        check(stale(tmp) and all(s == 'missing' for _, s in stale(tmp)), '--check reports missing pages')
        write(tmp)
        check(stale(tmp) == [], 'a fresh build is clean')
        with open(os.path.join(tmp, LOG_DIR, '1999-01.md'), 'w', encoding='utf-8') as fh:
            fh.write('old')
        check((f'{LOG_DIR}/1999-01.md', 'obsolete') in stale(tmp), 'a page no longer generated is reported')
        write(tmp)
        check(not os.path.exists(os.path.join(tmp, LOG_DIR, '1999-01.md')), 'write removes obsolete pages')
        with open(os.path.join(tmp, RELEASES_MD), 'a', encoding='utf-8') as fh:
            fh.write('hand edit')
        check((RELEASES_MD, 'differs') in stale(tmp), 'a hand edit is reported')

        with open(os.path.join(tmp, FORUM), 'w', encoding='utf-8') as fh:
            fh.write(forum.replace('9.99.12)', '9.99.13)'))
        try:
            build(tmp)
            check(False, 'a forum release missing from the JSON is an error')
        except BuildError:
            pass

    for f in failures:
        print(f'FAIL: {f}')
    print(f'selftest: {"FAILED" if failures else "ok"} ({len(failures)} failure(s))')
    return 1 if failures else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--check', action='store_true', help='report stale pages and exit 1 if any')
    ap.add_argument('--selftest', action='store_true', help='run the built-in tests')
    ap.add_argument('--project-dir', default=ROOT, help='project directory (default: the script\'s parent)')
    args = ap.parse_args()
    if args.selftest:
        return selftest()
    try:
        if args.check:
            report = stale(args.project_dir)
            for rel, state in report:
                print(f'{state:8} {rel}')
            print('changelog pages: ' + ('STALE — run python3 scripts/build-changelog-pages.py'
                                         if report else 'up to date'))
            return 1 if report else 0
        report = write(args.project_dir)
    except BuildError as err:
        print(f'error: {err}', file=sys.stderr)
        return 2
    for rel, state in report:
        print(f'{"removed" if state == "obsolete" else "wrote":8} {rel}')
    print(f'changelog pages: {len(report)} file(s) changed' if report else 'changelog pages: already up to date')
    return 0


if __name__ == '__main__':
    sys.exit(main())
