# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`SpringsteenCoverArtUploader.user.js` is a single-file Tampermonkey userscript that uploads cover art images from
Bruce Springsteen fan sites directly to MusicBrainz. No build, lint, or test tooling — changes are tested by
installing directly in Tampermonkey and loading the target page in a browser.

### What it does

1. **Detects supported releases** — runs on `musicbrainz.org/release/*/cover-art`. It queries the MusicBrainz Web
   Service (`/ws/2/release/<MBID>?inc=url-rels`) to find external URL relationships attached to the release.

2. **Supported source sites**
   - **springsteenlyrics.com** — parses a collection page (`collection.php?*`), extracts full-resolution `.jpg` links
     (skipping thumbnails with `_tn` suffix), and also supports a "Collect" button injected directly on that site.
   - **jungleland.it** — parses an artwork page, extracts full-resolution image links (jpg/jpeg/png), skips thumbnail
     paths (`_tn`, `thumb/`), and infers MusicBrainz artwork types (`Front`, `Back`, `Booklet`, `Medium`) from
     filename conventions (e.g. `19670916_front.jpg`).

3. **Upload flow** — queues the collected image URLs (with types and comment metadata) in GM storage under the key
   `CoverArtUpload_queue`, then navigates to the `/add-cover-art` page where it reads the queue, pre-fills the form
   fields (URL, artwork type checkboxes, comment), and submits each image sequentially with a short delay between
   submissions.

4. **GM compatibility** — wraps `GM.xmlHttpRequest` / `GM_xmlhttpRequest`, `GM.setValue` / `GM_setValue`, etc. in
   thin Promise-based helpers so the script works with both the legacy and modern Greasemonkey/Tampermonkey APIs.

### Changelog and versioning

- Changelog file: `SpringsteenCoverArtUploader_CHANGELOG.json`
- Current version is at line 4 of the userscript header: `// @version M.MM.NNN+YYYY-MM-DD`
- Always read both files before making changes; never assume the version number
- Follow the parent `CLAUDE.md` for changelog JSON schema and branch/WIP conventions

