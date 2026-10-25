import "dotenv/config";
import express from "express";
import { WebSocketServer } from "ws";
import { loadLevels } from "./levelRegistry.js";
import {
  createSession,
  openShell,
  resizeShell,
  destroySession,
} from "./sessionManager.js";

const PORT = process.env.PORT || 4000;
const app = express();

app.get("/api/levels", (_req, res) => {
  res.json(loadLevels());
});

const server = app.listen(PORT, () => {
  console.log(`CSS-LAB-BOA backend listening on :${PORT}`);
});

const wss = new WebSocketServer({ server, path: "/session" });

wss.on("connection", async (ws) => {
  let container;
  let exec;
  let stream;

  try {
    container = await createSession();
    ({ exec, stream } = await openShell(container));
    console.log(`Session started: container ${container.id.slice(0, 12)}`);
  } catch (err) {
    console.error("Failed to start session:", err);
    ws.close(1011, "sandbox failed to start");
    return;
  }

  // Sandbox -> browser
  stream.on("data", (chunk) => {
    if (ws.readyState === ws.OPEN) ws.send(chunk);
  });
  stream.on("end", () => ws.close());

  // Browser -> sandbox. A JSON message ({type:"resize",cols,rows}) controls
  // the pty size; any other message is raw keystroke/input bytes.
  ws.on("message", (data, isBinary) => {
    if (!isBinary) {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "resize") {
          resizeShell(exec, msg.cols, msg.rows);
          return;
        }
      } catch (_) {
        /* not JSON, fall through and treat as raw input */
      }
    }
    stream.write(data);
  });

  const cleanup = async () => {
    stream.end();
    if (container) {
      await destroySession(container);
      console.log(`Session destroyed: container ${container.id.slice(0, 12)}`);
    }
  };

  ws.on("close", cleanup);
  ws.on("error", cleanup);
});
