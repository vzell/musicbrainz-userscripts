---
name: wire-live-userscript
description: Wire a real third-party userscript into ShowAllEntityData's live-interop harness end to end — find the file (a repo path, a Windows download, or a copy committed by mistake under tests/fixtures/thirdPartyScripts/), place it in tests/fixtures/live-userscripts/ (gitignored), register it through the register-live-userscript skill, check it against the harness (GM stubs, page globals, injection technique, @match → pageTypes), inventory what ShowAllEntityData already does about its markup, and — when the user wants ShowAllEntityData to take over the script's features — produce a feature-absorption inventory (data source, probe, storage, settings) that hands off to the feature skills. Use whenever the user says "wire this userscript in", "add this script to the live harness", "here is a new third-party userscript", "I dropped X into thirdPartyScripts / Downloads", or "implement what userscript X does" for a script not yet in tests/fixtures/live-userscripts/manifest.json.
---

# Wiring a new third-party userscript into the live-interop harness

`register-live-userscript` does ONE step — writing a manifest entry for a
file that is already in `tests/fixtures/live-userscripts/`. This skill is
the whole intake around it: getting the file there, checking that the
harness can actually run it, recording what ShowAllEntityData (SA) already
does about it, and, when asked, turning the script's features into a plan
for SA. Run the steps in order; each one ends with something you can show
the user.

No `// @version` bump and no changelog entry for anything this skill
touches by itself: `tests/` and `.claude/` are exempt (project
`CLAUDE.md`). A feature absorbed into SA afterwards is a normal change with
its own WIP changelog entry — that is the feature skills' job, not this one.

## 1. Intake — find the file and read its whole header

The file can arrive from three places:

- **A path in the repo** the user names.
- **A Windows path** (`C:\Users\…\Downloads\x.user.js`) — under WSL it is
  `/mnt/c/Users/…/Downloads/x.user.js`.
- **A copy committed by mistake** under `tests/fixtures/thirdPartyScripts/`.
  That directory is for small HAND-WRITTEN simulators (each one models ONE
  verified DOM side effect, with its own JSDoc). A file there with a
  `// ==UserScript==` header, a third-party `@author` and a licence block is
  a real script that landed in the wrong place. `git log --oneline -- <file>`
  tells you whether it was committed, and `git branch -r --contains <sha>`
  whether it was pushed.

Read the header block in full and note, for the summary you give the user:

| Header | What it tells you here |
|---|---|
| `@name`, `@author`, `@version`, `@license` | manifest fields; whether the file may be redistributed at all |
| `@match` / `@include` | which SA pageTypes it can interact with (step 4) |
| `@run-at` | the manifest `when` (see `register-live-userscript` step 2) |
| `@grant` | harness compatibility (step 4) |
| `@require` | external code the harness will `fetch()` at injection time |

Then skim the body for **how it runs**, because that changes what the
harness can reproduce:

- **Page-context injection** — `document.createElement('script')` with
  `textContent = '(' + fn + ')(…)'`, appended to the document. The real code
  then runs in the PAGE world, outside the userscript sandbox, and can use
  the page's own globals: MusicBrainz loads jQuery globally
  (`/static/…/jquery-global-*.js`, synchronous — `$` exists by
  DOMContentLoaded) and defines `MB`. In the harness the body already runs in
  the page world, so this works, but the script's GM values (`GM_info` is
  often JSON-serialised into the injected source) come from
  `tests/support/gmStubs.js`, not from Tampermonkey.
- **Reliance on page globals** (`$`, `jQuery`, `MB`, `__MB__`) — fine on a
  real musicbrainz.org page, absent on a local fixture. A fixture spec can
  never run such a script; that is one more reason the harness is live-only.
- **Its own storage** — `localStorage` keys (a common prefix such as
  `bpr_`), IndexedDB names, `GM_setValue` keys. Write them down: step 7 may
  want to import them.

## 2. Place — copy into `tests/fixtures/live-userscripts/`

```
cp <source> tests/fixtures/live-userscripts/<original file name>
git check-ignore -v tests/fixtures/live-userscripts/<original file name>
```

Keep the original file name — the user re-copies updates from their
browser under that name. `git check-ignore` must print the
`live-userscripts/.gitignore` (or root) rule; if it prints nothing, STOP: the
file would be committed. Real script bodies are never committed (see that
directory's README.md: they go stale, and they are not ours to
redistribute).

**When the source was a tracked file** (the `thirdPartyScripts/` mistake):
ask the user before removing it, then `git rm <old path>` and commit the
removal with the manifest change. It stays in history; say so if it was
already pushed — removing it now stops future copies from going stale, it
does not unpublish anything. Never touch the hand-written simulators that
live next to it.

## 3. Register — run `register-live-userscript`

Invoke the `register-live-userscript` skill for the copied file. It writes
the manifest entry (`id`, `file`, `author`, `version`, `when`, `touches`),
the `<id>-only` combination, extends `kitchen-sink`, and validates the
manifest with a throwaway Node script.

