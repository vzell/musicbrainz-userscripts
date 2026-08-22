# Task: JSDoc audit and cleanup for ShowAllEntityData.user.js (chunked)

Do a complete JSDoc audit of the file, worked in the following chunks, one
at a time — report and get confirmation on each chunk before moving to the
next, don't run the whole file in one pass.

## Chunking

Adjust boundaries if the actual file structure splits differently, but
keep this granularity:

1. Core render pipeline (fetch loop, `renderFinalTable`/`renderGroupedTable`,
   `finalCleanup`, column extraction/`ColumnDataExtractor`)
2. CAA/EAA illustrated discography (queue, icon/inline/bigbox loading, IDB
   cache, cache-hint telemetry)
3. Unique-values dropdown (`SYN_SECTION_META`, section rendering,
   structure-mode matchers, highlight functions, quickfilter)
4. Filtering/sorting (`runFilter`, `testRowMatch`, multi-sort, tint
   registry, column-header collapse)
5. Relationships column (`_relAppendIcon`, favicon resolution,
   `_relFetchWs2`, discography rels)
6. Settings/config schema + keyboard shortcuts (`ctrlMFunctionMap`,
   settings object, help-text sync)
7. Everything else (page-type definitions, third-party interop like the
   jesus2099 observers, snapshot/disk-load, misc utilities)

## For each chunk, do this

1. **Locate every function's JSDoc block** (top-level and inner/closure
   functions). Check for orphaned blocks (no function below) and
   misattributed ones (sitting above the wrong function — this file has
   had that bug before, v9.99.366).
2. **Compare doc against implementation**:
   - `@param` names/types/count match the real signature, including
     destructured/optional/default params.
   - `@returns` matches actual return behavior, including
     early-return/guard-clause paths.
   - Prose still matches current behavior — flag docs describing
     removed/refactored mechanisms (old cache tiers, renamed variables,
     dead data structures).
   - Stale or missing `@deprecated` tags.
3. **Flag missing JSDoc** on any function with outside-closure call sites
   or non-trivial internal logic. Skip trivial one-liners/self-explanatory
   wrappers — note which you skipped only if it's not obvious why.
4. **Report before editing this chunk**: group findings into
   (a) wrong/stale docs to fix, (b) orphaned/misattributed to remove or
   relocate, (c) missing to add, (d) trivial functions intentionally
   skipped. Wait for my go-ahead.
5. **On confirmed edit**: untabify tab stops, strip trailing whitespace on
   touched lines, apply standardized JSDoc formatting consistent with the
   rest of the file.
6. **Close out the chunk**: add one `ShowAllEntityData_CHANGELOG.json`
   entry under `"🔧 Code Quality"` (or `"📖 Documentation"` if it's purely
   doc-text fixes with no removed dead code) summarizing what was
   fixed/added/removed in that chunk, and bump the version once per chunk
   — not once for the whole audit, so each chunk is a reviewable,
   revertable unit.

Start with chunk 1 and stop for my confirmation after its report.
