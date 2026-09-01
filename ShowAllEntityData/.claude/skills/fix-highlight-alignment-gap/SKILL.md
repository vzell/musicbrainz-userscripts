---
name: fix-highlight-alignment-gap
description: Diagnose and fix a "column filter narrows the rows correctly, but the match isn't visually highlighted" bug in ShowAllEntityData — a `highlightCrossTag()` / `getCleanColumnText()` alignment gap. Use this whenever the user reports that a filter string matches (the row count narrows, or the row is visibly present) but `.mb-column-filter-highlight` doesn't appear, especially when they note it works in some cells/columns but not others for the same query, or a query spanning two adjacent DOM elements (a comment boundary, a comma-separated list, an area chain). Also trigger when the user references a prior commit that fixed "the same core issue" (e.g. `a25ed83`, `ee5b2eb`) for a new example.
---

# Fixing a `highlightCrossTag()` alignment gap

`testRowMatch()` decides whether a row matches a column filter using
`getCleanColumnText()` → `normalizeExtractedText()`
(`ShowAllEntityData.user.js:33561` as of this writing — re-grep the symbol,
line numbers drift as the file grows). Highlighting that match is a
SEPARATE function, `highlightCrossTag()` (`:34147`), which builds its own
approximation of the same text independently by walking the cell's DOM a
second time. When the two disagree about what character sits at what
position, the row matches (correctly) and highlighting produces zero spans
(incorrectly) — the query works, but nothing turns yellow.

This has happened four times already (`highlightCrossTag()`'s own JSDoc
documents each as "gap 1" through "gap 4"; see `debug/NOTES.md`'s
`2026-08-29`, and the two `2026-09-01` entries, commits `a25ed83`/`ee5b2eb`).
Every occurrence has the same shape: `normalizeExtractedText()` does
something clever to the joined text (strip a space, collapse a run) that
`highlightCrossTag()`'s own text-building forgot to mirror. This skill is
the checklist for the next one.

## 0. Confirm this is actually that bug

Distinguish it from a different highlighting bug before doing anything else:

- **Row count / row visibility is correct** — the filter narrows to the
  right number of rows, or the specific row the user mentions is present.
  Only the highlight span is missing. If the row itself is wrong or missing,
  this is a `testRowMatch()`/extractor bug, not this one — different skill.
