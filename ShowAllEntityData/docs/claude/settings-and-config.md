<!-- Split out of ShowAllEntityData/CLAUDE.md on 2026-09-27, verbatim (section headings unchanged). This file is the authority for its topic; CLAUDE.md keeps only a digest and the doc map. -->

# Settings and config

## Settings keys (GM storage via `Lib.settings`)

All settings are prefixed `sa_`. This is a curated "key ones" subset, and a
small fraction of the whole — **`ShowAllEntityData_CONFIG_DEFAULTS.json` is the
full set**, generated from `configSchema` by `scripts/dump-config-defaults.py`
and kept current by `scripts/audit-config-defaults.py`. Read it rather than
assuming this list is complete or that a key you remember still has the name you
remember. (`sa_enable_expand_rg` was documented here for a long time; the real
key is `sa_enable_expand_rgs`, plural.) **Nothing in the userscript reads that
file** — it is an artifact for review and for the audit, and
org/config-handling.org's "Why it must not be read at runtime" says why it must
stay that way.

**A `secret: true` setting never leaves this profile** (since U3, 2026-10-08;
org/iframe.org "* generalize to URLs", "What the answers change", 3). Its
first and so far only one is `sa_pop_ext_discogs_token`, a Discogs personal
access token. The config file is meant to be shared or moved to another
machine, so: `_buildConfigJson()` leaves a secret out; `_applyConfigSettings()`
counts one in a file as skipped and writes nothing, so a file neither sets it
(only a hand-written file can hold one) nor blanks it (the key's absence
touches nothing, as for every key); `_maskSecretSettingInputs()` turns its
text input into a password input (no autocomplete, no spell check) from
`_injectSettingsConfigButtons()`'s observer, so every entry point to the
dialog gets it — the library renders every text setting alike and knows
nothing of `secret`; and no code logs its value (the token travels only in a
request header, never in a URL). Pinned by `config-import-export.spec.js`,
`settings-dialog.spec.js` and three `U3:` mutations.

**A default has two places it can be wrong, and changing one is how they
drift.** The schema's `default:` is what the settings dialog shows and what
RESET restores; an inline `Lib.settings.sa_X || literal` is what applies when
that key reads falsy. All **166** fallback sites now agree with their own
schema default — 15 did not until 9.99.1137, because `bfb8ac3` changed seven
defaults "to sensible values" and left the literals thousands of lines away
untouched. **When you change a `default:`, grep for that key's inline
fallbacks and change them too**, or run the audit, which is there precisely so
you do not have to remember.

`scripts/audit-config-defaults.py` fails on a NEW disagreement, and on an
ORPHAN — an inline read of a key no longer in the schema, which is always its
fallback, silently and for ever. `scripts/config-fallback-drift-baseline.json`
is the accepted set and is currently EMPTY; keep it that way rather than
baselining a new one. A version bump alone is a NOTE, never a failure, so the
gate survives `merge-push-remove`'s fold. Run
`scripts/check-config-defaults-gate.py` after touching the audit: it
mutation-checks all eleven arms, and is what caught the ORPHAN case exiting 0.

**Storage holds only what the user CHANGED, and changing a `default:` now owes
a third thing.** VZ_MBLibrary 4.1.0's SAVE deletes a value equal to its schema
default instead of writing it, so an absent key follows the schema and a stored
one does not. Before that, one SAVE — even with nothing changed — wrote all
~232 keys and every later default was invisible to that user for ever
(org/config-handling.org F1). `_migrateFrozenSettings()` repairs a profile that
already froze, once, consumer-side so it ships without waiting on the mirror
republish.

So when you change a `default:`, the third obligation is **an entry in
`_SETTINGS_MIGRATIONS`** naming the value it moved away from — otherwise
everyone who has ever pressed SAVE keeps the old one. You do not have to
remember: refresh `scripts/config-default-history.json` with
`scripts/dump-default-history.py` (a walk of every revision, merges included —
732 on 2026-10-04, ~46 s) and the audit's Stage 3 names what is missing. It
reads COMMITTED history up to `HEAD`, never the working tree, so refresh it
after committing the schema change, not before. It walks each revision against
its own parents (`git log --topo-order --parents`), not in date order; since
2026-10-04 `scripts/check-default-history-walk.py` pins that against a scratch
repository with a merge in it. It fails on an INVENTED entry too, which
is the worse direction — that one silently overwrites a value the user may have
chosen on purpose.

