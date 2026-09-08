# Userscripts — Claude Code Guide

## Projects overview

Root directory for Tampermonkey userscripts.

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
   `+YYYY-MM-DD` stamp in `// @version`, which is what every existing entry
   does. A branch that took three days to write still ships on one of them, and
   `scripts/fold-wip-changelog.py` carries the WIP file's authoring date
   through, so this is a real step and not an automatic one.
6. Delete `<project>_CHANGELOG.wip.json`.
7. Re-read `<project>_HELP.txt` against what actually shipped, and reconcile it.
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

