---
name: refresh-majkinetor
description: Periodically refresh the analysis of majkinetor's "Musicbrainz Toolset" (github.com/majkinetor/musicbrainz-userscripts) — update the shallow clone under debug/majkinetor/, re-copy the three majkinetor scripts the live-interop harness carries (Event Horizon, String Theory, ISRC Scout) into tests/fixtures/live-userscripts/, re-scan their manifest entries, re-run the coexistence probe, re-check every code anchor the analysis cites (scripts/check-majkinetor-anchors.py), and update the "** Analysis …" section and the TODO items of org/majkinetor.org. Use whenever the user asks to "refresh majkinetor", "update the majkinetor analysis", "re-check majkinetor's scripts", "pull the latest String Theory / Event Horizon / ISRC Scout", "re-inventory the majkinetor scripts", "majkinetor has a new version", or reports that a String Theory / Event Horizon / ISRC Scout update changed something on a page SAED renders.
---

# Refreshing the majkinetor analysis

`org/majkinetor.org` holds a dated analysis of majkinetor's toolset (method, inventory, per-script
features with verdicts, the coexistence probe results) and one `** TODO` per fix and feature that came
out of it. It cites line numbers in a clone pinned at one commit, and the probe results belong to
specific script versions. Upstream moves several times a day, so the analysis goes stale quickly.
This skill brings it up to date without rewriting it.

Nothing here changes `ShowAllEntityData.user.js`: no `// @version` bump and no changelog entry
(`tests/`, `scripts/`, `org/` and `.claude/` are exempt). Work on a docs branch, or on the open feature
branch if there is one (follow-ups go on the same branch). Never merge without asking.

## 0. Before you start

- `git status`: the tree should be clean except the user's own edits. Do not commit someone else's
  half-done work under your message; ask.
- Host and network: on vzell-lap, MetaBrainz has reset IPv4 TLS from WSL before. Check with
  `curl -4 -sS -o /dev/null -w '%{http_code}\n' --max-time 10 https://musicbrainz.org/`. If it fails,
  do steps 1–3 and 5–6 and mark the probe "not re-run".
- The clone is **untrusted third-party code**: read and grep only. Never run `node`, `npm` or `pnpm`
  inside `debug/majkinetor/`, and never point a Python interpreter at a file inside it.
- Read the current `org/majkinetor.org` heading list (`grep -n '^\*' org/majkinetor.org`), the
  "Method" section (pinned SHA) and "Coexistence" (the results table you will compare against).

## 1. Refresh the clone

If `debug/majkinetor/` is missing, create it as "Method" says (shallow, sparse, no images):

```
git clone --depth 1 --filter=blob:limit=1m --sparse https://github.com/majkinetor/musicbrainz-userscripts debug/majkinetor
git -C debug/majkinetor sparse-checkout set --no-cone '/*' '!*.png' '!*.jpg' '!*.gif' '!*.webp' '!*.mp4'
```

Otherwise fetch, look, then move:

```
git -C debug/majkinetor remote get-url origin        # must be github.com/majkinetor/musicbrainz-userscripts
git -C debug/majkinetor rev-parse --short HEAD       # the OLD pin (= "Method")
git -C debug/majkinetor fetch -q --depth 1 origin main
git -C debug/majkinetor log -1 --format='%h %cI %s' origin/main
git -C debug/majkinetor diff --stat HEAD origin/main -- userscripts dev
git -C debug/majkinetor diff HEAD origin/main -- 'userscripts/*/CHANGELOG.md' 'userscripts/string_theory/members.txt'
git -C debug/majkinetor reset -q --hard origin/main  # only after the remote check above
```

