#!/bin/bash
# Validate the WIP and real changelog files parse as JSON and carry the
# expected shape. Uses python3 via a heredoc file (project convention bans
# inline `python3 -c` / `node -e`).
set -uo pipefail
cd "$(dirname "$0")/.."
python3 - <<'PY'
import json, sys, os
ok = True
for path in ("ShowAllEntityData_CHANGELOG.wip.json", "ShowAllEntityData_CHANGELOG.json"):
    if not os.path.exists(path):
        print(f"  skip (absent) {path}")
        continue
    try:
        data = json.load(open(path, encoding="utf-8"))
    except Exception as e:
        print(f"  INVALID {path}: {e}")
        ok = False
        continue
    if not isinstance(data, list) or not data:
        print(f"  BAD SHAPE {path}: expected a non-empty array")
        ok = False
        continue
    first = data[0]
    missing = [k for k in ("version", "date", "sections") if k not in first]
    if missing:
        print(f"  BAD SHAPE {path}: newest entry missing {missing}")
        ok = False
        continue
    n_items = sum(len(s.get("items", [])) for s in first["sections"])
    print(f"  OK {path}: {len(data)} entries, newest={first['version']} "
          f"({first['date']}), {len(first['sections'])} section(s), {n_items} item(s)")
sys.exit(0 if ok else 1)
PY
