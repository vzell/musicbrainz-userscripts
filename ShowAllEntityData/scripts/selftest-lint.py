#!/usr/bin/env python3
"""Mutation self-test for eslint.config.js and scripts/lint-summary.py.

A lint rule that cannot be made to fire is decoration. This plants one defect
per case in a scratch tree and asserts that the INTENDED rule reports it at
the planted line — not merely that ESLint exited non-zero, which a parse error
or an unrelated rule would also produce. Clean controls assert the opposite:
that the config raises nothing on code the project writes on purpose (granted
GM APIs, feature-detected `GM`, the library's consumer-provided `iro`).

The same discipline as scripts/selftest-audits.py: the real tree is never
modified. Each case gets a temp directory shaped like the repo
(`ShowAllEntityData/` beside `lib/`), because eslint.config.js anchors its
patterns at the repo root; `node_modules` is symlinked in so the config can
load its plugins. Userscript cases carry the REAL `==UserScript==` header,
so the @grant-derived globals under test are the ones that ship.

    python3 scripts/selftest-lint.py

Exits non-zero if any case behaves other than predicted.
"""

import json
import os
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
REPO = ROOT.parent
PROJECT = ROOT.name
ESLINT = ROOT / 'node_modules' / '.bin' / 'eslint'
USERSCRIPT_REL = f'{PROJECT}/ShowAllEntityData.user.js'
LIBRARY_REL = 'lib/VZ_MBLibrary.user.js'
SPEC_REL = f'{PROJECT}/tests/fixtures/selftest-lint.spec.js'
MARK = '/*PLANT*/'


def header(path):
    """Return a userscript's `==UserScript==` header block, closing line included."""
    text = path.read_text(encoding='utf-8')
    end = text.index('// ==/UserScript==') + len('// ==/UserScript==')
    return text[:end] + '\n'


US_HEADER = header(REPO / USERSCRIPT_REL)
LIB_HEADER = header(REPO / LIBRARY_REL)

US_CLEAN_BODY = """
(function () {
    'use strict';
    const Lib = VZ_MBLibrary;
    /**
     * Uses every kind of global the config must accept.
     *
     * @returns {number} Nothing meaningful.
     */
    function touchGlobals() {
        GM_listValues();
        GM_getValue('sa_x', 1);
        if (typeof GM !== 'undefined') GM.xmlHttpRequest({});
        const p = new iro.ColorPicker('#x');
        return pako.inflate(document.title).length + Lib.x + p.x;
    }
    touchGlobals();
})();
"""

SPEC_CLEAN = """const { test, expect } = require('@playwright/test');

test('control', async ({ page }) => {
    await expect(page.locator('table')).toHaveCount(1);
});
"""


def us_body(planted):
    """Wrap one planted statement in the clean userscript body."""
    return US_HEADER + US_CLEAN_BODY.replace("    touchGlobals();\n",
                                              f"    touchGlobals();\n    {planted} {MARK}\n")


# (name, relative path, file text, expected rule or None for "no messages")
CASES = [
    ('userscript control: granted/required/feature-detected globals pass',
     USERSCRIPT_REL, US_HEADER + US_CLEAN_BODY, None),
    ('no-undef: misspelled function name',
     USERSCRIPT_REL, us_body('rendrFinalTable([]);'), 'no-undef'),
    ('no-undef: GM API called but not in @grant',
     USERSCRIPT_REL, us_body("GM_download('https://example.org/x', 'x');"), 'no-undef'),
    ('no-dupe-keys: duplicate key in a configSchema-shaped literal',
     USERSCRIPT_REL,
     # MARK lands at the end of the second line, where the repeated key is.
     us_body("const configSchema = { sa_x: { default: 1 }, sa_y: { default: 2 },\n"
             "        sa_x: { default: 3 } }; void configSchema;"),
     'no-dupe-keys'),
    ('no-use-before-define: const read before its line in the same scope',
     USERSCRIPT_REL, us_body('void _later; const _later = 1;'), 'no-use-before-define'),
    ('no-misleading-character-class: emoji in a class without /u',
     USERSCRIPT_REL, us_body("void 'x'.replace(/[📊▶]/g, '');"), 'no-misleading-character-class'),
    ('jsdoc/require-jsdoc: function declaration without a JSDoc block',
     USERSCRIPT_REL, us_body('function undocumented() { return 1; } undocumented();'), 'jsdoc/require-jsdoc'),
    ('library control: consumer-provided iro and GM_xmlhttpRequest pass',
     LIBRARY_REL,
     LIB_HEADER + "(function () {\n    if (typeof GM_xmlhttpRequest !== 'undefined') GM_xmlhttpRequest({});\n"
                  "    void new iro.ColorPicker('#x');\n})();\n", None),
    ('library no-undef: GM API neither granted nor consumer-provided',
     LIBRARY_REL, LIB_HEADER + f"GM_download('x', 'y'); {MARK}\n", 'no-undef'),
    ('spec control: awaited web-first assertion passes',
     SPEC_REL, SPEC_CLEAN, None),
    ('playwright/no-focused-test: stray test.only',
     SPEC_REL, SPEC_CLEAN.replace("test('control'", f"{MARK} test.only('control'"), 'playwright/no-focused-test'),
    ('playwright/missing-playwright-await: expect never awaited',
     SPEC_REL, SPEC_CLEAN.replace("    await expect(", f"    {MARK} expect("), 'playwright/missing-playwright-await'),
]


