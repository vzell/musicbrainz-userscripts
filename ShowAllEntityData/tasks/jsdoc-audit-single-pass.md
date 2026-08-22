# Task: JSDoc audit and cleanup for ShowAllEntityData.user.js

Do a complete pass over every function in the file (including inner
functions inside IIFEs/closures, not just top-level ones). For each:

1. **Locate its JSDoc block** (if any) — the comment immediately preceding
   the declaration. Note: earlier cleanups (v9.99.366) fixed
   stacked/misplaced JSDoc blocks where a comment ended up above the wrong
   function, so also check for JSDoc blocks that are *orphaned* (no
   function directly below) or *misattributed* (sitting above a function
   they don't actually describe — e.g. leftover from a nearby function
   that got moved or renamed).
2. **Compare doc against implementation**:
   - `@param` names, types, and count match the actual signature
     (including default values, destructured params, optional params).
   - `@returns` type/description matches what's actually returned
     (including early-return paths that return something different, e.g.
     `null`/`undefined` on a guard clause not mentioned in the doc).
   - Prose description still matches current behavior — flag any doc that
     describes an older mechanism that's since been refactored (e.g. a doc
     referencing a removed cache tier, a renamed variable, or a data
     structure that no longer exists).
   - `@deprecated` tags that no longer apply, or missing `@deprecated` on
     something that should have one.
3. **Missing JSDoc**: any exported/public function (call sites outside its
   own closure) or any non-trivial internal function (roughly: more than a
   couple of lines, or with non-obvious parameters) that has no doc block
   at all.
4. **Trivial functions**: one-liners or self-explanatory wrappers don't
   need a full JSDoc — use judgment rather than padding every single
   function; note which ones you skipped and why if it's not obvious.

## Output first, edit second

Before touching the file, give me a report grouped into:

- (a) wrong/stale docs to fix
- (b) orphaned/misattributed docs to remove or relocate
- (c) missing docs to add
- (d) trivial functions intentionally skipped

Let me confirm before you start editing.

## On edit

Per project conventions:

- Untabify tab stops
- Strip trailing whitespace on touched lines
- Add a `ShowAllEntityData_CHANGELOG.json` entry under `"🔧 Code Quality"`
  (or `"📖 Documentation"`, matching precedent like v9.99.366's JSDoc
  cleanup entry) summarizing what was fixed/added/removed
- Bump the version
