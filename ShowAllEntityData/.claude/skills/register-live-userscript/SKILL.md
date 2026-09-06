---
name: register-live-userscript
description: Scan a real third-party userscript in tests/fixtures/live-userscripts/ — newly copied OR just updated by the user — and (re-)register it in that directory's manifest.json (author, version, when, and a code-grounded "touches" summary of its visual/non-visual effects) — the tests/support/run-live-interop.js harness reads this manifest to inject chosen combinations of real scripts alongside ShowAllEntityData. Use whenever the user says they copied/added/dropped a new userscript into tests/fixtures/live-userscripts/, says they UPDATED/refreshed/re-copied a userscript that's already registered, asks to "register this userscript", "re-scan this script", "add it to the manifest", "recheck the manifest", or "scan the new/updated script(s)".
---

# Registering a real userscript in `tests/fixtures/live-userscripts/manifest.json`

`tests/fixtures/live-userscripts/` holds real, verbatim `.user.js` bodies
copied from the user's own live Tampermonkey install (gitignored — see that
directory's README.md) for `tests/support/run-live-interop.js`'s live
interop-debugging harness. `manifest.json` (committed — it only names local
files, no third-party source) is what tells the harness which scripts exist,
their real load-order approximation (`when`), and — the part worth doing
carefully — what each one is actually expected to DO, so a run's visual
result can be interpreted instead of just stared at.

This is a **read-and-summarize task, not a code-writing task**: no
`// @version` bump, no `ShowAllEntityData_CHANGELOG.json` entry (everything
under `tests/` is exempt — see this project's own `CLAUDE.md`), and nothing
in `ShowAllEntityData.user.js` itself changes just from registering a
script.

## 1. Find what needs (re-)registering

```
ls tests/fixtures/live-userscripts/*.user.js
```

Compare that list against `manifest.json`'s `scripts[].file` entries. Two
distinct triggers land here, and both are handled identically from step 2
onward — there's no "lightweight patch" path, only "full re-scan":

- **New file** — present on disk, no matching `scripts[].file` entry yet.
- **Updated file** — already registered, but the user said they updated it
  (re-copied a newer version from their browser). Always treat this as a
  full re-scan, triggered by THEIR statement, not by first spotting a diff
  yourself:
  - Re-read the file's `@version` header and compare it to the manifest's
    `version` field for that entry. A mismatch confirms the update and
    tells you the old `version`/`touches` are for a prior revision.
  - **Don't stop there if they match.** A real-world author can (and does)
    edit a script's behavior without bumping `@version` — an unchanged
    version string is not proof nothing changed. If the user says they
    updated the file, re-scan its body against the CURRENT manifest
    `touches` array regardless of what `@version` says, and flag it to the
    user explicitly if `@version` didn't move despite a real edit (they may
    want to know their local copy is ahead of what its own header claims).
  - Re-run steps 2-4 completely from scratch on the current file content —
    don't try to diff old vs. new body and patch only the parts that look
    different. A small code change can invalidate a `touches` item that
    looks unrelated on its surface (e.g. a selector broadened to also match
    `table.tbl`), and partial patching risks stale entries surviving
    silently.
  - Update the existing entry IN PLACE (same `id`, same position in
    `scripts[]`) — never append a duplicate entry for the same `file`.
    `combinations{}` needs no change unless the update actually renamed the
    file (then update `file` — and only `file` — on the existing entry).

## 2. Read the header for `author`/`version`/`when`

The `// ==UserScript== … // ==/UserScript==` block gives you `@author` and
`@version` directly — copy them verbatim into the manifest entry.

For `when` (`'init'` or `'now'` — see `tests/support/liveUserscripts.js`'s
own JSDoc on `injectOne()` for exactly what each means and its "approximation,
not a guarantee" caveat):

- `@run-at document-start` → `'init'`.
- `@run-at document-end` → lean `'init'` — it fires at DOMContentLoaded,
  well before ShowAllEntityData's own fetch-driven render (which only
  starts after a manual "Show all" click), so in practice it has already
  run by the time ShowAllEntityData produces its table.
- `@run-at document-idle`, or no `@run-at` at all (Tampermonkey's default) →
  lean `'now'` — closer to "already-settled page," which is closer to how
  ShowAllEntityData's own async render behaves.
- If the script's own code shows it re-applies itself continuously (a
  `MutationObserver` on `document.body` or a container ShowAllEntityData
  renders into, a `setInterval` retry loop), note that explicitly in
  `touches` regardless of which `when` you pick — it means the real script
  keeps re-decorating content after EVERY re-render (filter, sort,
  ShowAllEntityData's own `cloneNode(true)` rebuilds), not just once, and
  `when` alone can't capture that ongoing behavior.

This is a judgment call — if genuinely ambiguous, pick a value and say so
explicitly rather than silently guessing; the user can correct it.

## 3. Read the body to write a code-grounded `touches` summary

**Do not summarize from the `@description` line alone** — it's marketing
copy for the script's full feature set, most of which (release-editor forms,
search pages, admin pages) ShowAllEntityData never renders and is
irrelevant here. `touches` exists to answer one question: *if I run
ShowAllEntityData with this script active, what should I actually expect to
see (or not see) differently, and why?*

Grep the body for the load-bearing signals, in roughly this priority order:

