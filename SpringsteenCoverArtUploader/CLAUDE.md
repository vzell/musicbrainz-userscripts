# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`SpringsteenCoverArtUploader.user.js` is a single-file Tampermonkey userscript that uploads cover art and
event-art images from Bruce Springsteen fan sites directly to MusicBrainz. No build, lint, or test tooling —
changes are tested by installing directly in Tampermonkey and loading the target page in a browser.

### What it does

This script is an **ArtStation plugin** (see `debug/ArtStation.user.js`, `debug/discussion.txt`). It registers
three providers with ArtStation's plugin API; ArtStation then shows "Import from …" buttons in its Source
popover on the MusicBrainz cover-art and event-art pages.

#### Provider registration (`registerProviders`)

Called on `musicbrainz.org/release/*/cover-art` and `musicbrainz.org/event/*/event-art`. Registers all three
providers via:
- `window.ArtStation?.registerProvider(provider)` — direct call if ArtStation is already loaded
- `document.dispatchEvent(new CustomEvent('artstation:register-provider', { detail: provider }))` — CustomEvent
  fallback for load-order safety (ArtStation listens for this even when the plugin script runs first)

#### Provider contract

Each provider object has `{ id, name, match, run(ctx) }`. **Do not set `icon`** — see
[Known ArtStation quirks](#known-artstation-quirks) below. The `match` field (string hostname, string[],
RegExp, or `(url) => bool`) tells ArtStation which releases/events to show the button for. ArtStation queries
`/ws/2/release/<MBID>?inc=url-rels` (or the equivalent event endpoint) itself, filters the entity's external
links against `match`, and only renders "Import from …" when there is at least one hit. The matched URL is
passed to `run(ctx)` as `ctx.link` (`ctx.links` = all matches). `ctx` also carries
`{ mbid, entity, artist, title, url }`.

`run(ctx)` returns an array of image descriptors: `{ blob?, dataUrl?, url?, types: string[], comment, source }`.
ArtStation converts any format to a Blob and stages the images in its gallery for review before the user commits.

#### Supported source sites

Providers declare a `match` predicate; ArtStation resolves the entity's external links and supplies the matched
URL as `ctx.link`. No MB API call in `run()` is needed.

- **springsteenlyrics.com** (`springsteenlyrics` provider, `match: 'springsteenlyrics.com'`) — opens `ctx.link`
  in a real browser popup (CloudFlare bypass; see below). Supports both URL types on the site:
  - `collection.php?item=<id>` — official releases
  - `bootlegs.php?item=<id>` — bootleg releases
  Both use the same HTML structure (`<a target="_blank" href="*.jpg"><img src="*_tn.jpg"></a>`), so a single
  `extractSpringsteenImages` function handles both. The popup extracts full-resolution `.jpg` links from the live
  DOM and fetches each as a `dataUrl` (same-origin, CF cookie valid). Returns `{ dataUrl, types: [], source }`
  — ArtStation resolves `dataUrl` to a Blob via `fetch()`.

- **jungleland.it** (`jungleland` provider, `match: 'jungleland.it'`) — fetches `ctx.link` HTML via
  `GM.xmlHttpRequest` (no CF protection), extracts image links (jpg/jpeg/png, skipping `_tn`/`thumb/`), infers
  artwork type strings (`'Front'`, `'Back'`, `'Booklet'`, `'Medium'`) from filename suffixes
  (e.g. `19670916_front.jpg`). Returns `{ url, types, source }` with plain image URLs — no byte fetching
  in the provider. ArtStation's own `providerBlob → gmFetch` downloads the bytes in its own realm,
  which is the robust default for sites without CloudFlare protection.

