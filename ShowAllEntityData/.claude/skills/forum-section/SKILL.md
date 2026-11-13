---
name: forum-section
description: Write the next "## Changes since last version (A -> B)" section of ShowAllEntityData's FORUM.org — the end-user release announcement posted to the community.metabrainz.org support thread — from the shipped changelog and a settings diff between the two releases. Use whenever the user asks to "add a new forum section", "write the forum post for this release", "update FORUM.org", "summarise the changes since the last forum post", "prepare the release announcement", "merge the forum sections", "plan videos for the forum post", or names two versions in the form "9.99.X -> 9.99.Y" in connection with FORUM.org.
---

# Writing a FORUM.org release section

`FORUM.org` collects one section per published release, newest LAST, each
headed `## Changes since last version (FROM -> TO)`. It is pasted into the
support thread
(https://community.metabrainz.org/t/vzell-s-userscripts-support-thread/814844),
so it is written for **users of the script**, not for its developers.

Run everything from `ShowAllEntityData/`.

## 1. Pin the two versions

- **FROM** = the last version actually PUBLISHED, which is the `// @version`
  of `../../mb-userscripts/ShowAllEntityData.user.js` (the mirror users install
  from; `scripts/check-publish-ready.py` names its path). Compare it with the TO
  of the last `## Changes since last version` heading in `FORUM.org`
  (`grep -n '^## Changes since' FORUM.org`):
  - **They agree**: append a new section, as below.
  - **The heading is newer than the mirror**: that section and any after it
    were written but never posted. Do not stack another one on top; write ONE
    section from the published version to TO and replace the unpublished ones
    with it (step 5). A user goes from release to release, so they read one
    post. This happened on 2026-11-13: 9.99.1167 -> 9.99.1426 was written and
    committed but never published, and was folded into 9.99.1167 -> 9.99.1623.
  - If the user names FROM, use theirs, but say what the mirror says.
- **TO** = the user's number, else the current `// @version` of
  `ShowAllEntityData.user.js` without its `+date`.
- Write the heading as `## Changes since last version (FROM -> TO)`, one
  space either side of `->`, even if the prompt typed it differently. Say so
  if you normalised it.

## 2. Collect the raw material — never count by hand

```bash
python3 scripts/forum-release-diff.py FROM TO > <scratchpad>/forum-diff.txt
```

It resolves each version to its fold commit on `main`, parses `configSchema`
at both with `scripts/dump-config-defaults.py`'s own parser, and prints:
sections added/removed/renamed, settings added/removed/renamed (with dialog
label, section and default), defaults changed, and every changelog entry in
(FROM, TO], oldest first. Read the whole file. It is large (≈100 KB for 85
entries, ≈170 KB for 197), so read it once, completely, in pages of about 200
lines, rather than skimming. For a quick settings-only view (the counts and
defaults for the "Your settings" part), add `--no-changelog`.

When unpublished sections are being merged (step 1), the FORUM.org text you
are replacing is a useful summary, but the settings numbers must come from a
fresh `FROM TO` run: a setting that was new in the first section and changed
in the second is just new to a FROM user. On 2026-11-13 this turned a 13-row
"defaults changed" table into the 6 colour rows: every other-site setting was
new since 9.99.1167, so it was simply "new, on".

Sanity check when unsure the script still parses correctly: the previous
section's numbers must come out again (`9.99.1167 9.99.1271 --no-changelog`
→ 93 added, 0 removed, 7 new sections).

## 3. Decide what goes in

Describe the **net change from FROM to TO** as a FROM user experiences it.

- **Leave out** `📝 Docs` and `🔧 Refactor` items, test/mutation/probe/perf
  bookkeeping, and anything marked "No change for users".
- **A setting added and flipped within the range is just a new setting** with
  its TO default (e.g. `sa_pop_mb` arrived off in 1272 and became on in 1298:
  to a 1271 user it is "new, on"). Likewise a feature added and then
  reverted is not mentioned.
- **A bug introduced and fixed inside the range is not a fix** for the post.
  Only list fixes for behaviour a FROM user could actually have seen. When an
  entry says "(9.99.N)" for an N inside the range, it is usually such a
  follow-up — fold it into the feature's own bullet.
- **Defaults changed**: since 9.99.1137, SAVE stores only settings that differ
  from their default, and the one-time repair (`_SETTINGS_MIGRATION_LEVEL`
  1) has run for anyone on a later release. So a default change reaches every
  user who has not set that setting themselves — write "These reach you
  automatically, unless you set them yourself". Before writing that, check
  `_SETTINGS_MIGRATION_LEVEL` and the SAVE behaviour have not changed since;
  the 9.99.746 -> 9.99.1167 section explains the old "frozen profile" problem
  and must not be repeated as current.
- **A new required library version** (an entry saying "needs VZ_MBLibrary
  X.Y.Z"): check the code degrades gracefully against an older library (grep
  the version in the userscript) and describe what the user sees either way.
  Do not assert how or when Tampermonkey refreshes a `@require`; flag that
  to the user instead.
- **Optional credentials** (`secret: true` settings in `configSchema`: the
  Discogs personal access token, the setlist.fm API key, any later one): name
  each by its dialog label, say where to get it (the setting's own
  `description` says so), and what it gains, with the numbers from the
  description or changelog (Discogs: 25 -> 60 requests a minute; setlist.fm:
  full setlist cards, 1,440 requests a day). Say they are sent only to their own
  site and never exported. Users skip a setting whose advantage nobody spelled
  out.
