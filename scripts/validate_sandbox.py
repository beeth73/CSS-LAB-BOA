"""
Sandbox isolation validation — implements docs/ARCHITECTURE.md section 4.2.
Run with: pytest scripts/validate_sandbox.py -v
Requires: docker compose build sandbox-image   (run first)

NOTE: we manage container create/start/wait/logs/remove explicitly rather
than relying on docker-py's containers.run() convenience wrapper. That
wrapper only auto-streams logs for the json-file/journald logging drivers;
Docker Desktop commonly defaults to the 'local' driver, under which run()
silently returns None for any zero-exit container. Explicit lifecycle
management works regardless of logging driver.
"""
import docker
import pytest

client = docker.from_env()
IMAGE = "css-lab-boa-sandbox"

SANDBOX_KWARGS = dict(
    network_mode="none",
    cap_drop=["ALL"],
    security_opt=["no-new-privileges"],
    mem_limit="256m",
    nano_cpus=1_000_000_000,
    pids_limit=64,
    read_only=True,
    tmpfs={
        # Docker only special-cases /tmp as 1777 by default; any other
        # tmpfs mountpoint defaults to 0755 root-owned, which blocks the
        # non-root 'student' user. Set mode explicitly on both so behavior
        # doesn't depend on an undocumented Docker default.
        "/home/student": "rw,exec,size=32m,mode=1777",
        "/tmp": "rw,exec,size=32m,mode=1777",
    },
)


def run(cmd, timeout=30):
    """Run a command in a fresh sandbox container.
    Returns (exit_code, combined_stdout_stderr_bytes)."""
    container = client.containers.run(IMAGE, cmd, detach=True, **SANDBOX_KWARGS)
    try:
        result = container.wait(timeout=timeout)
        exit_code = result.get("StatusCode", -1)
        logs = container.logs(stdout=True, stderr=True)
        return exit_code, logs
    finally:
        container.remove(force=True)


def test_no_network_access():
    exit_code, logs = run(["bash", "-c", "curl -m 3 https://example.com"])
    assert exit_code != 0


def test_pids_limit_enforced():
    # Verify the cgroup pids controller actually has our limit applied,
    # rather than racing a fork bomb against an exit-code assertion.
    exit_code, logs = run([
        "bash", "-c",
        "cat /sys/fs/cgroup/pids.max 2>/dev/null || cat /sys/fs/cgroup/pids/pids.max"
    ])
    assert exit_code == 0
    assert b"64" in logs


def test_readonly_root_filesystem():
    exit_code, logs = run(["bash", "-c", "touch /etc/should-fail"])
    assert exit_code != 0


def test_tmp_and_home_are_writable_and_executable():
    exit_code, logs = run(
        ["bash", "-c", "touch /tmp/ok && touch /home/student/ok && echo WRITABLE"]
    )
    assert exit_code == 0
    assert b"WRITABLE" in logs


def test_level_01_normal_input_no_crash():
    cmd = (
        "cd /opt/levels/01-gets && "
        "gcc -g -fsanitize=address -fno-stack-protector -o /tmp/vuln vuln.c && "
        "echo Bhushan | /tmp/vuln"
    )
    exit_code, logs = run(["bash", "-c", cmd])
    assert exit_code == 0
    assert b"Hello, Bhushan!" in logs
    assert b"AddressSanitizer" not in logs


def test_level_01_vuln_compiles_and_trips_asan():
    cmd = (
        "cd /opt/levels/01-gets && "
        "gcc -g -fsanitize=address -fno-stack-protector -o /tmp/vuln vuln.c && "
        "python3 -c \"print('A'*40)\" | /tmp/vuln"
    )
    exit_code, logs = run(["bash", "-c", cmd])
    assert exit_code != 0  # ASan aborts the process (SIGABRT)
    assert b"AddressSanitizer" in logs
    assert b"stack-buffer-overflow" in logs
