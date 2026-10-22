---
name: forum-section
description: Write the next "## Changes since last version (A -> B)" section of ShowAllEntityData's FORUM.org — the end-user release announcement posted to the community.metabrainz.org support thread — from the shipped changelog and a settings diff between the two releases. Use whenever the user asks to "add a new forum section", "write the forum post for this release", "update FORUM.org", "summarise the changes since the last forum post", "prepare the release announcement", or names two versions in the form "9.99.X -> 9.99.Y" in connection with FORUM.org.
---

# Writing a FORUM.org release section

`FORUM.org` collects one section per published release, newest LAST, each
headed `## Changes since last version (FROM -> TO)`. It is pasted into the
support thread
(https://community.metabrainz.org/t/vzell-s-userscripts-support-thread/814844),
so it is written for **users of the script**, not for its developers.

Run everything from `ShowAllEntityData/`.

## 1. Pin the two versions

- **FROM** = the TO of the last `## Changes since last version` heading in
  `FORUM.org` (`grep -n '^## Changes since' FORUM.org`).
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
entries), so read it once, completely, rather than skimming.

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

## 4. Structure — follow the previous sections

```
## Changes since last version (FROM -> TO)

### Your settings and this update
  "you don't have to do anything", N settings added / M removed, the new
  (and renamed) ⚙️ sections by their exact dialog names;
  a table of changed defaults: Setting | Section | Old | New (Markdown
  pipe table, `|---|` rule, columns padded to line up);
  "Switched on by default, in case you'd rather not have them" — every new
  ON setting with a visible effect, by its dialog label and section;
  anything that makes requests or contacts new hosts says so plainly.

### New: <feature>          one per big feature, biggest first
### Enhancements: <area>    smaller improvements, grouped
### Beyond MusicBrainz: …   the opt-in foreign sites, last before Fixes
### Fixes
```

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
  `Write` the file (`CLAUDE.md` → File Safety). Earlier sections are
  published history: do not change them unless the user asks.
- Check: no trailing whitespace (`grep -nP '[ \t]+$' FORUM.org`), the
  counts in the opening paragraph match the diff, every setting named exists
  under that label at TO.
- Rebuild the GitHub release notes: `python3 scripts/build-changelog-pages.py`.
  `ShowAllEntityData_RELEASES.md` ("What's new", opened from the
  Tampermonkey 📜 ChangeLog entry) is generated from these sections, and the
  build fails when TO is not a version in `ShowAllEntityData_CHANGELOG.json`
  (a typo in the heading, or a release that was never folded). Commit the
  regenerated page with the section.
- `FORUM.org` is not a userscript change: no version bump, no changelog
  entry. Show the diff; commit only when asked, as
  `[ShowAllEntityData] docs: FORUM.org section FROM -> TO`.
- Tell the user which judgement calls you made (fixes dropped as in-range,
  settings left out of the "on by default" list, any library or permission
  caveat) so they can correct them before posting.
