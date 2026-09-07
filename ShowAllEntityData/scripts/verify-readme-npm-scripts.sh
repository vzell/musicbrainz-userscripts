#!/bin/bash
# Verify every `npm run <x>` / `npm test` named in tests/README.org exists
# verbatim in package.json, and report package.json scripts the README does
# not mention. Guards against the README documenting a script that was
# renamed or removed, and against a new script going undocumented.
set -uo pipefail
cd "$(dirname "$0")/.."

# The scripts block only — stop at the closing brace so devDependencies etc.
# cannot leak in.
pkg_scripts=$(sed -n '/^    "scripts": {/,/^    },$/p' package.json \
              | grep -oE '^        "[^"]+"' | tr -d '" ')

fail=0
echo "--- README -> package.json ---"
for s in $(grep -oE 'npm run [a-zA-Z:_-]+' tests/README.org | sed 's/npm run //' | sort -u); do
    if printf '%s\n' "$pkg_scripts" | grep -qx "$s"; then
        printf '  OK      %s\n' "$s"
    else
        printf '  MISSING %s\n' "$s"; fail=1
    fi
done
if printf '%s\n' "$pkg_scripts" | grep -qx test; then
    printf '  OK      test (as "npm test")\n'
else
    printf '  MISSING test\n'; fail=1
fi

echo "--- package.json -> README (informational) ---"
for s in $pkg_scripts; do
    [ "$s" = "test" ] && continue
    grep -qE "npm run $s([^a-zA-Z:_-]|\$)" tests/README.org \
        || printf '  undocumented: %s\n' "$s"
done

exit $fail
