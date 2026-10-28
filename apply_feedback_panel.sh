#!/usr/bin/env bash
set -euo pipefail

INDEX="backend/public/index.html"
[ -f "$INDEX" ] || { echo "ERROR: $INDEX not found. Run this from the repo root." >&2; exit 1; }

TS="$(date +%Y%m%d%H%M%S)"
cp "$INDEX" "$INDEX.bak.$TS"
echo "Backed up: $INDEX.bak.$TS"

python3 - "$INDEX" << 'PYEOF'
import sys
path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    html = f.read()

if 'class="feedbackpanel"' in html:
    print("Feedback panel already present, skipping.")
else:
    css_anchor = "*{box-sizing:border-box;}"
    if html.count(css_anchor) != 1:
        print(f"ERROR: expected exactly one occurrence of {css_anchor!r}, found {html.count(css_anchor)}.", file=sys.stderr)
        sys.exit(1)
    css_block = (
        "  .feedbackpanel{margin-top:2rem;padding:1rem 1.2rem;border:1px solid var(--rule);"
        "border-radius:8px;background:var(--bg-raised);font-family:var(--mono);font-size:.82rem;}\n"
        "  .feedbackpanel b{color:var(--ink);font-size:.86rem;display:block;margin-bottom:.5rem;}\n"
        "  .feedbackpanel a{color:var(--accent);text-decoration:none;margin-right:1.2rem;white-space:nowrap;}\n"
        "  .feedbackpanel a:hover{text-decoration:underline;}\n"
        "  "
    )
    html = html.replace(css_anchor, css_block + css_anchor, 1)
    print("Inserted .feedbackpanel CSS rules.")

    footer_anchor = "<footer>MIT licensed \u00b7 educational use only \u00b7 Bhushan Ladgaonkar \u00b7 TE Computer Engineering, Div A \u00b7 FrCRCE</footer>"
    if html.count(footer_anchor) != 1:
        print(f"ERROR: expected exactly one occurrence of the footer line, found {html.count(footer_anchor)}. Not inserting markup.", file=sys.stderr)
        sys.exit(1)

    panel = (
        '<div class="feedbackpanel">\n'
        '  <b>Found a bug, or have feedback?</b>\n'
        '  <a href="mailto:bhushanladgaonkar@gmail.com">Email</a>\n'
        '  <a href="https://github.com/beeth73" target="_blank" rel="noopener">GitHub</a>\n'
        '  <a href="https://bhushanladgaonkar.me" target="_blank" rel="noopener">Website</a>\n'
        '</div>\n'
    )
    html = html.replace(footer_anchor, panel + footer_anchor, 1)
    print("Inserted feedback panel markup above the footer.")

with open(path, "w", encoding="utf-8") as f:
    f.write(html)

checks = {'class="feedbackpanel"': 1, 'mailto:bhushanladgaonkar@gmail.com': 1, 'github.com/beeth73': 1, 'bhushanladgaonkar.me': 1}
ok = True
for needle, expected in checks.items():
    got = html.count(needle)
    if got != expected: ok = False
    print(f"  {needle!r}: expected {expected}, found {got}  [{'OK' if got==expected else 'MISMATCH'}]")
print("All checks passed." if ok else "Some checks failed — review before trusting this.")
PYEOF
