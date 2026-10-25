# Architecture, Deliverables & Validation Plan

**Project:** CSS-LAB-BOA — Buffer Overflow Attack Virtual Lab
**Author:** Bhushan Ladgaonkar | Roll No. 10611 | TE Computer Engineering, Div A
**College:** Fr. Conceicao Rodrigues College of Engineering, Bandra (W), Mumbai

This document is the single source of truth for scope, architecture, phase
breakdown, and validation. If a session is interrupted, resume from the
"Current Status" checklist at the bottom.

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser (Frontend)                   │
│  React + Vite + TypeScript                                   │
│  ┌───────────────┐ ┌────────────────┐ ┌────────────────────┐ │
│  │ Level sidebar  │ │ xterm.js        │ │ WASM stack         │ │
│  │ (7 levels)     │ │ live terminal   │ │ visualizer          │ │
│  └───────────────┘ └────────┬───────┘ └────────────────────┘ │
│                              │ websocket (pty stream)         │
└──────────────────────────────┼────────────────────────────────┘
                                │
┌──────────────────────────────┼────────────────────────────────┐
│                     Backend (Node.js + Express)                │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Session manager: 1 Docker container per student session│    │
│  │ - spawns container, attaches pty, streams I/O over ws  │    │
│  │ - enforces per-exec timeout + idle session reaper       │    │
│  └────────────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Level registry: metadata, hints, win-condition checker   │    │
│  └────────────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Activity logger (per session, exportable)                │    │
│  └────────────────────────────────────────────────────────┘    │
└──────────────────────────────┬────────────────────────────────┘
                                │ Docker Engine API / CLI
