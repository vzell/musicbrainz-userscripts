# Live userscript interop harness — local script bodies

This directory holds real, verbatim `.user.js` files copied from your own
live Tampermonkey install — the actual third-party scripts you run
alongside ShowAllEntityData on musicbrainz.org, not hand-built simulations
of one specific side effect (that's `tests/fixtures/thirdPartyScripts/`,
a different, committed mechanism — see its own files' JSDoc).

**The `.user.js` files themselves are gitignored** (`*.user.js` in this
directory — see the project `.gitignore`). They aren't ours to redistribute,
and a committed copy would go stale the moment its author updates it, giving
false confidence. Only `manifest.json` (which just names your local files —
no third-party source in it) and the harness code that reads it
(`tests/support/liveUserscripts.js`, `tests/support/run-live-interop.js`)
are committed.

## Setup

1. Copy the `.user.js` file(s) you want to test into this directory, exactly
   as installed (no need to strip the `// ==UserScript==` header — the
   harness does that).
2. Register each one in `manifest.json`:

   ```json
   {
       "scripts": [
           {
               "id": "jesus2099-supermind",
               "file": "mb_SUPER-MIND-CONTROL-II-X-TURBO.user.js",
               "author": "jesus2099",
               "version": "2026.5.21",
               "when": "init",
               "touches": [
                   "Global CSS (ROW_HIGHLIGHTER, default ON): pink row-hover background on ANY table.tbl, including ShowAllEntityData's own tables.",
                   "..."
               ]
           }
       ],
       "combinations": {
           "jesus2099-only": ["jesus2099-supermind"],
           "kitchen-sink":   ["jesus2099-supermind", "some-other-script"]
       }
   }
   ```

   - `id` — short name you reference from the CLI (`--combo`/`--scripts`).
   - `file` — filename in this directory.
   - `author`/`version` — copied verbatim from the script's own
     `// ==UserScript==` header.
   - `when` — `'init'` mimics `@run-at document-start` (registered before
     navigation, runs ahead of ShowAllEntityData); `'now'` mimics a script
     that finishes running only after ShowAllEntityData's own render has
     already completed. Pick whichever matches how the real script actually
     behaves — check its own `// @run-at` line, or just try both if unsure.
   - `touches` — an ARRAY of short, code-grounded statements, one per
     distinct visual/non-visual effect (not one long paragraph) — so each
     aspect can be checked off independently against what you actually see
     during a run. See any existing entry for the expected level of detail;
     the `register-live-userscript` skill automates writing these.
   - `combinations` — named, reusable sets of ids, run together and in the
     given order (also your approximation of real load order — see the
     caveat in `tests/support/liveUserscripts.js`'s own JSDoc: this can't
     replicate Tampermonkey's real internal scheduling exactly).

3. Run it — see `tests/support/run-live-interop.js`'s own header comment for
   the full CLI, e.g.:

   ```
   node tests/support/run-live-interop.js --pagetype release-tracks --combo jesus2099-only --diff
   ```

## What this is (and isn't)

This is a **debugging aid**, not a regression gate — there's no "correct"
expected output when an arbitrary third-party script is involved, so
`run-live-interop.js` never asserts pass/fail. Once you've found a real,
reproducible interaction worth defending against permanently, capture it as
a `debug/*.html` snapshot and add a minimal, hand-built simulator to
`tests/fixtures/thirdPartyScripts/` (see `add-live-behavior-test` skill /
`tests/live/third-party-*.spec.js` for that committed, CI-safe pattern) —
this directory's real script bodies are for YOUR OWN local investigation
only, and never a substitute for that.
