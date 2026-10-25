import "dotenv/config";
import express from "express";
import { WebSocketServer } from "ws";
import { loadLevels } from "./levelRegistry.js";
import { createSession, destroySession } from "./sessionManager.js";

const PORT = process.env.PORT || 4000;
const app = express();

app.get("/api/levels", (_req, res) => {
  res.json(loadLevels());
});

const server = app.listen(PORT, () => {
  console.log(`CSS-LAB-BOA backend listening on :${PORT}`);
});

// Websocket upgrade: one session container per connected student.
// pty bridging (docker exec + node-pty) to be wired in next.
const wss = new WebSocketServer({ server, path: "/session" });

wss.on("connection", async (ws) => {
  const container = await createSession();
  ws.on("close", () => destroySession(container));
  // TODO: attach docker exec pty for gcc/gdb interaction, stream to ws
});