1. **Does it touch `table.tbl` at all?** (`grep -n "table\.tbl\|\.tbl\b"`) —
   ShowAllEntityData's own rendered tables all carry this class. A CSS rule
   or DOM query scoped to it WILL interact with ShowAllEntityData's output;
   one scoped to `div#release-editor`, a search form, or an edit page won't.
2. **Is it a live stylesheet rule** (`addCSSRule`, `GM_addStyle`,
   `insertRule`, a plain `<style>` injection) or a **one-shot DOM mutation**
   (`classList.add`, `setAttribute`, `appendChild` inside a function that
   only runs once)? A stylesheet rule matches forever, regardless of
   injection order or re-renders. A one-shot mutation only affects whatever
   DOM existed at the moment it ran — note which (the native MB page before
   ShowAllEntityData replaces it, or ShowAllEntityData's own table if it ran
   after).
3. **Does it set up a `MutationObserver`/interval that re-scans the page?**
   (see step 2's last bullet) — if so, expect it to re-decorate every
   ShowAllEntityData re-render, not just the first.
4. **Does it write a marker ShowAllEntityData already knows about?** Cross-
   check against `ShowAllEntityData.user.js`'s existing jesus2099-specific
   handling before assuming a "new" interaction:
   - `_titleHasRecNameMismatch()` / `tests/fixtures/thirdPartyScripts/
     jesus2099-title-mismatch.js` — a `title="...≠..."` marker on a track
     title `<a>`.
   - `_isJesus2099Treleases()` / `purgeJesus2099Artifacts()` — reuse of the
     native `treleases` class (plus this script's own `title` and a yellow
     header text-shadow) on a page type MusicBrainz doesn't natively mark
     with it.
   - `tests/fixtures/thirdPartyScripts/rogue-filter-writer.js` — a script
     writing directly into a `.mb-col-filter-input`'s `.value` and
     dispatching an untrusted `input` event.
   If the script you're scanning is the actual source of one of these (grep
   for the literal marker string/class name), say so explicitly in
   `touches` — it's a stronger, more useful statement than a generic
   description, and confirms which real script a committed simulator fixture
   is modeling.
5. **Any non-visual effect worth knowing about**: network calls
   (`GM_xmlhttpRequest`/`fetch` to a specific host), `localStorage`/
   `IndexedDB` writes, loading an external script/library. Keep this part
   short — one clause is usually enough.
6. **Anything that would make the harness itself choke**, independent of
   ShowAllEntityData: top-level `await` outside a function (Tampermonkey
   wraps a script's execution context so this works for it, but a bare
   `page.evaluate()`/`addInitScript()` needs the async-IIFE wrap
   `injectOne()` already applies — confirm this by checking whether the
   body starts with `await` outside any function), reliance on a Tampermonkey-
   only global beyond what `gmStubs.js` stubs (classic `GM_*` only, not the
   `GM.*` dot-syntax) — call these out as a caveat in `touches` rather than
   silently registering a script that will error when actually run.

Write `touches` as an ARRAY of short strings, one item per distinct aspect
found in steps 1-6 above — never one long paragraph. Each item should stand
alone (a reader checking off "did I see this?" against a live run shouldn't
have to parse a run-on sentence to find the one aspect they're looking for)
and cite the actual mechanism — a selector, a class name, a function name —
not just "adds some styling". A script with several unrelated features
(a global CSS rule, a page-specific DOM mutation, a non-visual network call)
gets several array items, not one that mashes them together. Look at
`manifest.json`'s existing entries for the expected level of granularity
and specificity before writing new ones.

## 4. Add the manifest entry

Pick a short kebab-case `id` — prefix with the author when the file name
alone wouldn't disambiguate two scripts by the same author (e.g.
`jesus2099-inline-stuff` vs `jesus2099-supermind`, not `inline-stuff` vs
`supermind`). Insert into `scripts[]`:

```json
{
    "id": "author-shortname",
    "file": "<exact filename in this directory>",
    "author": "<@author>",
    "version": "<@version>",
    "when": "init" | "now",
    "touches": [
        "<one distinct visual or non-visual effect, grounded in the code>",
        "<another, unrelated effect>"
    ]
}
```

## 5. Combinations

Ask (or infer conservatively) whether the new script should join an
existing named combination in `combinations{}`, or get its own
`<id>-only` entry (every script registered so far has at least a solo
combination — keep that pattern so a single script is always independently
selectable via `--combo`). Don't invent a multi-script combination the user
hasn't asked for beyond the standing `kitchen-sink` (every registered
script together) — extend that one, but leave picking any OTHER specific
subset combination to the user.

## 6. Sanity-check before finishing

Validate the manifest still parses and every combination still resolves —
write a small throwaway Node script (per this project's tooling convention:
never inline `node -e`) that `require()`s `tests/support/liveUserscripts.js`,
calls `loadManifest()`, and calls `resolveScripts()` against every
combination name, asserting no entry is missing required fields and every
`when` is `'init'` or `'now'`. Run it, then discard it (scratchpad, not the
repo).

Mention to the user, once done, that they can smoke-test the new
registration with:

```
npm run live-interop -- --pagetype=<a pageType from tests/pagetypes.json> --scripts=<new-id>
```

Don't run this yourself unprompted — it's a live musicbrainz.org hit, and
the whole point of `tests/pagetypes.json` scoping in the wider test-strategy
conversation is minimizing those.
