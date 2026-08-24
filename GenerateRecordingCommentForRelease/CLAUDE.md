# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`GenerateRecordingCommentForRelease.user.js` is a single-file Tampermonkey userscript for MusicBrainz release
pages. It adds an inline editing UI to the release tracklist for batch-setting recording disambiguation
comments, with prefilling from the recording's "recorded at:" relationship. No build, lint, or test tooling —
changes are tested by installing directly in Tampermonkey and loading a release page in a browser.

Based on the original "MusicBrainz: Set recording comments for a release" script by Michael Wiencek; extended
by vzell with AI assistance (see `@tag AI generated` in the header).

### How it works

The outer userscript body only injects `setRecordingComments` as an inline `<script>` tag (after a 1s
`setTimeout`) so the function runs in the page's own context and can use the jQuery instance MusicBrainz
already loads. Everything below lives inside that injected function.

1. **Waits for the tracklist** via a 1s-interval poll for `.medium tbody tr[id]` rows, since the tracklist
   renders asynchronously after page load.
2. **Injects one `<input class="recording-comment">` per track row**, positioned after the recording link/name
   node, and stores the recording MBID on the input via `.data('mbid', mbid)`.
3. **Fetches release data** from `/ws/2/release/<releaseId>?inc=recordings&fmt=json` to read each recording's
   existing `disambiguation` value (the "old" comment).
4. **Prefills empty inputs**: looks for `dt:contains("recorded at:") + dd bdi:first` in the track row; if
   found, prefills with `"live, " + <recorded at text>`; otherwise falls back to the recording's existing
   disambiguation. Inputs are red-bordered when their value differs from the original disambiguation.
5. **"Edit recording comments" button** (in the `h2.tracklist` header) toggles `editing` mode, showing/hiding
   the inputs and the editing table (`#set-recording-comments`: a "set all" input, edit-note textarea, votable
   checkbox, submit button).
6. **Submit** collects changed, visible-row comments into MusicBrainz edit-type `72` (recording edit) payloads
   and POSTs them to `/ws/js/edit/create` as a single batch. A second click on the submit button while a
   request is in flight aborts it.

### Settings (edit note persistence)

The ⚙️ icon (also in the `h2.tracklist` header) opens a modal to customize the edit note text, which is
persisted in `localStorage` under `mb_recording_comments_edit_note` and defaults to the MB "live" recording
disambiguation style-guide text. The edit-note textarea in the main editing table is repopulated from this
value whenever edit mode is entered.

### Constraints

- `EDIT_RECORDING_EDIT = 72` is MusicBrainz's internal numeric edit type for a recording edit — do not change
  without confirming against current MB edit-type numbering.
- `MBID_REGEX` is deliberately loose (no anchors) since it's reused to pull an MBID out of both `href`
  attributes and `location.pathname`.
- The script only runs on release pages matched by the `@match`/`@include` directives in the header — see
  those directives for the exact URL shape supported (single release page, not tab sub-paths).

### Changelog and versioning

- Changelog file: `GenerateRecordingCommentForRelease_CHANGELOG.json`
- Current version is at line 4 of the userscript header: `// @version M.MM.NNN+YYYY-MM-DD`
- Always read both files before making changes; never assume the version number
- Follow the parent `CLAUDE.md` for changelog JSON schema and branch/WIP conventions