- **Same query, some cells highlight and others don't** (or: highlights
  fine for a same-node match but not one spanning two elements) is the
  single strongest signal. `getCleanColumnText()` doesn't care about DOM
  element boundaries at all (it's building one flat string); a bug that only
  shows up when the match crosses from one `<a>`/`<span>`/`<i>` into an
  adjacent one is exactly this alignment class.

## 1. Get the real, CURRENT DOM shape — don't trust the user's paraphrase or your memory of the fixture

Both real occurrences of this bug involved a user-supplied example that
turned out not to match reality exactly (a wrong column name, or example
text that didn't exist verbatim in the current data) — MusicBrainz data
drifts, and people describe cell content from memory. Verify before
theorizing:

1. Check `tests/snapshots/<pageType>/rendered.html` first (committed,
   fast, no network) — `grep -o '.\{100\}<search text>.\{150\}'` (plain
   `grep`, not aliased `ugrep`, on a large minified file — big `.{N}`
   bounds can hit `ugrep`'s complexity limit; if so, write a small Python
   script to `.rfind`/`.find` around the match instead of a shell one-liner,
   per this repo's "no inline `python3 -c`" convention).
2. If the exact phrase isn't there (data drift, or it's simply the wrong
   file), re-capture **that one pageType only**:
   `node tests/support/capture-snapshots.js --only=<pageType>`. ⚠️ This
   script has no `--help` — running it with no `--only` (or a typo'd flag)
   captures **every** registered pageType, which is slow (many minutes) and
   touches unrelated baseline files. If you do this by accident, `TaskStop`
   the background run immediately and `git checkout --` the unrelated
   `tests/snapshots/<other-pageType>/*.html` files it touched before
   committing anything — keep the diff scoped to the pageType you're
   actually fixing.
3. If the user's column name doesn't match what you find (e.g. they say
   "Event column" but the cross-tag content is actually in "Location"),
   trust the DOM, not the name — describe what you found back to them
   rather than silently substituting, but proceed with the real column.
4. Once you have the real cell HTML, identify the exact node sequence: which
   parts are separate accepted text nodes (their own `<a>`/`<span>`/`<i>`,
   or a bare inter-element text node like `, ` between two links), and
   what's currently rejected as whitespace-only (`&nbsp;`-only nodes).

## 2. Find which normalization step `highlightCrossTag()` forgot to mirror

Read `normalizeExtractedText()` (`:33561`) and the current
`highlightCrossTag()` entries/offset/`fullText` loop (inside the
`while ((node = walker.nextNode()))` block, a bit past the function's own
opening line `:34147`) side by side. The
loop already special-cases three things (see its own inline comments,
labeled "gap 2/3/4" in the JSDoc above it) — a NEW gap is a fourth+
divergence between what `normalizeExtractedText()`'s `raw.replace(...)`
chain does to the joined string and what the per-boundary `gap`/`skipGap`
decision in the loop currently does. Work out, by hand, what
`normalizeExtractedText()` would produce for the real cell text you found in
step 1, and what the current loop's `fullText` would produce for the same
text — the difference (usually an extra or missing space at one specific
node boundary) is the bug.

## 3. Confirm live with a throwaway diagnostic test — don't commit it

Append a temporary test (not a real assertion, just `console.log`s) to the
relevant `tests/live/*.spec.js` file, reusing its existing
`loadArtistEvents()`/disk-fixture-loading helper. Type the query into the
real column filter, then dump:

```js
const summary = await page.evaluate((idx) => {
    const rows = Array.from(document.querySelectorAll('table.tbl tbody tr'));
    const withSpan = [], withoutSpan = [];
    for (const r of rows) {
        const cell = r.cells[idx];
        if (!cell) continue;
        const hasSpan = !!cell.querySelector('.mb-column-filter-highlight');
        (hasSpan ? withSpan : withoutSpan).push(cell.innerHTML);
        // cap each array at ~3 for readable output
    }
    return { totalRows: rows.length, withSpan, withoutSpan };
}, colIdx);
console.log('summary', JSON.stringify(summary, null, 2));
```

This gets you two things a code-only read can't cheaply give: concrete proof
the row count is right while spans are wrong, and — critically — a **stable
row identifier** (an `/event/<uuid>`, `/place/<uuid>`, or `/area/<uuid>`
href from the dumped `innerHTML`) to target precisely in the real test,
rather than a fragile "first N rows in DOM order" assumption.

Run it (`npx playwright test <file> --project=chromium-live -g "<temp test
name>"`, backgrounded — these live specs take 30s-2min against a 4000+ row
fixture). If the column filter's input sits in the first few columns, its
`<th>` may be intercepted by the sticky first column at the headless
viewport's default width — use `.click({ force: true })` rather than fighting
it with scroll calls; this is a harness quirk, not a bug.

**Delete this test before finishing.** It never gets committed — only the
real regression test from step 4 does.

## 4. Write the real regression test FIRST

Using the stable identifier(s) from step 3, add a real test to the same
`tests/live/*.spec.js` file:

- Filter the real column, assert the exact filtered row count (the disk
  fixture is static/committed, so an exact count is safe and deterministic
  — unlike a live fetch).
- Scope a locator to the specific row by its stable href (`tr:has(a[href="…"])
  td:nth-child(${colIdx + 1})`), and assert
  `.locator('.mb-column-filter-highlight')` has the exact expected text
  array via `toHaveText([...])` — one array entry per DOM text node the
  match crosses (a same-node match is one entry; a match crossing N element
  boundaries is N entries, since `highlightCrossTag()`'s segment-splitting
  wraps each originating text node's overlap in its own `<span>`).
- If there's also a same-node ("already works") case worth guarding as a
  regression anchor, assert it too — see the two-assertion shape in
  `artist-events-interactions.spec.js`'s "Location column filter highlights
  a match spanning a real comma-separator text node" test.

Run it against the CURRENT (unfixed) code and confirm it fails with the
expected symptom (empty `.mb-column-filter-highlight` array on the
cross-tag row). If it doesn't fail, your step 2 hypothesis is wrong — go
back and re-derive it against the real DOM, don't adjust the test to pass.

## 5. Apply the minimal fix

The fix is almost always a one-line addition to the `skipGap`/gap-decision
condition inside `highlightCrossTag()`'s single entries/offset/`fullText`
loop (`grep -n 'const skipGap'` to find the current line — it moves as the
JSDoc above the function grows with each new gap) — extending it to also
skip the virtual join-space in the
new boundary shape you found, mirroring exactly what
`normalizeExtractedText()` already does for that shape. Do not rebuild the
entries array and `fullText` as two separate passes again — they were
folded into one pass specifically so the offset bookkeeping can't drift out
of sync with the string (see the existing code's own comment on this).

Update the function's JSDoc: add a new "gap N" paragraph in the same style
as the existing ones (root cause, concrete example, what
`normalizeExtractedText()` does differently, what the fix changes) —
directly above the `@param` block.

## 6. Verify, then run the regression sweep

1. Re-run the new test — confirm it passes with the exact expected span
   array.
2. Re-run the full spec file it lives in (other tests in the same file
   shouldn't move).
3. Re-run `tests/live/artist-releases-filter-sort.spec.js`'s `§A per-column
   typed filter cases` suite (`-g "§A per-column typed filter cases"`) — the
   heaviest existing consumer of `highlightCrossTag()`, covering every
   previously-fixed gap's own cross-tag cases (`In (Disc`, `Slash (US`,
   `US 2009-03-10`, `US 1986`, …). A regression here means your new
   `skipGap` condition is too broad.
4. If anything ELSE fails and looks unrelated to text/highlighting, verify
   it's pre-existing before worrying about it: `git stash push --
   ShowAllEntityData.user.js`, re-run just that one failing test in
   isolation, confirm it fails identically against the unmodified script,
   then `git stash pop`. Don't assume — both real sessions using this skill
   hit one pre-existing flaky `@perf` test (`uniq-value dropdown cache
   reflects a cell expand/collapse`, unrelated `page.evaluate` timeout) and
   confirmed it this way rather than guessing.

## 7. Clean up scope before committing

- Delete the temporary diagnostic test from step 3 entirely.
- `git status` — if step 1.2's live re-capture touched any
  `tests/snapshots/<other-pageType>/*.html` files you didn't mean to
  change, `git checkout --` them back. The commit should touch exactly:
  `ShowAllEntityData.user.js`, the one `tests/live/*.spec.js` file,
  `debug/NOTES.md`, and the WIP changelog file.

## 8. Document, branch, commit, push

1. Append a dated entry to `debug/NOTES.md`, following the exact chain style
   of the existing `highlightCrossTag()` entries (root cause, fix, test,
   regression results) — link it as a follow-up to the prior entry by name.
2. Create a feature branch first (never commit directly to `main`).
3. Add a `ShowAllEntityData_CHANGELOG.wip.json` entry (`"WIP.1"`, 🐛 Fix,
   plain-language description of the symptom and cell shape) — no
   `// @version` bump and no touching the real `CHANGELOG.json` on a
   feature branch, per project convention.
4. Commit (fix + test + NOTES + WIP changelog together) with a message
   naming the root cause and citing the prior commit this is a follow-up to,
   push the branch.

## 9. Merge to `main` — only when explicitly asked

Don't merge on your own initiative. When the user says "merge into main,
push and remove the branch":

1. `git checkout main && git merge --ff-only <branch>`.
2. Assign the WIP entry(ies) the next real version number(s) in order,
   prepend to `ShowAllEntityData_CHANGELOG.json`, bump `// @version`
   (`M.MM.NNN+YYYY-MM-DD`), delete the `.wip.json` file.
3. Commit as `"docs: bump to <version>, merge WIP changelog"`, push `main`.
4. Delete the feature branch both locally (`git branch -d`) and on origin
   (`git push origin --delete`).

## How to drive this skill

Give it exactly what made both real occurrences fast to root-cause: the
literal query string, the column name (or a description of the cell content
if unsure of the exact name), and the URL — plus explicit permission to
verify against the live page if the fixture doesn't have it:

> "Filtering the Label column for 'Sub Pop, Reprise' doesn't highlight
> anything on https://musicbrainz.org/release-group/<mbid>, even though the
> row is there. Might be the same class of bug as ee5b2eb. Write a test
> first, then fix it."

If you're not sure the column name is exactly right, say so — "it's the
column showing the label(s), might be called something else" is more useful
than a guessed name that turns out to be a different column, which costs a
re-diagnosis pass to discover.
