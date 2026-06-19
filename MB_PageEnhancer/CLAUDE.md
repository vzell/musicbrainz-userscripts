# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`MB_PageEnhancer.user.js` is a single-file Tampermonkey userscript that enhances MusicBrainz release and event pages. No build, lint, or test tooling — changes are tested by installing directly in Tampermonkey and loading the target page in a browser.

### Changelog and versioning

- Changelog file: `MB_PageEnhancer_CHANGELOG.json`
- Current version is at line 4 of the userscript header: `// @version M.MM.NNN+YYYY-MM-DD`
- Always read both files before making changes; never assume the version number
- Follow the parent `CLAUDE.md` for changelog JSON schema and branch/WIP conventions

---

## Architecture

### Entry point and URL matching

The script is wrapped in an IIFE and runs on:
- `*://*.musicbrainz.org/release/*-*-*-*-*` (UUID in path, not sub-pages)
- `*://*.musicbrainz.org/event/*-*-*-*-*`

Execution starts at the bottom of the file. Before doing anything it:
1. Extracts the MBID from the URL via regex
2. Finds `div.tabs` on the page
3. Checks that the "Overview" tab is active via `isOverviewTabActive()`

If any precondition fails, nothing runs.

### Library dependency

The script `@require`s `lib/VZ_MBLibrary.user.js` from GitHub raw. The library is instantiated as `Lib` and provides:
- **Logging**: `Lib.debug/info/warn/error(tag, msg)` — all output gated on `pe_enable_debug_logging`
- **Settings**: Schema-driven UI via Tampermonkey menu; values read from `Lib.settings.<key>`
- **Changelog UI**: Fetched from GitHub, displayed via GM menu item
- **Remote fetch with caching**: `Lib.fetchCachedText(url, cacheKey, ttlMs)`
- **Timers**: `Lib.time(label)` / `Lib.timeEnd(label, tag)`

A fallback object is assigned to `Lib` if `VZ_MBLibrary` is not available (console methods only).

### Config schema and settings namespace

All config keys use the `pe_` prefix to avoid storage collisions with other scripts sharing VZ_MBLibrary's GM storage backend. The schema is defined once at the top of the IIFE as `configSchema` and passed to `VZ_MBLibrary`. Settings are read at runtime from `Lib.settings.<key>` (never cached locally).

Config keys:
| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `pe_enable_debug_logging` | checkbox | false | Browser console debug output |
| `pe_enable_section_toggling` | checkbox | true | Collapse/expand native MB h2 sections |
| `pe_enable_caa_eaa` | checkbox | true | Fetch and inject art gallery |
| `pe_image_size` | number | 250 | Art thumbnail size in px |
| `pe_collapsed_by_default` | checkbox | false | Gallery starts hidden |

### Feature sections (BEGIN/END blocks in source)

The source is divided into three named blocks:

**SHARED UTILITIES** — `isOverviewTabActive()`, `ART_HEADER_CLASS`, `ART_GALLERY_CLASS`

Both CSS class constants are scoped with `SCRIPT_ID` (`vz-mb-page-enhancer`) so they don't collide with other scripts and can be used to `querySelectorAll` all script-managed elements for Ctrl+Click all-toggle.

**SECTION TOGGLING** — `makeTooltip`, `applyGalleryState`, `attachHeaderBehavior`, `initPageHeaders`

`initPageHeaders()` is synchronous. It builds the candidate `nativeH2s` list by querying all h2 elements in `#content`, then applying two filters: (1) exclude already-managed headers (have `ART_HEADER_CLASS`); (2) exclude h2 elements inside `.annotation-body` — MusicBrainz renders Markdown headings in annotation text as real h2 DOM nodes, which must not be treated as section headers.

For each candidate h2, siblings are collected until the loop hits another h2 tag directly **or** an element that `contains()` one of the *candidate* h2s (not any h2). Using the candidate set here is critical: `div.annotation-body` has an embedded annotation-prose h2 that is excluded from candidates, so the loop does **not** stop there, allowing `div.annotation-body` to be swept into the "Annotation" section's collapsible group.

`attachHeaderBehavior()` is reused for both native MB headers and the script-created art gallery header. The click handler has an early-return guard for interactive descendants (`button, a, input, select, textarea`) to avoid conflicts when other userscripts (e.g. GenerateRecordingCommentForRelease) append controls inside an `h2`.

Ctrl+Click on any managed header collapses/expands all sections with class `ART_HEADER_CLASS` together.

**`applyGalleryState` max-height strategy**: initial expanded wrappers carry no `max-height` constraint (`maxHeight: ""`). On expand, the function reads `scrollHeight` and animates to that exact value, then clears `max-height` on `transitionend` so content can resize freely. On collapse from an unconstrained state, it snapshots `scrollHeight` and forces a reflow (`void el.offsetHeight`) before setting `max-height: 0px`, giving CSS a concrete start value. The collapsed state sentinel is `style.maxHeight === "0px"`; the unconstrained expanded state (`""`) is correctly read as "not collapsed" by the same check.

**CAA / EAA ILLUSTRATED DISCOGRAPHY** — `displayArtGallery`

`displayArtGallery()` is async. It fetches from `coverartarchive.org` or `eventartarchive.org` depending on whether the URL starts with `/event/`. A 404 response is silently ignored (no art available). Images are rendered into a flex-wrap gallery `div` inserted after `div.tabs`. Thumbnail priority: `thumbnails["250"]` → `thumbnails.small` → `image` (full size).

The call is wrapped in an async IIFE at the bottom so `Lib.timeEnd()` fires only after the full async render, giving an accurate wall-clock measurement.

### SCRIPT_ID derivation

`SCRIPT_ID` is computed deterministically from `SCRIPT_BASE_NAME` (`"MB_PageEnhancer"`) by converting CamelCase to kebab-case and prepending `"vz-mb-"`, yielding `"vz-mb-page-enhancer"`. This is used to namespace DOM IDs, CSS classes, and the GM storage changelog cache key.

---

## Conventions specific to this script

- Section toggling always runs before the art gallery (synchronous first, async second)
- Both features are guarded by their own `Lib.settings.*` flag at the very top of their function — return early if disabled, log the skip at `debug` level
- DOM manipulation uses `document.createDocumentFragment()` + `Element.after()` to insert the gallery in a single reflow
- CSS transitions (`max-height`, `opacity`, `margin`) are used for collapse/expand animation; `max-height: 0` is the collapsed state sentinel checked in click handlers