**A seeded GM value in a spec looks exactly like a frozen one**, so
`tests/support/loadPage.js` seeds the migration level far above anything the
script ships and every fixture starts with migrations already applied. Four
call sites in `collapse-column-width-stable-on-sort.spec.js` seed
`sa_auto_resize_columns: false`, which IS a retired default. Only
`tests/fixtures/settings-migration.spec.js` opts back in.

**The settings dialog belongs to VZ_MBLibrary, and every entry point must go
through `Lib.configureSettings()`.** Six routes open it — the ⚙️ toolbar
button, `Ctrl+,`, `Ctrl+M ,`, the Tampermonkey menu item, the MusicBrainz
*Editing* menu link, and anything added later. The first three are this
script's; the next two are registered by the library itself and used to call
`showModal()` with no arguments, so opened either of those ways the 💾/📂
buttons were never injected and the 🔧 *Edit Pinned Filter List* button did
nothing (org/config-handling.org F5). `_registerSettingsIntegration()` now
records the `functionRegistry` and the `beforeOpen` hook ONCE, at bootstrap,
and every path falls back to it — **do not go back to passing either at a call
site**, which fixes only the paths you remember.

**The five `type: 'table'` settings now receive rows added in a later version,
and `sa_table_seed_ledger` is why.** They are lazy-seeded on first use and never
reconsult the built-ins, so F1's closing note called this unsolvable: stored
rows alone cannot tell "the user deleted this row" from "never seen it". The
answer is to record it rather than infer it — the ledger holds every built-in
row key this profile has been OFFERED, so absent ⇒ add, present-but-missing ⇒
stay deleted. Same pattern and same reason as `vz-mb-colvis-touched-*`.

- **`_seedNewTableRows()` is called at the FOOT of the IIFE, never the startup
  block.** `_TABLE_SEED_REGISTRY()` reads `SA_UNICODE_CHARS_DEFAULT` and the
  three `REL_*_DEFAULT` maps, all declared far below it; module-level `const`s
  are in the TDZ until evaluated, and `node --check` cannot see a TDZ error.
  The try/catch around `rows()` makes it SILENT — hence the `unreadable`
  counter in its result.
- **A test that drives `__saTest.seedNewTableRows()` cannot see where the
  production call is**, because the hook always runs late. `table-seed-ledger.spec.js`
  reads the ledger the PAGE LOAD produced for exactly that reason.
- **The ledger is exported in the config file; the migration trio is not.** Its
  difference from the stored rows is the only record that the user deleted a
  built-in row — drop it and an import resurrects their deletions.
- **Adding a built-in row is now a user-visible change.** It reaches existing
  profiles, so `ShowAllEntityData_CONFIG_DEFAULTS.json`'s `seed_rows` is what
  puts it in a diff. Only `sa_default_hidden_columns` announces it (a new row
  there hides a column); the other four are additive and stay silent.
- **The `REL_*_DEFAULT` constants have three readers and must stay one copy
  each.** They were written out twice before — the `let REL_*` initializer and
  the `_loadMap()` argument — with nothing keeping the two equal.

**The config file carries a second block, and `_CFG_WORKSPACE_GROUPS` is the
only thing that declares its keys.** `schema_version` 2 added `workspace`
beside `settings`: the pinned filter list, per-pageType *and per-sub-table*
column visibility, filter history, the two panel geometries, the 📊 dropdown's
section collapse, the release page Cover art layout
(`mb_sa_release_art_layout`, a bare string), the settings dialog's own
size/column widths/section collapse, and `vz-lib-prefs`. `configSchema` is what types the `settings` half;
these keys have nothing, so that registry is read by BOTH the exporter and the
importer — one list, twice — because the `settings` half's two loops skipped
different entry types for three months when each had its own (F3).

Three rules, each of which fails silently if broken:

- **Verbatim, both directions. Never `String()`, never a helpful `JSON.parse()`.**
  The shapes genuinely differ per key: `vz-mb-colvis-*` holds a
  `JSON.stringify()`ed STRING (both readers parse it), `persistent-sa-hist-list`
  an array, the geometries objects. This is F3's defect in a worse place —
  those five tables had `Lib.getTableRows()` re-seeding built-ins behind them,
  and nothing re-seeds a pinned filter list.
- **An allowlist, never a sweep.** `GM_listValues()` also returns
  `mb_sa_subtable_snapshot_*` payloads and the library's caches — and the file
  is user-supplied data, so without the gate a hand-edited one could set
  `sa_settings_migration_level` and disable F1's repair for good. The migration
  trio is deliberately out of the registry in both directions: it is INSTALL
  state, not user state.
