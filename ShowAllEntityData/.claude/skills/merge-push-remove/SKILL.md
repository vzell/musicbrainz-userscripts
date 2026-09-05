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
cross-reference it will rewrite, and the `@version` bump. **Read it before
passing `--apply`**, particularly the mapping's direction: `WIP.1` must come
out as the LOWEST new version. It exits 0 with an explanatory message when
there is no WIP file at all, so it is safe to run unconditionally.

The five steps it implements are CLAUDE.md's "At merge time (on `main`)"
list; its module docstring explains each and why. The two that are easy to
get wrong by hand, and the reason this is a script:

- **Ordering.** The WIP file is stored newest-first (`WIP.10` at the top),
  but numbering follows the numeric suffix ascending. Reading the file
  top-down numbers the whole block backwards.
- **Cross-references in prose.** Entries routinely say "Same root cause as
  WIP.6" or "the WIP.1 artifact purge". Rewriting only the `version` fields
  ships a dangling placeholder that no test catches. The script substitutes
  longest-token-first (so `WIP.10` survives the `WIP.1` rule) and treats an
  unknown reference as a hard error.

Then sanity-check the result before committing:

```bash
git diff --stat
head -20 ShowAllEntityData_CHANGELOG.json
# Scope the check to the lines THIS fold added — a whole-file grep is useless
# here, because two historical entries (9.99.783 and 9.99.932) shipped with an
# unresolved WIP.26 / WIP.1 in their prose, from folds done by hand before this
# script existed. They are exactly the defect the script now prevents; leave
# them alone unless the user asks, since editing them rewrites shipped release
# notes.
git diff ShowAllEntityData_CHANGELOG.json | grep '^+' | grep 'WIP\.'   # must print nothing
```

While reading the folded entries, check that anything user-visible in them is
actually reflected in `ShowAllEntityData_HELP.txt` — the branch was supposed
to resync it, and this is the last chance to notice it didn't.

## 4. Verify on `main`

Both, on the merged tree — not on the branch, where they were last green:

```bash
node --check ShowAllEntityData.user.js
npm test                  # chromium-fixtures, the CI-safe suite
```

Report the pass count. Do not push a red tree.

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
