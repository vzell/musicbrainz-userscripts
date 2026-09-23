"""Compare the development repo against the published mirror before republishing.

Two repositories hold these userscripts. `vzell/musicbrainz-userscripts` is the
development one (this checkout, per-project directories plus `lib/`); the
announced one is `vzell/mb-userscripts`, a FLAT layout whose
`raw.githubusercontent.com/.../master/` URLs are what every user's Tampermonkey
actually fetches. Publishing is copying files from one to the other by hand.

Nothing checked this, and it needs checking for one specific reason.

== The failure this exists to prevent ==

A published userscript whose library `@require` points at a `file://` path
**fails silently for every user**. It does not error. ShowAllEntityData's own
bootstrap reads

    const Lib = (typeof VZ_MBLibrary !== 'undefined') ? new VZ_MBLibrary(…)
                                                      : { settings: {}, … };

so an unreachable `@require` lands on the stub, every setting quietly resolves
to its inline fallback, and nothing anywhere says a word. That is exactly the
second live scenario org/config-handling.org F4 describes, reached by
accident instead of by a broken CDN.

It is not hypothetical. This script's first run found
`CustomizableMultiSelector.user.js` published at 2.0.0 since 2026-02-02 —
nearly eight months — requiring
`file:///V:/home/vzell/git/mb-userscripts/lib/VZMBLibrary.user.js`. Note that
that script does not exist in the dev repo at all, which is why the `file://`
sweep covers EVERY `.user.js` in the mirror rather than only the ones this repo
can pair up. A check that only looked at what it knew about would have missed
the one real instance.

The hazard got sharper on 2026-09-23: ShowAllEntityData's own dev copy now
deliberately requires the working-copy library, because VZ_MBLibrary 4.1.0 and
4.2.0 changed the settings dialog and a live test against the mirror's 4.0.0
exercises none of it. So the dev repo now holds a `file://` require ON PURPOSE,
and the rewrite on the way out is a step a human has to remember. See
org/config-handling.org F6.

== What is a failure, and what is merely pending ==

These are different questions and the script keeps them apart:

  FAIL    something is wrong for users RIGHT NOW, or would be the moment the
          current mirror contents were installed — a `file://` require, a
          mirror whose changelog disagrees with its own userscript, a mirror
          script at dev parity whose library is older than the one that
          version needs.
  PENDING the mirror is simply behind. That is the normal state between
          releases and is reported, never failed — unless `--strict`, which is
          for the run straight after a publish, where "behind" means the copy
          was not finished.

== What the publish contract is, exactly ==

For a paired script the mirror copy must be BYTE-IDENTICAL to the dev copy
except for the library `@require` line, which must be rewritten to the
`raw.githubusercontent.com` URL. That is a contract a script can check, and it
means "publish" is: copy the file, rewrite one line. Anything else showing up
as a difference is a partial or stale copy.

usage:
  python3 scripts/check-publish-ready.py             # pre-publish report
  python3 scripts/check-publish-ready.py --strict    # after publishing: must be current
  python3 scripts/check-publish-ready.py --mirror /path/to/mb-userscripts
"""
import argparse
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # ShowAllEntityData/
REPO = os.path.dirname(ROOT)                                         # the dev repo
DEFAULT_MIRROR = os.path.join(os.path.dirname(REPO), 'mb-userscripts')

LIB_RELATIVE = os.path.join('lib', 'VZ_MBLibrary.user.js')
NETWORK_LIB_URL = ('https://raw.githubusercontent.com/vzell/mb-userscripts/'
                   'master/lib/VZ_MBLibrary.user.js')

VERSION_RE = re.compile(r'^// @version\s+(\S+)\s*$', re.M)
REQUIRE_RE = re.compile(r'^// @require\s+(\S+)\s*$', re.M)


def read(path):
    with open(path, encoding='utf-8') as fh:
        return fh.read()


