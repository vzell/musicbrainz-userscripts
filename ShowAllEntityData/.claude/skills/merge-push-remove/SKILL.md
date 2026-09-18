---
name: merge-push-remove
description: Finish a ShowAllEntityData feature branch — merge it into main, fold `ShowAllEntityData_CHANGELOG.wip.json` into the real changelog with real version numbers, bump `// @version`, verify, push, and delete the branch locally and remotely. Use whenever the user asks to "merge and push", "merge to main and remove the branch", "wrap up this branch", "ship it", or invokes `/merge-push-remove`.
---

# Merging a feature branch into `main`

Four git commands and a changelog fold. The fold is the part that is easy to
skip and impossible to skip correctly: `ShowAllEntityData/CLAUDE.md` states
that **version bumps and `ShowAllEntityData_CHANGELOG.json` entries belong on
`main` only**, so a feature branch deliberately arrives carrying placeholder
`WIP.N` entries and a stale `// @version`. Merging without folding them ships
a release whose changelog says `WIP.7`.

Run everything from `ShowAllEntityData/`. Commit subjects take the
`[ShowAllEntityData]` prefix (root `CLAUDE.md`).

## 1. Preflight

```bash
git status -sb          # tree must be clean; note the current branch
git fetch origin
git log --oneline -5
```

- **If already on `main`**: switch to the feature branch named after the
  change (`git branch --sort=-committerdate | head` to find it). Do not
  invent a branch — ask if nothing obviously matches.
- If `main` is behind `origin/main`, fast-forward it before merging.
- A conflict in `// @version` or `ShowAllEntityData_CHANGELOG.json` means the
  branch violated the "main only" rule — resolve in favour of `main` and say so.

## 2. Merge into `main`

```bash
git checkout main
git merge --no-ff <branch> -m "[ShowAllEntityData] Merge <branch> into main"
```

`--no-ff` deliberately: it keeps the branch's shape visible in history and
makes the merge revertible as one unit.

## 3. Fold the WIP changelog

This implements `CLAUDE.md`'s "Tracking work in a feature branch" →
"At merge time (on `main`)". A branch with no user-visible change
legitimately has no `ShowAllEntityData_CHANGELOG.wip.json` at all (nothing
under `tests/` or `scripts/` needs a bump); that case is handled, so run the
step either way rather than deciding up front.

`scripts/fold-wip-changelog.py` does the whole fold. Do NOT hand-edit the
two files, and do not write a fresh one-off script — this one is committed
precisely because the fold happens on every merge and got re-derived once
already.

```bash
python3 scripts/fold-wip-changelog.py                # dry run: preview only
python3 scripts/fold-wip-changelog.py --apply
```

The dry run prints the whole plan — the `WIP.N` → version mapping, every
cross-reference it will rewrite, every entry it will re-date, and the
`@version` bump. **Read it before passing `--apply`**, particularly the
mapping's direction: `WIP.1` must come out as the LOWEST new version. It exits
0 with an explanatory message when there is no WIP file at all, so it is safe
to run unconditionally.

The five steps it implements are CLAUDE.md's "At merge time (on `main`)"
list; its module docstring explains each and why. The three that are easy to
get wrong by hand, and the reason this is a script:

- **Ordering.** The WIP file is stored newest-first (`WIP.10` at the top),
  but numbering follows the numeric suffix ascending. Reading the file
  top-down numbers the whole block backwards.
- **Cross-references in prose.** Entries routinely say "Same root cause as
  WIP.6" or "the WIP.1 artifact purge". Rewriting only the `version` fields
  ships a dangling placeholder that no test catches. The script substitutes
  longest-token-first (so `WIP.10` survives the `WIP.1` rule) and treats an
  unknown reference as a hard error.

  **Writing a WIP entry that mentions a `WIP.N` token as a STRING — rather
  than citing a release — wrap it in backticks.** A bare token is a citation
  and gets rewritten. Both failure modes are real: a literal naming a number
  the batch does not contain aborts the whole fold, and a literal naming one
  it DOES contain is silently turned into a version, so a sentence about a
  placeholder becomes a false claim about a release.

