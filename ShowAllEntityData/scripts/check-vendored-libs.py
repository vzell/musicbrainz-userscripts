"""Compare the harness's node_modules copies of iro and pako with what users get.

The Playwright harness loads the userscript's two third-party `@require`s from
node_modules (exact-pinned devDependencies, see tests/support/loadPage.js), not
from their CDNs, so a fixture run needs no network. Users, though, get whatever
the `@require` URL serves, and `@jaames/iro@5` floats within major version 5. This
script fetches each `@require` URL named in the userscript header and compares
its sha256 with the node_modules file the harness injects instead.

Read-only; needs network, so it is run by hand (before a release, or after a
jsdelivr/cdnjs change is suspected), never as a test. The network-free half
of the check (versions agree with the header) is
tests/fixtures/harness-required-libs.spec.js.

usage:
  python3 scripts/check-vendored-libs.py

Exit status: 0 when both match byte for byte, 1 on a mismatch, 2 when a
download fails or the header no longer names one of the two libraries.
"""
import hashlib
import os
import re
import sys
import urllib.request

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
USERSCRIPT = os.path.join(PROJECT_ROOT, 'ShowAllEntityData.user.js')

# library -> (pattern for its @require URL, node_modules file the harness injects)
LIBS = {
    'iro': (re.compile(r'/@jaames/iro@'), os.path.join('node_modules', '@jaames', 'iro', 'dist', 'iro.min.js')),
    'pako': (re.compile(r'/pako/[\d.]+/pako\.min\.js$'), os.path.join('node_modules', 'pako', 'dist', 'pako.min.js')),
}


def require_urls():
    """Return the `// @require` URLs of the userscript header, in order."""
    with open(USERSCRIPT, encoding='utf-8') as f:
        header = f.read().split('// ==/UserScript==')[0]
    return re.findall(r'^// @require\s+(\S+)', header, re.M)


def sha256(data):
    """Hex sha256 of a bytes object."""
    return hashlib.sha256(data).hexdigest()


def main():
    """Fetch, hash and compare; print one line per library."""
    urls = require_urls()
    status = 0
    for name, (pattern, rel_path) in LIBS.items():
        url = next((u for u in urls if pattern.search(u)), None)
        if not url:
            print(f'{name}: no @require line matches {pattern.pattern} — update this script')
            status = max(status, 2)
            continue
        with open(os.path.join(PROJECT_ROOT, rel_path), 'rb') as f:
            local = sha256(f.read())
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'check-vendored-libs'})
            with urllib.request.urlopen(req, timeout=30) as resp:
                remote = sha256(resp.read())
                served = resp.headers.get('x-jsd-version') or ''
        except OSError as e:
            print(f'{name}: could not fetch {url}: {e}')
            status = max(status, 2)
            continue
        same = local == remote
        version = f' (jsdelivr serves {served})' if served else ''
        print(f'{name}: {"MATCH" if same else "DIFFERS"}  {url}{version}\n'
              f'    node_modules {local}\n    @require     {remote}')
        if not same:
            status = max(status, 1)
    if status == 1:
        print('\nThe harness tests a different build than users get: bump the devDependency '
              '(npm install --save-dev --save-exact <pkg>@<version>) and re-run the suite.')
    sys.exit(status)


if __name__ == '__main__':
    main()