def header_version(text):
    """The `@version` value, or None. Returns the whole token, date suffix included."""
    m = VERSION_RE.search(text)
    return m.group(1) if m else None


def version_tuple(value):
    """Comparable tuple from the part before `+`.

    Handles every shape in use here — 9.99.1138, 4.2.0, 1.0.12, 1.03.004, 1.2 —
    by splitting on dots and comparing as integers, so 1.03.004 sorts above 1.2
    the way its author intends. A non-numeric segment sorts as -1 rather than
    raising, because a version this cannot parse must not crash a pre-flight
    check.
    """
    core = (value or '').split('+', 1)[0]
    out = []
    for part in core.split('.'):
        try:
            out.append(int(part))
        except ValueError:
            out.append(-1)
    return tuple(out)


def dev_scripts():
    """Every `<dir>/<dir>.user.js` in the dev repo, as (name, absolute path)."""
    found = []
    for entry in sorted(os.listdir(REPO)):
        proj = os.path.join(REPO, entry)
        if not os.path.isdir(proj) or entry.startswith('.') or entry == 'lib':
            continue
        candidate = os.path.join(proj, f'{entry}.user.js')
        if os.path.isfile(candidate):
            found.append((f'{entry}.user.js', candidate))
    return found


def library_require_lines(text):
    """Every `@require` naming VZ_MBLibrary, in any spelling."""
    return [u for u in REQUIRE_RE.findall(text) if 'MBLibrary' in u]


def strip_library_require(text):
    """The file with its VZ_MBLibrary @require line removed.

    Used to compare a dev copy against a mirror copy: that one line is the
    single difference the publish contract permits, so removing it from both
    sides makes "everything else is identical" a plain equality test.
    """
    kept = [ln for ln in text.splitlines(keepends=True)
            if not (ln.startswith('// @require') and 'MBLibrary' in ln)]
    return ''.join(kept)


def newest_changelog_version(path):
    """The `version` of the first entry, or None when unreadable."""
    try:
        data = json.loads(read(path))
    except (OSError, ValueError):
        return None
    if isinstance(data, list) and data and isinstance(data[0], dict):
        return data[0].get('version')
    return None


def sweep_mirror_for_file_requires(mirror, fails):
    """EVERY .user.js in the mirror, paired with this repo or not.

    Deliberately not limited to known scripts: the one real instance
    (CustomizableMultiSelector) has no counterpart in the dev repo, so a
    pairwise check would have reported a clean run while a broken script sat
    published for eight months.
    """
    for name in sorted(os.listdir(mirror)):
        if not name.endswith('.user.js'):
            continue
        path = os.path.join(mirror, name)
        if not os.path.isfile(path):
            continue
        for url in REQUIRE_RE.findall(read(path)):
            if url.startswith('file://'):
                fails.append(
                    f'{name}: PUBLISHED with a file:// @require ({url}) — this '
                    f'resolves on no user\'s machine, and the consumer falls back '
                    f'to a stub with empty settings rather than reporting an error')


def check_library(mirror, fails, pending, notes):
    """The shared library itself: version parity, and what depends on it."""
    dev_path = os.path.join(REPO, LIB_RELATIVE)
    mir_path = os.path.join(mirror, LIB_RELATIVE)
    if not os.path.isfile(dev_path):
        fails.append(f'{LIB_RELATIVE}: missing from the dev repo')
        return None, None
    if not os.path.isfile(mir_path):
        fails.append(f'{LIB_RELATIVE}: missing from the mirror')
        return None, None

    dev_v = header_version(read(dev_path))
    mir_v = header_version(read(mir_path))
    if version_tuple(mir_v) < version_tuple(dev_v):
        pending.append(f'{LIB_RELATIVE}: mirror {mir_v} → dev {dev_v}')
    elif read(dev_path) != read(mir_path):
        fails.append(
            f'{LIB_RELATIVE}: same version ({dev_v}) but the contents differ — '
            f'one of the two was edited without a bump')
    else:
        notes.append(f'{LIB_RELATIVE}: published and current at {dev_v}')
    return dev_v, mir_v