- **An empty `[]`/`{}` IS exported here**, unlike an unseeded `type: 'table'`
  key. Copying that arm across is the plausible mistake and is wrong for the
  opposite reason — the table seeders read `[]` as "re-seed from the built-ins",
  and nothing re-seeds these. There is also no prune: no schema, no default,
  nothing to compare against.

`// @grant GM_listValues` exists for the sub-table colvis keys
(`vz-mb-colvis-<pageType>-sub-<safeId>` is built from a runtime heading id and
cannot be derived from `pageDefinitions`). Feature-detected like
`GM_deleteValue`; the fallback's gap is documented and asserted rather than
papered over. `gmStubs.js` stubs it, so tests exercise the sweep rather than
only the fallback.

**Nothing but `applyVisibility()` may assign `display` to a settings row, a
section header or a popup sub-grid.** Search and per-section collapse used to
be two mechanisms both writing `row.style.display`, last writer winning; the
"changed only" filter would have made it three. Visibility is computed in one
pass from three inputs — the needle, the changed-only toggle, each section's
stored collapse state. A filter opens the sections holding matches WITHOUT
touching their stored state, so clearing it restores the user's own layout;
mutations exist for both directions of getting that wrong.

**A fixture profile is not a pristine profile.** `FIXTURE_SETTINGS_OVERRIDE`
forces `sa_enable_caa_pics`, `sa_enable_relationships_column`,
`sa_enable_release_tracks_cover_art`, `sa_event_overview_event_art` and,
since org/non-MB-sites.org (2026-10-08), the five link-preview keys
(`sa_pop_mb`, `sa_pop_mb_page`, `sa_pop_ext`, `sa_dp_hover_without_ctrl`,
`sa_event_rg_tooltip_without_ctrl`) and, since the async job popup,
`sa_async_pop_auto_open` OFF, and all ten DEFAULT to true, so any
test that counts "changed" settings is off by ten unless it puts them back —
`settings-dialog.spec.js`'s `PRISTINE` is what that looks like (derived from
the override's keys, each seeded `undefined`, which stores nothing). The five
preview keys are also RETIRED defaults with a `_SETTINGS_MIGRATIONS` entry, so
`settings-migration.spec.js`, the one spec that runs the migration, un-seeds
the override the same way or the migration adopts them. Related: **`data-section` holds the divider's schema KEY**
(`divider_thresholds`), not its label; matching on the label finds nothing and
reads as the feature being broken.

**The drift is mostly invisible, which is why it lasted.**
`settingsInterface.init()` writes the schema default into `Lib.settings` for
every key, so the `||` is inert unless the stored value is falsy (a cleared
colour field, a `0`) or the `VZ_MBLibrary` `@require` failed and `Lib.settings`
is `{}`. Do not conclude from "nothing looks wrong" that the literals agree.

- `sa_enable_debug_logging` — enables `Lib.debug(channel, …)` output
- `sa_ui_h2_bg`, `sa_ui_h3_bg` — h2/h3 header background colours
- `sa_ui_thead_th_bg/color` — table header colours
- `sa_enable_barcode_highlight` — gates `initBarcodeHighlight()`
- `sa_enable_caa_pics` — shared CAA/EAA master toggle (there is no separate
  `sa_enable_eaa_pics` — EAA reuses this same key)
- `sa_enable_picard_tagger` — gates the Picard-tagger column feature;
  `sa_picard_tagger_initially_collapsed` (default **true**) decides only the
  STARTING state of the per-table ▶♪/▼♪ header toggle, never whether the
  column exists — see the Picard section below
- `sa_enable_expand_rgs` — gates `initExpandRGsFeature()` (note the plural)
- `sa_enable_ms_track_length` — master toggle for the ⏱ millisecond Length
  feature; `sa_ms_idb_enable`/`sa_ms_idb_ttl_days` gate its per-recording
  IndexedDB cache (`ms-rec-len` store)
- `sa_enable_annotation_collapse`, `sa_annotation_column_max_width`,
  `sa_annotation_column_max_height_em`, `sa_annotation_h2_bg`/
  `sa_annotation_h2_color` — prose-cell (Annotation) collapse/clamp behavior
  (see `collapsableColumns` below)
- `sa_enable_ars_collapse`, `sa_ars_column_max_width`,
  `sa_ars_column_max_height_em` — the "ARs" column's own independent
  collapse/clamp settings (release-tracks only, not shared with Annotation)
- `sa_enable_relationships_column` — master gate for the injected
  Relationships column (off ⇒ no `<th>`, no `<td>`, nothing);
  `sa_rel_collapse_threshold` (default **200** distinct entities, `0` = never)
  decides only which tables START collapsed — the `▶🔗` toggle is always
  present. See the Relationships section below