┌──────────────────────────────┼────────────────────────────────┐
│           Sandboxed container (per session, disposable)        │
│  --network none --cap-drop=ALL --security-opt no-new-privileges│
│  --memory=256m --cpus=1 --pids-limit=64 --read-only + tmpfs     │
│  non-root user, custom seccomp profile, ulimit -c 0             │
│                                                                  │
│  /levels/01-gets/{vuln.c, secure.c}                              │
│  /levels/02-strcpy/{vuln.c, secure.c}                            │
│  ...                                                             │
│  /levels/07-bonus-redirect/{vuln.c, secure.c}                   │
│  gcc, gdb pre-installed                                          │
└──────────────────────────────────────────────────────────────┘
```

## 2. Components

| Component | Responsibility |
|---|---|
| `levels/` | One vulnerable + one secure C source per demo, each self-contained and independently compilable |
| `backend/` | Session lifecycle, Docker orchestration, pty bridging, win-condition detection, logging |
| `frontend/` | Level navigation, live terminal, side-by-side vulnerable/secure code view, WASM visualizer, quiz, docs viewer |
| `docs/` | theory.md (done), procedure.md, viva.md, references.md, this file |
| Root | README, LICENSE, Dockerfile(s), docker-compose.yml |

## 3. Phase Breakdown & Deliverables

### Phase 0 — Repo Scaffold ✅ DONE
- Directory structure, `.gitignore`, README, MIT LICENSE, author attribution

### Phase 1 — Documentation Foundation ◻ IN PROGRESS
- [x] `docs/theory.md`
- [ ] `docs/procedure.md` — step-by-step run instructions + expected output per level
- [ ] `docs/viva.md` — 12–15 Q&A matching the theory
- [ ] `docs/references.md` — CWE-120/121/122, OWASP, ASan docs, Mumbai Univ lab sheet mapping

### Phase 2 — Level Sources (the actual vulnerable/secure C pairs)
Deliverable per level: `vuln.c`, `secure.c`, a `expected_output.txt`, each
compiling cleanly with the flags specified in `theory.md` §6.
- [ ] 01-gets
- [ ] 02-strcpy
- [ ] 03-strcat
- [ ] 04-sprintf
- [ ] 05-memcpy (includes the `access_granted` flag-flip win condition)
- [ ] 06-array-indexing (ASan-focused)
- [ ] 07-bonus-redirect (return-address overwrite to `secret_win()`)

### Phase 3 — Sandbox & Backend
- [ ] `Dockerfile` for the sandbox image (gcc, gdb, non-root user, levels baked in)
- [ ] Session manager: spawn/destroy container, enforce resource flags listed in Architecture §1
- [ ] pty bridge over websocket (`node-pty` + `ws`)
- [ ] Exec timeout + idle-session reaper
- [ ] Win-condition checker per level (pattern-match expected output/flag)
- [ ] Activity logger (JSON, exportable as CSV)

### Phase 4 — Frontend Core
- [ ] React app shell + routing (Overview, Theory, Levels, Compare, Activity Log, Assessment, References)
- [ ] xterm.js terminal component wired to backend websocket
- [ ] Level sidebar with status (locked/attempted/solved) and hint ladder

### Phase 5 — WASM Stack Visualizer
- [ ] Deterministic client-side simulation of a buffer + adjacent return
      address, animating byte-by-byte overwrite as the student types a
      payload (no real execution — purely illustrative)
- [ ] Sync visualizer state to the active level's buffer size / offset

### Phase 6 — Assessment & Polish
- [ ] 12-question scored quiz (stack layout, canaries, ASLR, NX, PIE, ASan)
- [ ] Vulnerable-vs-secure side-by-side code view per level
- [ ] README finalization, screenshots, architecture diagram export

### Phase 7 — Formal Lab Report (separate deliverable, Word/PDF)
- [ ] Aim / Objective / CO mapping (from lab sheet)
- [ ] Theory (adapted from `docs/theory.md`)
- [ ] Procedure + expected output per level (from `docs/procedure.md`)
- [ ] Vulnerable + fixed code listings
- [ ] Conclusion
- [ ] Viva Q&A (from `docs/viva.md`)

## 4. Testing & Validation Plan

### 4.1 Per-level functional tests
For each of the 7 levels, verify:
1. `vuln.c` compiles with the level's specified flags, no errors
2. Running `vuln` with a crafted oversized input reproduces the intended
   failure (crash / ASan report / flag print / redirected execution)
3. Running `vuln` with a *normal*, in-bounds input behaves correctly (no
   false positive — the bug must be input-triggered, not always-broken)
4. `secure.c` compiles cleanly and, given the *same* oversized input that
   broke `vuln`, handles it gracefully (truncates/rejects, no corruption)
5. Expected output matches what's recorded in `levels/<n>/expected_output.txt`

### 4.2 Sandbox isolation tests
1. From inside a running session container, confirm no network reachability
   (`--network none` holds — e.g. attempted outbound connection fails immediately)
2. Confirm resource limits are enforced: a deliberate fork bomb or
   memory-exhaustion test is capped and does not affect the host
3. Confirm the container filesystem is read-only outside the tmpfs scratch dir
4. Confirm the exec timeout actually kills a hung process and the session recovers
5. Confirm session teardown removes the container (no orphaned containers
   accumulating after disconnects)

### 4.3 Backend/frontend integration tests
1. Terminal I/O round-trips correctly over the websocket (typed input
   appears in the pty, pty output renders in xterm.js) with no byte loss
2. Win-condition checker correctly flags success/failure per level
3. Activity log captures every run with correct timestamps and level IDs
4. Quiz scoring and pass/fail threshold (70%) computed correctly

### 4.4 Acceptance criteria (definition of done for the "min required" scope)
- All 6 lab-sheet-required levels (gets, strcpy, strcat, sprintf, memcpy,
  array indexing) run end-to-end in the browser terminal inside the sandbox
- Each has a working secure counterpart
- `docs/theory.md`, `docs/procedure.md`, `docs/viva.md` complete
- Formal report assembled from the above
- Bonus level (07) and WASM visualizer are explicitly "if time permits" —
  the project is submittable without them

## 5. Current Status (update this section as you go)

- [x] Phase 0 complete
- [ ] Phase 1: theory.md done; procedure.md, viva.md, references.md pending
- [ ] Phase 2 not started
- [ ] Phase 3 not started
- [ ] Phase 4 not started
- [ ] Phase 5 (bonus) not started
- [ ] Phase 6 not started
- [ ] Phase 7 not started

**Next action:** draft `docs/procedure.md`, then begin Phase 2 with `levels/01-gets`.

**Update:** Phase 3's core loop is now proven end-to-end — a browser
(xterm.js test client, `backend/test-client/`) connects over websocket to
the Node backend, which spawns a locked-down session container and opens
a live `docker exec` shell into it (no `node-pty` needed; Docker's own
`Tty: true` exec gives a real hijacked duplex stream). Verified by running
level 01's vulnerable/secure pair through that live connection and
confirming the same ASan output seen in manual testing.

**Next action:** batch out levels 02–07 using the 01-gets pattern, now
that the full pipeline (browser → backend → sandbox) is confirmed working
rather than assumed.