def check_script(name, dev_path, mirror, dev_lib_v, mir_lib_v,
                 fails, pending, notes):
    """One paired userscript, plus its changelog and help file when present."""
    mir_path = os.path.join(mirror, name)
    if not os.path.isfile(mir_path):
        notes.append(f'{name}: not published (dev only) — skipped')
        return

    dev_text, mir_text = read(dev_path), read(mir_path)
    dev_v, mir_v = header_version(dev_text), header_version(mir_text)

    # The library @require must be the network URL in the published copy. The
    # file:// sweep already reports the fatal case; this catches the subtler
    # one — a URL that is neither file:// nor the canonical mirror path.
    mir_lib_requires = library_require_lines(mir_text)
    for url in mir_lib_requires:
        if url != NETWORK_LIB_URL and not url.startswith('file://'):
            fails.append(f'{name}: published library @require is {url}, '
                         f'expected {NETWORK_LIB_URL}')

    behind = version_tuple(mir_v) < version_tuple(dev_v)
    if behind:
        pending.append(f'{name}: mirror {mir_v} → dev {dev_v}')
    elif dev_v == mir_v:
        # At parity the contract is byte-equality apart from that one line.
        if strip_library_require(dev_text) != strip_library_require(mir_text):
            fails.append(
                f'{name}: same version ({dev_v}) but the copies differ beyond the '
                f'library @require line — a partial or stale publish')
        # A published script that USES the library is running against whatever
        # the mirror serves, which may be older than the library this repo
        # tests it with. That is ordering advice, not a defect: publish the
        # library first. It is emphatically NOT a failure — the first version
        # of this check called it one and said SpringsteenCoverArtUploader was
        # "live without the library it needs", a script that does not require
        # the library at all and had simply not changed in three months.
        if (library_require_lines(dev_text) and dev_lib_v and mir_lib_v
                and version_tuple(mir_lib_v) < version_tuple(dev_lib_v)):
            pending.append(
                f'{name}: at parity ({mir_v}) but runs against the mirror\'s '
                f'VZ_MBLibrary {mir_lib_v}, older than the {dev_lib_v} it is '
                f'tested with here — publish the library first')
        if not mir_lib_requires and library_require_lines(dev_text):
            fails.append(f'{name}: published copy has no VZ_MBLibrary @require at all')
        if not behind:
            notes.append(f'{name}: published and current at {dev_v}')
    else:
        fails.append(f'{name}: the MIRROR ({mir_v}) is AHEAD of the dev repo '
                     f'({dev_v}) — the dev repo is not the source of truth here')

    base = name[:-len('.user.js')]
    for suffix, why in ((f'{base}_CHANGELOG.json',
                         'the 📜 ChangeLog dialog fetches this from the mirror'),
                        (f'{base}_HELP.txt',
                         'the ❓ Help dialog fetches this from the mirror')):
        dev_side = os.path.join(os.path.dirname(dev_path), suffix)
        mir_side = os.path.join(mirror, suffix)
        if not os.path.isfile(dev_side) or not os.path.isfile(mir_side):
            continue
        if behind:
            continue          # will be copied with the script
        if read(dev_side) != read(mir_side):
            fails.append(f'{suffix}: differs from the dev copy while {name} is at '
                         f'parity ({dev_v}) — {why}, so it would serve the wrong '
                         f'content to a current script')

    # A mirror whose changelog disagrees with its own userscript is internally
    # inconsistent: the in-script dialog would name a version nobody is running.
    mir_changelog = os.path.join(mirror, f'{base}_CHANGELOG.json')
    if os.path.isfile(mir_changelog) and mir_v:
        # Normalise BOTH sides: these projects do not agree on whether a
        # changelog `version` carries the `+YYYY-MM-DD` suffix —
        # SpringsteenCoverArtUploader writes "1.02.003+2026-06-21",
        # ShowAllEntityData writes a bare "9.99.1138" — and comparing one
        # convention against the other reports every entry of the first kind
        # as a mismatch. It did, on the first run.
        newest = newest_changelog_version(mir_changelog)
        if newest and newest.split('+', 1)[0] != mir_v.split('+', 1)[0]:
            fails.append(
                f'{base}_CHANGELOG.json: the published changelog\'s newest entry is '
                f'{newest} but the published script is {mir_v} — the 📜 ChangeLog '
                f'dialog and the running script disagree')