- **Requests and cookies**: anything that makes requests, contacts new hosts
  or sends cookies says so plainly. Check the changelog for new exceptions to
  "sent without your cookies" (2026-11: Discogs' image editor, a MusicBrainz page
  read from another site, setlist.fm search pages).

## 4. Structure

**Short, highlights first** (vzell, 2026-11-13: "not too many details if not
important"). Aim for about 150 lines however long the range is. A reader
should see the release's headlines on the first screen. The detail lives in
"What's new" and the development log, so the post can stay short. Ask the user
which headlines to put first; they know what the release is for.

```
## Changes since last version (FROM -> TO)

One or two sentences: how long, how many changes, what SAED is
(spell out "SAED, short for ShowAllEntityData" here, once).

### The highlights
  one bold line per headline, in the user's order

### Your settings and this update
  "you don't have to do anything", N settings added / M removed, the new
  (and renamed) ⚙️ sections by their exact dialog names;
  a table of changed defaults: Setting | Section | Old | New (Markdown
  pipe table, `|---|` rule, columns padded to line up);
  "Switched on by default, in case you'd rather not have them" — every new
  ON setting with a visible effect, by its dialog label and section;
  anything that makes requests or contacts new hosts says so plainly.

  the optional keys (see step 3), requests and cookies

### New: <feature>          one per highlight, same order, 1–5 bullets each
### Also new                a handful of smaller improvements
### Fixes                   about 10 a FROM user could actually have hit
```

The other sites (Discogs, setlist.fm, archive.org, the Springsteen sites)
get ONE "New:" section with a bullet per site, not a section each. Name
Discogs, setlist.fm and the Internet Archive as useful to MusicBrainz
editors, and the Springsteen sites as being for Bruce fans.

- **No abbreviations.** The project's prompt shorthand (PT, MB, RG, R, REC,
  GF, UVD, POH, FICE, IP, FRP, …, see CLAUDE.md) never reaches the post: write
  "page", "MusicBrainz", "release group". Spell out "SAED" once.

- Bullets open with a **bold one-line claim**, then plain sentences.
- Put `[SCREENSHOT: …]` on its own line after a bullet worth a picture,
  naming what the screenshot should show. The user takes them later.
- Name settings and sections exactly as the dialog shows them at TO (the
  diff's "renamed" list), never by `sa_` key. No function names, no file
  paths, no changelog version numbers.
- Third-party userscripts: by their `@name`, with a link only when the URL is
  known (its `@downloadURL` in `tests/fixtures/live-userscripts/`, or a link
  an earlier section already uses). Never invent a URL.
- Concrete examples beat abstractions: a real title, a real page, a measured
  number taken from the changelog entry (rounded, never improved).

## 5. Write and check

- Append with `Edit` after the last bullet of the previous section; never
  `Write` the file (`CLAUDE.md` → File Safety). Earlier PUBLISHED sections
  are history: do not change them unless the user asks.
- **Replacing unpublished sections** (step 1): draft the merged section in the
  scratchpad, then splice it in with a small scratchpad script that cuts at
  the first unpublished heading. The script must refuse unless that heading
  occurs exactly once and the last published heading is still before it, and it
  keeps everything before the cut byte for byte. That is safer than one huge
  `Edit` over hundreds of lines. Show the diff afterwards.
- Check: no trailing whitespace (`grep -nP '[ \t]+$' FORUM.org`), the
  counts in the opening paragraph match the diff, every setting named exists
  under that label at TO (`ShowAllEntityData_CONFIG_DEFAULTS.json`), no
  abbreviation from CLAUDE.md's table, and no `9.99.N` outside the heading.
  `grep -n '^## Changes since' FORUM.org` shows one heading per published
  release plus the new one.
- Rebuild the GitHub release notes: `python3 scripts/build-changelog-pages.py`.
  `ShowAllEntityData_RELEASES.md` ("What's new", opened from the
  Tampermonkey 📜 ChangeLog entry) is generated from these sections, and the
  build fails when TO is not a version in `ShowAllEntityData_CHANGELOG.json`
  (a typo in the heading, or a release that was never folded). Commit the
  regenerated page with the section.
- `FORUM.org` is not a userscript change: no version bump, no changelog
  entry. Show the diff; commit only when asked, as
  `[ShowAllEntityData] docs: FORUM.org section FROM -> TO`.
- **Screenshots and videos**: tag each `[SCREENSHOT: V<n> — …]` with a video
  ID. When the user records videos (Windows Game Bar), also write
  `org/forum-videos-<TO>.org` with one heading per ID: the exact URL, the
  settings to have on, numbered steps (what to press, hover, sort, filter) and
  what should be on screen. URLs come only from the repo (tests/live specs,
  `tests/pagetypes.json`, the snapshot registries, examples the changelog names)
  or from a MusicBrainz lookup that picks an entity with the data the video needs
  (e.g. a live release with tracks from two shows). Check each with one GET,
  paced 1.1 s apart, from a scratchpad script, and note the date. setlist.fm
  cannot be fetched from here: mark its URLs "not verified here". Where no URL
  fits, say how to pick one rather than guessing. 2026-11-13's file is the
  model.
- Tell the user which judgement calls you made (fixes dropped as in-range,
  settings left out of the "on by default" list, any library or permission
  caveat) so they can correct them before posting.
