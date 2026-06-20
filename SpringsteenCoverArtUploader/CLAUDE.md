# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`SpringsteenCoverArtUploader.user.js` is a single-file Tampermonkey userscript that uploads cover art images from
Bruce Springsteen fan sites directly to MusicBrainz. No build, lint, or test tooling — changes are tested by
installing directly in Tampermonkey and loading the target page in a browser.

### What it does

This script is an **ArtStation plugin** (see `debug/art_station.user.js`, `debug/discussion.txt`). It registers two
cover-art providers with ArtStation's plugin API; ArtStation then shows "Import from SpringsteenLyrics" and
"Import from Jungleland.it" buttons in its Source popover on the MusicBrainz cover-art page.

#### Provider registration (`registerProviders`)

Called on `musicbrainz.org/release/*/cover-art`. Registers both providers via:
- `window.ArtStation?.registerProvider(provider)` — direct call if ArtStation is already loaded
- `document.dispatchEvent(new CustomEvent('artstation:register-provider', { detail: provider }))` — CustomEvent
  fallback for load-order safety (ArtStation listens for this even when the plugin script runs first)

#### Provider contract

Each provider object has `{ id, name, icon, run(ctx) }`. ArtStation calls `run(ctx)` when the user clicks "Import
from …". `ctx` contains `{ mbid, entity, artist, title, url }`.

`run(ctx)` returns an array of image descriptors: `{ blob?, dataUrl?, url?, types: string[], comment, source }`.
ArtStation converts any format to a Blob and stages the images in its gallery for review before the user commits.

#### Supported source sites

Both providers start by calling `getMBExternalURLs(ctx.mbid)` — the MB Web Service
(`/ws/2/release/<MBID>?inc=url-rels`) — to find the site's URL among the release's external links. No hardcoded
per-release mapping is needed.

- **springsteenlyrics.com** (`springsteenlyrics` provider) — finds the `collection.php` URL linked on the release,
  then opens it in a real browser popup (CloudFlare bypass; see below). The popup extracts full-resolution `.jpg`
  links from the live DOM and fetches each as a `dataUrl` (same-origin, CF cookie valid). Returns
  `{ dataUrl, types: [], source }` — ArtStation resolves `dataUrl` to a Blob via `fetch()`.
- **jungleland.it** (`jungleland` provider) — finds the `.htm` artwork page URL, fetches its HTML via
  `GM.xmlHttpRequest` (no CF protection), extracts image links (jpg/jpeg/png, skipping `_tn`/`thumb/`), infers
  artwork type strings (`'Front'`, `'Back'`, `'Booklet'`, `'Medium'`) from filename suffixes
  (e.g. `19670916_front.jpg`), then fetches each image as a Blob via `gmFetchBlob`. Returns `{ blob, types, source }`.

#### CloudFlare bypass for SpringsteenLyrics (`fetchImagesViaPopup` + `runAsSpringsteenPopup`)

`GM.xmlHttpRequest` from the MusicBrainz origin fails CloudFlare's bot detection regardless of cookies (TLS
fingerprint mismatch). The fix:

1. `fetchImagesViaPopup(url, mbid)` opens the SpringsteenLyrics collection page in a real browser popup with
   `?cau_extract=1&cau_mbid=<MBID>` appended. Returns a Promise that resolves on `postMessage`.
2. `runAsSpringsteenPopup()` runs on `springsteenlyrics.com` when `cau_extract` is in the URL. Extracts image URLs
   from the already-loaded live DOM, fetches each binary as a data URL using `fetch()` with `credentials: 'include'`
   (same-origin — CF sees it as a normal browser request), then `postMessage`s the payload back to the MB opener
   and closes after 1.5 s.

#### GM compatibility

Wraps `GM.xmlHttpRequest` / `GM_xmlhttpRequest` in thin Promise-based helpers (`gmRequest`, `gmFetch`,
`gmFetchBlob`) so the script works with both the legacy and modern Greasemonkey/Tampermonkey APIs. GM storage
grants (`setValue`/`getValue`/`deleteValue`) are **not** used — ArtStation owns the staging flow entirely.

### Changelog and versioning

- Changelog file: `SpringsteenCoverArtUploader_CHANGELOG.json`
- Current version is at line 5 of the userscript header: `// @version M.MM.NNN+YYYY-MM-DD`
- Always read both files before making changes; never assume the version number
- Follow the parent `CLAUDE.md` for changelog JSON schema and branch/WIP conventions