def check_dev_library_require(fails, notes):
    """The dev repo's own invariant: ShowAllEntityData tests the WORKING library.

    A NOTE rather than a failure. Pointing it at the network is a legitimate
    thing to do briefly — to reproduce exactly what a user sees, say — and
    turning that into a merge-blocking error would be wrong. But doing it by
    accident makes every live check of a library change meaningless while
    looking fine, so it is always reported.
    """
    path = os.path.join(REPO, 'ShowAllEntityData', 'ShowAllEntityData.user.js')
    if not os.path.isfile(path):
        return
    urls = library_require_lines(read(path))
    if not urls:
        fails.append('ShowAllEntityData.user.js: no VZ_MBLibrary @require found')
        return
    if any(u.startswith('file://') for u in urls):
        notes.append('dev ShowAllEntityData.user.js requires the working-copy '
                     'library — live tests exercise this repo\'s VZ_MBLibrary')
    else:
        notes.append('NOTE: dev ShowAllEntityData.user.js requires the MIRROR '
                     'library — a live check of any library change tests the '
                     'published version, not this one')


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0],
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--mirror', default=DEFAULT_MIRROR,
                    help=f'publish repo (default: {DEFAULT_MIRROR})')
    ap.add_argument('--strict', action='store_true',
                    help='also fail when the mirror is behind — for the run '
                         'straight after publishing')
    args = ap.parse_args()

    mirror = os.path.abspath(args.mirror)
    if not os.path.isdir(mirror):
        print(f'error: mirror not found at {mirror} — pass --mirror', file=sys.stderr)
        return 2

    fails, pending, notes = [], [], []

    sweep_mirror_for_file_requires(mirror, fails)
    dev_lib_v, mir_lib_v = check_library(mirror, fails, pending, notes)
    check_dev_library_require(fails, notes)
    for name, dev_path in dev_scripts():
        check_script(name, dev_path, mirror, dev_lib_v, mir_lib_v,
                     fails, pending, notes)

    print(f'dev:    {REPO}')
    print(f'mirror: {mirror}\n')

    if notes:
        print('— state —')
        for n in notes:
            print(f'  {n}')
        print()
    if pending:
        print(f'— pending publish ({len(pending)}) —')
        for p in pending:
            print(f'  {p}')
        print()
    # The whole report goes to stdout so it reads in order; only the verdict
    # goes to stderr. Splitting the body across both streams interleaved the
    # BROKEN block ahead of the state it was describing.
    if fails:
        print(f'— BROKEN ({len(fails)}) —')
        for f in fails:
            print(f'  {f}')
        print()

    # stdout is block-buffered when piped while stderr is not, so without this
    # the verdict overtakes the report it is summarising.
    sys.stdout.flush()

    if fails:
        print(f'FAILED: {len(fails)} problem(s) that affect published scripts.',
              file=sys.stderr)
        return 1
    if pending and args.strict:
        print(f'FAILED (--strict): {len(pending)} item(s) still behind the dev repo.',
              file=sys.stderr)
        return 1
    if pending:
        print(f'OK — nothing published is broken; {len(pending)} item(s) awaiting '
              f'a republish.')
    else:
        print('OK — the mirror is current and nothing published is broken.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
