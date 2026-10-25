import Docker from "dockerode";

const docker = new Docker();
const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE || "css-lab-boa-sandbox";

// One disposable, locked-down container per student session.
// Flags here mirror docs/ARCHITECTURE.md section 1 — do not relax any
// of these without updating that doc and re-running scripts/validate_sandbox.py.
//
// Mount notes:
// - /tmp needs its own tmpfs: gcc writes intermediate build artifacts there.
// - Docker only special-cases /tmp as mode 1777 by default; any other
//   tmpfs mountpoint (e.g. /home/student) defaults to 0755 root-owned,
//   which blocks the non-root 'student' user. Set mode explicitly on both.
// - tmpfs mounts default to noexec,nosuid; "exec" is required so compiled
//   binaries can actually run, not just be written.
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

export async function destroySession(container) {
  try {
    await container.kill();
  } catch (_) {
    /* already stopped */
  }
  await container.remove({ force: true });
}
