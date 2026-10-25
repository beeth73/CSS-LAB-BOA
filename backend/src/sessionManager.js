import Docker from "dockerode";

const docker = new Docker();
const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE || "css-lab-boa-sandbox";

// One disposable, locked-down container per student session.
// Flags here mirror docs/ARCHITECTURE.md section 1 — do not relax any
// of these without updating that doc and re-running scripts/validate_sandbox.py.
export async function createSession() {
  const container = await docker.createContainer({
    Image: SANDBOX_IMAGE,
    Tty: true,
    OpenStdin: true,
    HostConfig: {
      NetworkMode: "none",
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges"],
      Memory: 256 * 1024 * 1024,
      NanoCpus: 1_000_000_000,
      PidsLimit: 64,
      ReadonlyRootfs: true,
      Tmpfs: {
        "/home/student": "rw,exec,size=32m,mode=1777",
        "/tmp": "rw,exec,size=32m,mode=1777",
      },
    },
  });
  await container.start();
  return container;
}

// Opens an interactive bash shell inside an already-running session
// container and returns the hijacked duplex stream (real TTY behavior —
// Docker provides this natively via exec with Tty: true, so no separate
// pty library like node-pty is needed on the host side).
export async function openShell(container) {
  const exec = await container.exec({
    Cmd: ["/bin/bash"],
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    WorkingDir: "/opt/levels",
  });
  const stream = await exec.start({ hijack: true, stdin: true, Tty: true });
  return { exec, stream };
}

export async function resizeShell(exec, cols, rows) {
  try {
    await exec.resize({ h: rows, w: cols });
  } catch (_) {
    /* container may have already exited */
  }
}

export async function destroySession(container) {
  try {
    await container.kill();
  } catch (_) {
    /* already stopped */
  }
  await container.remove({ force: true });
}