Two judgement calls that skill leaves open and that this intake has the
information for:

- **`when` for a script with no `@run-at`.** Tampermonkey's default is
  `document-idle`, which `register-live-userscript` maps to `'now'`. But
  `'now'` in the harness means "after SA's render", and a script that
  decorates the NATIVE page runs long before the user ever clicks an SA
  button. If the user's IP snapshot (step 6) shows the script's markup on
  the native table, use `'init'` (deferred to DOMContentLoaded) and say why
  in the first `touches` item.
- **`touches` for page-context code.** Name the injection technique and the
  page globals it needs, so a run that errors with `$ is not defined` is
  explained by the manifest instead of by the console.

## 4. Harness compatibility

Answer each in one line for the summary:

- **Grants.** `gmStubs.js` stubs the classic `GM_*` functions only — not the
  `GM.*` promise API and not `GM_download`/`GM_notification`/
  `GM_openInTab`. `grep -n "GM\.\|GM_[a-zA-Z]*" <file>` and compare.
- **`GM_info`.** The stub reports SA's own name (`ShowAllEntityData (test)`).
  A script that writes its `GM_info.script.name` into an edit note or a
  header will show that name in a harness run.
- **Top-level `await`.** `injectOne()` wraps every body in an async IIFE, so
  it works — say so if the script has it.
- **`@match` → pageTypes.** For each pattern, find the `tests/pagetypes.json`
  entries whose URL it matches; those are the pageTypes a smoke run is
  meaningful on. No match means the harness has no ready URL — the user
  passes `--url` instead.

## 5. What SA already does about it

Grep `ShowAllEntityData.user.js` for every marker the script writes: class
names, ids, header texts, inline style fragments, attribute names. SA often
already handles a script it has met on a real page, and that handling is
named after the author:

- `columnErasers` sentinels (`'jesus2099'`, `'jesus2099-any'`, `'wiencek'`, …)
  — grep `function buildActiveColumnErasers`' JSDoc for the full list;
- the foreign-header removers — `cleanupHeaders()`'s `removalMapAlways`, the
  index-tracking copy of it, and `_stripForeignHeaderTh` in
  `_watchForLateJesus2099Injections()`;
- `removeSelectors` entries on pageDefinitions;
- the simulators in `tests/fixtures/thirdPartyScripts/` (each says in its
  JSDoc which real script it models).

Report it as a table: marker → SA function that handles it → test that pins
it (or "no test"). An unhandled marker on a pageType the script `@match`es is
a candidate bug — say so, do not fix it inside this skill.

## 6. Snapshot

If the user supplied a `debug/*.html` taken with the script active, read it
(grep, it is usually ~1 MB) and confirm the markers from step 5 are in it.
Record it in `DEBUG-NOTES.md` under a new dated entry, with the environment
stamp the project `CLAUDE.md` defines — the browser and Tampermonkey
versions come from the user, never a guess. Say whether a fixture should be
cut from it: a fixture that keeps the script's markup is how a spec proves
SA strips or survives it without running the script.

## 7. Optional — absorption inventory

Only when the user wants SA to do what the script does. Build one table and
show it before writing code:

| Script feature | Decision | Data source | Storage | Settings |
|---|---|---|---|---|
| e.g. "live recording of <work>" line | absorb as a column | `/ws/2/recording?artist=…&inc=work-rels` | IndexedDB store | gate + TTL |
| e.g. batch edit submission | out of scope (outward-facing) | — | — | — |
| e.g. its header column | already handled (`cleanupHeaders`) | — | — | — |

For every "absorb" row:

- **Read the MusicBrainz API docs first** (project `CLAUDE.md` lists them),
  then write a `scripts/probe-*.py` that checks the exact endpoint, `inc=`
  and page size against the live service — search results omit
  `relations`, and a browse costs the parent's WHOLE catalogue.
- **Do not copy the script's algorithms blindly.** Scripts written for one
  100-row page routinely do O(rows × catalogue) work (e.g. Levenshtein of
  every row against every work) that hangs a consolidated 30 000-row SA
  table. Name the cost and the bound in the plan; SA's performance gate
  applies (`docs/claude/performance-rules.md`).
- **Storage.** The script's `localStorage` keys are on the same origin as
  SA, so an SA IndexedDB store can be SEEDED from them once at zero
  requests — offer that, behind a setting, and write the key format down.
- **Hand off** to the skill that owns the mechanism: `add-column-extractor`,
  `uniq-dropdown-section`, `add-finding`, `add-live-behavior-test`, and the
  topic docs under `docs/claude/` (the deferred-column rules in
  `deferred-columns-picard-relationships.md` apply to any network-backed
  column).

## 8. Finish

Print, do not run, the smoke-run command — it hits musicbrainz.org:

```
npm run live-interop -- --pagetype=<pageType from step 4> --scripts=<id>
```

Commit the manifest (and the `git rm`, if any) on its own:
`[ShowAllEntityData] docs: wire <script name> into the live-interop harness`.
