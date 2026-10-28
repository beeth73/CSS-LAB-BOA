import crypto from "crypto";

// One regex per level that must appear in recent terminal output before a
// flag is minted for that level. Matched against a rolling buffer, not the
// whole session history — so a `clear` or re-run doesn't un-solve a level.
const WIN_PATTERNS = {
  "01-gets":            /AddressSanitizer: stack-buffer-overflow/,
  "02-strcpy":          /AddressSanitizer: stack-buffer-overflow/,
  "03-strcat":          /AddressSanitizer: stack-buffer-overflow/,
  "04-sprintf":         /AddressSanitizer: stack-buffer-overflow/,
  "05-memcpy":          /FLAG: access_granted flipped/,
  "06-array-indexing":  /AddressSanitizer: stack-buffer-(overflow|underflow)/,
  "07-bonus-redirect":  /secret_win\(\) reached -- control flow redirected/,
  // printed text from levels/07-bonus-redirect/vuln.c first.
};

const FLAG_SECRET = process.env.FLAG_SECRET || "dev-only-change-me";

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "");
}

export function makeFlagMinter() {
  const solved = new Set();
  let buffer = "";

  return {
    // Call on every chunk of raw terminal output. Returns {levelId, flag}
    // the moment that level's pattern first appears, else null.
    feed(chunk, sessionId, currentLevelId) {
      if (!currentLevelId || solved.has(currentLevelId)) return null;
      const pattern = WIN_PATTERNS[currentLevelId];
      if (!pattern) return null;

      buffer = stripAnsi(buffer + chunk.toString("utf8")).slice(-4000);
      if (!pattern.test(buffer)) return null;

      solved.add(currentLevelId);
      const hmac = crypto
        .createHmac("sha256", FLAG_SECRET)
        .update(`${sessionId}:${currentLevelId}`)
        .digest("hex")
        .slice(0, 12);
      return { levelId: currentLevelId, flag: `LABBOA{${currentLevelId}}_${hmac}` };
    },
  };
}