def planted_line(text):
    """Return the 1-based line holding MARK, or None for a control case."""
    for i, line in enumerate(text.splitlines(), 1):
        if MARK in line:
            return i
    return None


def lint(rel, text):
    """Lint `text` placed at `rel` inside a scratch repo tree; return its messages."""
    with tempfile.TemporaryDirectory() as tmp:
        work = pathlib.Path(tmp)
        (work / PROJECT).mkdir()
        (work / 'lib').mkdir()
        # The config derives globals from BOTH headers at load time.
        (work / USERSCRIPT_REL).write_text(US_HEADER, encoding='utf-8')
        (work / LIBRARY_REL).write_text(LIB_HEADER, encoding='utf-8')
        (work / PROJECT / 'eslint.config.js').write_text(
            (ROOT / 'eslint.config.js').read_text(encoding='utf-8'), encoding='utf-8')
        os.symlink(ROOT / 'node_modules', work / PROJECT / 'node_modules')
        target = work / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding='utf-8')
        done = subprocess.run([str(ESLINT), '--config', f'{PROJECT}/eslint.config.js',
                               '-f', 'json', rel], cwd=work, capture_output=True, text=True)
        if done.returncode not in (0, 1):
            raise SystemExit(f'selftest-lint: eslint could not run:\n{done.stderr}')
        return json.loads(done.stdout)[0]['messages']


def check_case(name, rel, text, rule):
    """Run one case; return a failure description, or None if it behaved."""
    msgs = lint(rel, text)
    if rule is None:
        if msgs:
            return f'expected no messages, got: ' + '; '.join(
                f"{m.get('ruleId')}@{m.get('line')}: {m['message']}" for m in msgs)
        return None
    line = planted_line(text)
    hits = [m for m in msgs if m.get('ruleId') == rule]
    if not hits:
        return f'{rule} did not fire; got: ' + '; '.join(
            f"{m.get('ruleId')}@{m.get('line')}" for m in msgs)
    if line is not None and not any(m.get('line') == line for m in hits):
        return f'{rule} fired at {[m.get("line") for m in hits]}, not at the planted line {line}'
    return None


def check_ratchet():
    """Exercise lint-summary.py --check against a hand-made report and baseline."""
    failures = []
    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        fpath = str(REPO / USERSCRIPT_REL)
        base = tmp / 'baseline.json'
        base.write_text(json.dumps({'counts': {USERSCRIPT_REL: {'no-undef': 1}}}), encoding='utf-8')
        for n, want in ((1, 0), (2, 1), (0, 0)):
            report = tmp / f'report{n}.json'
            msgs = [{'ruleId': 'no-undef', 'severity': 2, 'line': i + 1, 'message': 'x'} for i in range(n)]
            report.write_text(json.dumps([{'filePath': fpath, 'messages': msgs}]), encoding='utf-8')
            done = subprocess.run([sys.executable, str(ROOT / 'scripts' / 'lint-summary.py'),
                                   '--from', str(report), '--baseline', str(base), '--check'],
                                  capture_output=True, text=True)
            label = f'ratchet: {n} hit(s) against a baseline of 1 exits {want}'
            if done.returncode != want:
                failures.append(f'{label}: exited {done.returncode}\n{done.stdout}{done.stderr}')
            elif n == 0 and 'Below baseline' not in done.stdout:
                failures.append(f'{label}: did not report the drop below baseline')
            else:
                print(f'ok    {label}')
    return failures


def main():
    """Run every case and report."""
    failures = []
    for name, rel, text, rule in CASES:
        problem = check_case(name, rel, text, rule)
        if problem:
            failures.append(f'{name}: {problem}')
            print(f'FAIL  {name}\n      {problem}')
        else:
            print(f'ok    {name}')
    failures += check_ratchet()
    for f in failures:
        if f.startswith('ratchet'):
            print(f'FAIL  {f}')
    print(f'\n{len(CASES) + 3 - len(failures)} ok, {len(failures)} failed')
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