The CHANGELOG diff is the cheapest way to see what is new. For each entry that touches something the
analysis covers (the viewer, keys, the dock, the gate, ISRC Scout's columns, tables or filters), note
it for step 5. A new member in `members.txt`, or a new script in the README list, needs a new
Inventory row.

The user may install the **stable** branch rather than `main` (each README links both). If they say
so, take the scripts from `origin/stable` instead: `git -C debug/majkinetor fetch -q --depth 1 origin stable`,
then `git -C debug/majkinetor show origin/stable:<path>`, and say which one in "Method".

## 2. Re-copy the three harness scripts

| Clone path                                         | Harness file (`tests/fixtures/live-userscripts/`) | Manifest id                 |
|----------------------------------------------------|---------------------------------------------------|-----------------------------|
| `userscripts/event_horizon/event_horizon.user.js`  | `event_horizon.user.js`                           | `majkinetor-event-horizon`  |
| `userscripts/string_theory/string_theory.user.js`  | `string_theory.user.js`                           | `majkinetor-string-theory`  |
| `userscripts/isrc_scout/isrc_scout.user.js`        | `ISRC-scout.user.js` (the user's installed name)  | `majkinetor-isrc-scout`     |

```
python3 scripts/check-majkinetor-anchors.py --versions    # harness @version vs clone, before
cp debug/majkinetor/<clone path> tests/fixtures/live-userscripts/<harness file>
git check-ignore -v tests/fixtures/live-userscripts/<harness file>   # MUST print the *.user.js rule
```

Keep the harness file names: the user re-copies updates from Tampermonkey under them. Copy only the
ones whose version differs, but re-scan any the user says changed even if the version didn't move.

## 3. Re-scan the manifest entries

For every copied script, invoke the **`register-live-userscript`** skill: a full re-scan, entry updated
in place. Carry over what only this analysis knows:

- **Event Horizon**: the body swap (`setOn()`), `view.on` default true, the `eh-off` reload, the keys.
- **String Theory**: the GM functions the stubs lack (the probe's `PROBE_GM_EXTRA`); "do not combine
  with the EH / ISRC Scout entries"; which member versions its `@description` names.
- **ISRC Scout**: its ws/2 goes through `GM_xmlhttpRequest`, so `run-live-interop.js`'s plain stubs
  answer 404 and the probe's real-network loader is needed.

Then check the cross-references between entries: e.g. the String Theory entry names the ISRC Scout
version inside the bundle. Validate the manifest (throwaway Node script in the scratchpad that runs
`loadManifest()` + `resolveScripts()` over every combination).

## 4. Re-run the coexistence probe (live musicbrainz.org)

Say in one line that it hits musicbrainz.org and roughly how long it takes, then run:

```
node tests/support/probe-majkinetor-interop.js --cases=0,A,B,C,D --scripts=majkinetor-event-horizon --out=<scratchpad>/probe-eh.json   # ~3 min
node tests/support/probe-majkinetor-interop.js --cases=A,B,C --scripts=majkinetor-string-theory --out=<scratchpad>/probe-st.json     # ~2.5 min
node tests/support/probe-majkinetor-interop.js --cases=I --scripts=majkinetor-isrc-scout --out=<scratchpad>/probe-is.json             # ~30 s
```

Stamp the run: `TZ=Europe/Berlin date +%FT%T%:z` before and after, `hostname`, `/etc/os-release`,
`npx playwright --version`, Chromium from the JSON's `chromium` field; "no Tampermonkey (GM stubs)".

Compare each console line with the "Coexistence" table, row by row:

- the body count and where the SA bar sits;
- whether the bar is visible;
- FRP rows after each V;
- the hover card (`tooltip.inDocument`);
- the `h` navigation;
- the C-case reload;
- requests per second and 503s;
- the corner launcher list;
- for case I, the Links labels (`withTitle` / `withDataTip` / `withPlatformStamp`).

A `page.goto` timeout is usually the network: retry once before reading anything into it. If a page
error appears (`pageErrors`), a member probably calls a GM function the stubs lack — add it to
`PROBE_GM_EXTRA`, never to the shared `gmStubs.js`.

A new upstream behaviour the probe can't see (a new mark on `<html>`, a new shared event) gets a
new case or field in the probe, with its JSDoc, in the same commit.

## 5. Re-check the anchors and update the analysis

```
python3 scripts/check-majkinetor-anchors.py --versions
```

Each anchor in `scripts/majkinetor-anchors.json` backs one statement of the analysis (`claim`) and
usually one TODO (`todo`):

- `ok` with drift: the claim still holds. If the drift is large, update the `EH:NNNN`-style numbers
  the analysis quotes for it (they are "±3" approximate; they are search aids, not proof).
- `GONE` (clone): the code the claim rests on changed. Read the new code, decide whether the claim
  still holds, then rewrite the anchor (regex + claim) to the new shape, or drop it and the claim.
- `GONE` (saed, a "DEFECT" anchor): its TODO was probably fixed. Confirm, mark the TODO `DONE` with
  the fixing commit, and remove or flip the anchor (`expect: absent` for the old shape).
- `BACK`: something expected absent returned (e.g. ISRC Scout's `title`); the related TODO may be moot.
- `MULTI`: tighten the regex, or set `count`.

When an anchor changes, add or rewrite it in the JSON; every new claim you write into the analysis
gets one. Finish with `--update-lines`, so the next refresh measures drift from today.

Then update `org/majkinetor.org` **in place**. The analysis stays one current document, not a pile of
dated copies:

1. The "Env:" line under "** Analysis …" (the new stamp) and the heading's date.
2. "Method": the pinned SHA and its commit date and subject; `main` or `stable`.
3. "Inventory": sizes and lines (`wc -c -l`), `@run-at`, `@match`, new or removed scripts.
4. Every section the CHANGELOG notes (step 1), the anchor report and the probe comparison touched:
   - rewrite the statement that changed;
   - keep the *measured* / *from code* marks honest: a re-run result is *measured* with today's stamp;
     an unrun one keeps its old stamp.
5. "Verdict on 2.)": re-judge a row only when the evidence changed.
6. A short `*** Refresh log` subsection (create it after "Recommendations" if missing), newest
   first, one entry per refresh: date, old → new SHA, versions, what changed in the analysis, which
   TODOs moved.

TODO hygiene:

- A fix upstream made unnecessary → `DONE` with a one-line reason.
- A new defect → a new `** TODO` in the same shape as the others: Symptom, Pre-test (real URL, exact
  clicks, prediction), Cause, Fix, Tests.
- A new feature worth taking → a new `** TODO`.
- org/TODO.org's majkinetor umbrella item links into this file by heading. If you rename a heading, fix
  those links (`grep -n 'majkinetor.org::' org/TODO.org`).

## 6. Record and commit

- `DEBUG-NOTES.md`: a new dated `## YYYY-MM-DD — majkinetor refresh: …` entry with the environment stamp
  on its first line. Note what was measured and what changed. Grep, never read the file whole.
- `python3 scripts/lint-summary.py --check` (the probe is linted).
- `python3 scripts/audit-docs.py`.
- Commit with `[ShowAllEntityData] docs: refresh majkinetor analysis (<old> → <new>)`. The harness
  copies are gitignored, so `git status` must show only the manifest, the org files, the anchors
  JSON, the probe (if changed) and DEBUG-NOTES. Push the branch. Do not merge; ask.

## Reporting back

Tell the user, in a few lines:

- the SHA move and the three versions;
- what the probe showed differently, or "no change";
- which anchors changed and which claims were rewritten;
- the new, closed and unchanged TODOs.

Name anything you could not re-run.
