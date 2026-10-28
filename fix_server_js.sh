#!/usr/bin/env bash
set -euo pipefail

SERVER="backend/src/server.js"
[ -f "$SERVER" ] || { echo "ERROR: $SERVER not found. Run from repo root." >&2; exit 1; }

TS="$(date +%Y%m%d%H%M%S)"
cp "$SERVER" "$SERVER.bak.$TS"
echo "Backed up: $SERVER.bak.$TS"

python3 - "$SERVER" << 'PYEOF'
import sys
path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    src = f.read()

def must_count(text, needle, n):
    got = text.count(needle)
    if got != n:
        print(f"ERROR: expected {n} occurrence(s) of {needle!r}, found {got}. Aborting, nothing written.", file=sys.stderr)
        sys.exit(1)

# 1. Strip the broken tail block (everything from the stray "import crypto"
#    line to end of file), but keep the /docs static route above it.
tail_marker = 'import crypto from "crypto";\nimport { makeFlagMinter } from "./flagEngine.js";'
must_count(src, tail_marker, 1)
cut_at = src.index(tail_marker)
src = src[:cut_at].rstrip() + "\n"
print("Removed the broken appended tail block.")

# 2. Add the real imports at the top, after the sessionManager.js import.
import_anchor = '} from "./sessionManager.js";\n'
must_count(src, import_anchor, 1)
src = src.replace(
    import_anchor,
    import_anchor + 'import crypto from "crypto";\nimport { makeFlagMinter } from "./flagEngine.js";\n',
    1,
)
print("Added crypto + flagEngine imports at the top.")

# 3. Mint a session id / flag minter right after the session is registered.
session_anchor = "  activeSessions.set(ws, { container, idleTimer: null });\n  resetIdleTimer(ws);\n"
must_count(src, session_anchor, 1)
src = src.replace(
    session_anchor,
    session_anchor
    + "\n  const sessionId = crypto.randomUUID();\n"
    + "  const flagMinter = makeFlagMinter();\n"
    + "  let currentLevelId = null;\n",
    1,
)
print("Added sessionId / flagMinter / currentLevelId inside the connection handler.")

# 4. Replace the original single-line stream.on("data", ...) with the
#    flag-emitting version, in its original (correct) location.
data_anchor = '  stream.on("data", (chunk) => { if (ws.readyState === ws.OPEN) ws.send(chunk); });\n'
must_count(src, data_anchor, 1)
new_data_handler = (
    '  stream.on("data", (chunk) => {\n'
    '    if (ws.readyState === ws.OPEN) ws.send(chunk);\n'
    '    const win = flagMinter.feed(chunk, sessionId, currentLevelId);\n'
    '    if (win) ws.send(JSON.stringify({ type: "flag", ...win }));\n'
    '  });\n'
)
src = src.replace(data_anchor, new_data_handler, 1)
print("Wired flag emission into stream.on('data', ...).")

# 5. Add the setLevel branch next to the existing resize branch.
resize_anchor = '        if (msg.type === "resize") { resizeShell(exec, msg.cols, msg.rows); return; }\n'
must_count(src, resize_anchor, 1)
src = src.replace(
    resize_anchor,
    resize_anchor + '        if (msg.type === "setLevel") { currentLevelId = msg.levelId; return; }\n',
    1,
)
print("Added the setLevel branch to ws.on('message', ...).")

with open(path, "w", encoding="utf-8") as f:
    f.write(src)

checks = {
    'const sessionId = crypto.randomUUID();': 1,
    'const flagMinter = makeFlagMinter();': 1,
    'flagMinter.feed(chunk, sessionId, currentLevelId)': 1,
    'msg.type === "setLevel"': 1,
    'import crypto from "crypto";': 1,
}
ok = True
for needle, expected in checks.items():
    got = src.count(needle)
    if got != expected: ok = False
    print(f"  {needle!r}: expected {expected}, found {got}  [{'OK' if got==expected else 'MISMATCH'}]")
print("All checks passed." if ok else "Some checks failed — do not trust this file yet.")
PYEOF