- **The ship date.** Every folded entry is re-dated to the day the merge
  lands, matching the `+YYYY-MM-DD` the same run writes into `@version`. The
  script has only done this since 2026-09-18; before that CLAUDE.md named it
  as a hand step afterwards, and it was skipped often enough that three
  shipped entries are dated before the release below them. Read the
  `entry dates set to the ship date` line in the dry run; there is nothing
  left to do by hand.

Then sanity-check the result before committing:

```bash
git diff --stat
head -20 ShowAllEntityData_CHANGELOG.json
python3 scripts/audit-changelog.py     # must exit 0
```

Not a `grep`. The audit checks eight things at once — missing, non-numeric,
duplicate and out-of-order versions, missing dates, a newest entry whose date
disagrees with the header's `+YYYY-MM-DD` stamp, a date running backwards, and
unrewritten `WIP.N` citations — and every one of them is a defect this file
actually had. The
last is why a regex is not enough: an entry explaining the placeholder
mechanism quotes the tokens as backticked literals (9.99.1016 does), which
are correct, and `` `"WIP.26"` `` sits inside a backtick span whose adjacent
characters are quotes, so a lookaround regex calls it bare and cries wolf.
The audit splits on backtick spans instead.

The file is clean as of `scripts/repair-changelog-integrity.py`, so any
failure is a live defect: this fold's, or a regression somewhere else.

While reading the folded entries, check that anything user-visible in them is
actually reflected in `ShowAllEntityData_HELP.txt` — the branch was supposed
to resync it, and this is the last chance to notice it didn't.

## 4. Verify on `main`

All of these on the merged tree — not on the branch, where they were last green:

```bash
node --check ShowAllEntityData.user.js
npm test                  # chromium-fixtures, the CI-safe suite
python3 scripts/audit-docs.py          # must exit 0
```

Report the pass count. Do not push a red tree.

`audit-docs.py` is the mechanical half of the merge-time re-read CLAUDE.md asks
for ("re-read `PERFORMANCE.org` for what your change made FALSE"). It catches
three things: a `DONE set is exactly Steps …` sentence that disagrees with the
keywords, a step whose keyword reads DONE while its own body still says "Still
TODO on `main`", and an "IN PROGRESS" section naming a branch that no longer
exists. **It does not replace the read.** Most rot is semantic — a step whose
bug description is simply no longer true — and only a human notices that. The
merge of `rel-column-batch-and-cell-states` is the worked example: the script
would have caught the two `IN PROGRESS` sections, and nothing but reading caught
Step 25, which still described a bug that 9.99.1100 had fixed four commits
earlier.

Flip the keyword of any Step this merge lands, rewrite its status prose, and
re-derive the DONE-set sentence — the script tells you if you got the last one
wrong, which it has been wrong twice before, in both directions.

## 5. Commit the fold

A separate commit from the merge, listing every version it folded:

```bash
git add -A
git commit   # [ShowAllEntityData] docs: bump to <highest>, fold WIP changelog
```

## 6. Push and remove the branch

```bash
git push origin main
git branch -d <branch>                 # -d, never -D
git push origin --delete <branch>
```

`-d` refuses to delete anything not fully merged — that refusal is a real
signal, so never reach for `-D` to silence it.

## 7. Verify the end state

```bash
git status -sb            # on main, in sync with origin/main
git branch -a             # branch gone locally and on origin
grep -n '@version' ShowAllEntityData.user.js | head -1
ls ShowAllEntityData_CHANGELOG.wip.json    # must not exist
```

Then report to the user: the merge and fold commit SHAs, the WIP→version
mapping, how many cross-references were rewritten, the test result, and that
the branch is gone from both places.