- **brucebase.wikidot.com** (`brucebase` provider,
  `match: url => /^https?:\/\/brucebase\.wikidot\.com\/\d{4}#\w/.test(url)`) — used on MusicBrainz
  **event-art** pages. External links have the form `http://brucebase.wikidot.com/<year>#<anchor>`
  where `<anchor>` is `DDMMYY[char]` (e.g. `150924c` = 15 Sep 2024, event c).

  Two-step fetch:
  1. `gmFetch(yearPageUrl)` — fetches the BruceBase year overview page (raw HTTP, not rendered DOM).
     `extractBrucebaseNewsUrl(html, anchor)` locates the named anchor with a bounded regex
     (`<a name="…">` followed within 150 chars by `<strong><a href>`), extracts the event slug from
     the href (category prefix `gig:`, `nogig:`, `rehearsal:`, etc.), and rewrites it to
     `http://brucebase.wikidot.com/news:<slug>`. A regex is used because the raw HTTP response
     differs structurally from the browser-rendered DOM (Wikidot's ListPages module rewrites the page
     client-side), making `closest('p')` unreliable.
  2. `gmFetch(newsUrl)` — fetches the event news page.
     `extractBrucebaseImages(html, newsUrl)` parses it with DOMParser and collects all
     `a[href*="brucebase.wdfiles.com"]` links, converting two URL patterns to full-resolution:
     - `local--files/{page}/{file}.jpg` — used as-is
     - `local--resized-images/{page}/{file}/medium.jpg` → replace path prefix + strip `/medium.jpg`

  `inferBrucebaseTypesAndComment(url)` derives the ArtStation event-art type(s) and comment from
  the filename. BruceBase convention: `YYYYMMDD[char]_Category_Number[_Qualifier…].ext`.
  Qualifier normalisation: all-ASCII-uppercase tokens (GA, VIP, SHN) keep their case; others are
  lowercased. For Wristband, consecutive non-caps qualifiers are space-joined per run so that
  `GA_Sun_Pass` yields `wristband, GA, sun pass` rather than `wristband, GA, sun, pass`.

  | Category token | ArtStation type(s) | Comment |
  |---|---|---|
  | `Pass` | `Ticket` | — |
  | `Wristband` | `Ticket` | `wristband, <zone>, <ticket-class>` |
  | `Setlist` | `Setlist` | qualifiers comma-joined, normalised |
  | `Banner` | `Banner` (+ `Merchandise` if qualifier present) | remaining qualifiers |
  | `Merchandise` | `Merchandise` | qualifiers comma-joined, normalised |
  | `AdPoster` / `Poster` | `Poster` | — |
  | `Flyer` | `Flyer` | — |
  | `Schedule` | `Schedule` | — |
  | `Program` / `Programme` | `Program` | — |
  | `Map` | `Map` | — |
  | `Logo` | `Logo` | — |

  Returns `{ url, types, comment, source }` with plain image URLs — ArtStation downloads the bytes
  via its own `providerBlob → gmFetch`.

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

Wraps `GM.xmlHttpRequest` / `GM_xmlhttpRequest` in thin Promise-based helpers (`gmRequest`, `gmFetch`)
so the script works with both the legacy and modern Greasemonkey/Tampermonkey APIs. GM storage
grants (`setValue`/`getValue`/`deleteValue`) are **not** used — ArtStation owns the staging flow entirely.

### Known ArtStation quirks

#### Do not set `icon` on providers — it breaks gallery thumbnails

ArtStation's `wire()` runs **before** `hydrateImgs()` on every `render()` call. It does
`th.querySelector('img')` inside each `.as-thumb` to locate the gallery image. For `_new` items,
`thumbImg()` emits `<span class="as-imghost">` (not an `<img>`), so there is no gallery image in
`.as-thumb` at `wire()` time.

If a provider sets `icon`, ArtStation injects `<span class="as-prov"><img src="${icon}"></span>`
inside `.as-thumb`. That badge `<img>` is the **first — and only — img** `wire()` finds. It assigns
the gallery-image `onerror` handler to the favicon instead. When the favicon URL returns 404, that
handler fires `th.classList.add('na')`, and the CSS rule `.as-thumb.na img { display:none }` hides
**all** imgs inside `.as-thumb` — including the gallery JPEG that `hydrateImgs()` subsequently
inserts. The gallery card appears with correct dimensions but a blank thumbnail.

**Rule: omit `icon` from every provider object.**

### Changelog and versioning

- Changelog file: `SpringsteenCoverArtUploader_CHANGELOG.json`
- Current version is at line 5 of the userscript header: `// @version M.MM.NNN+YYYY-MM-DD`
- Always read both files before making changes; never assume the version number
- Follow the parent `CLAUDE.md` for changelog JSON schema and branch/WIP conventions
