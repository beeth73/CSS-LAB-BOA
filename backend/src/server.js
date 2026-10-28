import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import { loadLevels } from "./levelRegistry.js";
import {
  createSession,
  openShell,
  resizeShell,
  destroySession,
} from "./sessionManager.js";
import crypto from "crypto";
import { makeFlagMinter } from "./flagEngine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const MAX_CONCURRENT_SESSIONS = parseInt(process.env.MAX_SESSIONS || "10", 10);
const IDLE_TIMEOUT_MS = parseInt(process.env.SESSION_IDLE_TIMEOUT_MS || "900000", 10);

const app = express();
app.use(express.static(path.join(__dirname, "../public")));
app.get("/api/levels", (_req, res) => res.json(loadLevels()));

const server = app.listen(PORT, () => {
  console.log(`CSS-LAB-BOA backend listening on :${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});

const wss = new WebSocketServer({ server, path: "/session" });

// Track every live session so we can cap concurrency and clean up on exit.
const activeSessions = new Map(); // ws -> { container, idleTimer }

function resetIdleTimer(ws) {
  const entry = activeSessions.get(ws);
  if (!entry) return;
  clearTimeout(entry.idleTimer);
  entry.idleTimer = setTimeout(() => {
    console.log("Session idle timeout, closing:", entry.container.id.slice(0, 12));
    ws.close(1000, "idle timeout");
  }, IDLE_TIMEOUT_MS);
}

wss.on("connection", async (ws) => {
  if (activeSessions.size >= MAX_CONCURRENT_SESSIONS) {
    ws.close(1013, "too many active sessions, try again shortly");
    return;
  }

  let container, exec, stream;
  try {
    container = await createSession();
    ({ exec, stream } = await openShell(container));
    console.log(`Session started: container ${container.id.slice(0, 12)} (${activeSessions.size + 1}/${MAX_CONCURRENT_SESSIONS})`);
  } catch (err) {
    console.error("Failed to start session:", err);
    ws.close(1011, "sandbox failed to start");
    return;
  }

  activeSessions.set(ws, { container, idleTimer: null });
  resetIdleTimer(ws);

  const sessionId = crypto.randomUUID();
  const flagMinter = makeFlagMinter();
  let currentLevelId = null;

  stream.on("data", (chunk) => {
    if (ws.readyState === ws.OPEN) ws.send(chunk);
    const win = flagMinter.feed(chunk, sessionId, currentLevelId);
    if (win) ws.send(JSON.stringify({ type: "flag", ...win }));
  });
  stream.on("end", () => ws.close());

  ws.on("message", (data, isBinary) => {
    resetIdleTimer(ws);
    // Guard against pathologically large single messages.
    if (data.length > 64 * 1024) return;
    if (!isBinary) {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "resize") { resizeShell(exec, msg.cols, msg.rows); return; }
        if (msg.type === "setLevel") { currentLevelId = msg.levelId; return; }
      } catch (_) {}
    }
    stream.write(data);
  });

  const cleanup = async () => {
    const entry = activeSessions.get(ws);
    if (entry) {
      clearTimeout(entry.idleTimer);
      activeSessions.delete(ws);
    }
    stream.end();
    if (container) {
      await destroySession(container);
      console.log(`Session destroyed: container ${container.id.slice(0, 12)} (${activeSessions.size}/${MAX_CONCURRENT_SESSIONS})`);
    }
  };
  ws.on("close", cleanup);
  ws.on("error", cleanup);
});

// Graceful shutdown: destroy every live sandbox container before exiting,
// so Ctrl+C or a process manager restart never leaves orphans behind.
async function shutdown(signal) {
  console.log(`\n${signal} received, destroying ${activeSessions.size} active session(s)...`);
  const destroys = [...activeSessions.values()].map(({ container }) => destroySession(container));
  await Promise.allSettled(destroys);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000); // hard exit if close() hangs
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

app.use("/docs", express.static(path.join(__dirname, "../../docs")));
