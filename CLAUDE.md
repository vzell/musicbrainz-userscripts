# Userscripts — Claude Code Guide

## Projects overview

Root directory for Tampermonkey userscripts.

## MusicBrainz API documentation

Before writing or changing any code that calls a MusicBrainz web service
(`/ws/2/…` lookup, browse or search), consult the official documentation first
and derive behaviour from it rather than from memory:

- Web service overview, `inc=` parameters, browse/search/lookup semantics:
  https://musicbrainz.org/doc/MusicBrainz_API
- Search syntax and indexed fields (Lucene):
  https://musicbrainz.org/doc/MusicBrainz_API/Search
- Rate limiting (about 1 request/second per client; expect HTTP 503 under load):
  https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting

Cover Art Archive (`coverartarchive.org`, `eventartarchive.org`) has its own API:
https://musicbrainz.org/doc/Cover_Art_Archive/API — read it before touching
artwork fetching. As documented (checked 2026-09-19): no rate limiting rules
are published for coverartarchive.org, there are no batch or bulk endpoints
(one request per release/release-group), each image carries an `approved`
boolean, and the page says nothing about the `cover-art-archive` block
(`count`/`front`/`back`/`artwork`/`darkened`) that MusicBrainz's own release
JSON carries — that block is undocumented there, so any use of it must rest on
a probe (`scripts/probe-caa-presence-from-browse.py`), not on the docs.

Then verify against the live endpoint with a probe script (see the
`scripts/probe-*.py` files in `ShowAllEntityData/`) — the docs describe intent,
and several endpoints behave differently from what they suggest (e.g. search
results omit `relations`; a browse endpoint's cost scales with the parent
entity's whole catalogue, not the rows shown). Record the probe result next to
the code that depends on it.

---

## Commit message conventions

When writing a Git commit message prepend with the name of the project in brackets like e.g. "[ShowAllEntityData] <commit message text>

---

## Shell command conventions

When writing and running Python (or other scripts) to analyze files, always save the code to a `.py` file first and execute it with a plain command like `python3 script.py`. Never use inline `python3 -c "..."`, pipes, command substitution (`$(...)`), or embedded quotes directly in the Bash command — these trigger Claude Code's static-analysis permission check and force a manual approval every time.

---

## Changelog format

```json
{
  "version": "9.99.XXX",
  "date": "YYYY-MM-DD",
  "sections": [
    {
      "label": "🐛 Fix | ✨ Improve | 🚀 Feature | 🔧 Refactor | 📝 Docs",
      "items": [ "Description of the change." ]
    }
  ]
}
```

Prepend new entries at the top of the JSON array.

---

## Versioning

Always read the current `// @version` from the userscript header and the latest entry in `<project>_CHANGELOG.json` 
before making any changes. Never assume a version - always derive it from the source files.

**Version bumps and `<project>_CHANGELOG.json` entries belong on `main` only.**
Feature branches must NOT touch `// @version` or `<project>_CHANGELOG.json`.

### Tracking work in a feature branch — `<project>_CHANGELOG.wip.json`

While working in a feature branch, record changes in the
`<project>_CHANGELOG.wip.json` using placeholder versions `"WIP.1"`,
`"WIP.2"`, … (newest first, same JSON schema as the real changelog).
Cross-references between WIP entries use the same `WIP.N` labels.

At merge time (on `main`):
1. Read the WIP file, assign the next real version numbers in order.
2. Update any `WIP.N` cross-references inside the entry text to the real versions.
3. Prepend the entries to `<project>_CHANGELOG.json`.
4. Bump `// @version` to the highest assigned number.
5. Set each folded entry's `date` to the SHIP date — the day the merge lands on
   `main` — not the day the WIP entry was written. It must match the
   `+YYYY-MM-DD` stamp in `// @version`. A branch that took three days to write
   still ships on one of them.
   **`scripts/fold-wip-changelog.py` does this itself as of 2026-09-18**, and
   its dry run lists every re-dating, so read that line rather than redoing the
   work. It used to carry the authoring date through, with this step described
   here as a hand correction — and a hand step that changes nothing visible is
   exactly the kind that gets skipped. It was: whole folded batches carry the
   day they were written, and three entries (9.99.1005, 9.99.955, 9.99.755) are
   dated BEFORE the release below them. Those are left alone, because the
   published dates are what release notes already show; they are allowlisted by
   name in `scripts/audit-changelog.py`, which now fails on a NEW one, and on a
   newest entry whose date disagrees with the header's stamp.
6. Delete `<project>_CHANGELOG.wip.json`.
7. Re-read the project's help file against what actually shipped, and reconcile
   it. **The extension differs per project** — `ShowAllEntityData_HELP.md`
   since 9.99.1148, `MB_PageEnhancer_HELP.txt` still — so go by what that
   project's own `REMOTE_HELP_URL` names rather than by the suffix.
   Not "did I remember to update HELP" — read the sections the change touches
   and confirm they still describe the code. A change can make HELP wrong
   without adding anything to it, and a change can need no HELP edit at all;
   both are fine, but say which, so the next reader knows it was checked rather
   than skipped.

---

## Mandatory conventions — apply to every change

- Bump `// @version` in the `==UserScript==` header. Format: `M.MM.NNN+YYYY-MM-DD`
- Add a changelog entry to `<project>_CHANGELOG.json` in the same session
- 4-space indentation, no tabs, no trailing whitespace
- All functions must have JSDoc `/** … */` blocks

