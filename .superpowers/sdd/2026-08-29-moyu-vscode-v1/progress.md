# SDD ledger — plan: docs/superpowers/plans/2026-08-29-moyu-vscode-v1.md

Starting commit: a8dc4ecda15ce391ae8bf87e248023cb8388071d
Branch: feature/moyu-v1-implementation
Worktree: D:\Moyu\Moyu-VSCode\.worktrees\moyu-v1-implementation
Status: preflight complete; Task 1 next

## Preflight internal consistency

| Task | Tests vs implementation/files | Result |
|---:|---|---|
| 1 | Manifest/build tests map to skeleton, configs, bundles, and scripts | Ruling R1 |
| 2 | Protocol guards and size tests map to shared protocol modules | Consistent |
| 3 | Lease/concurrency/crash tests map to lock, transaction, recovery, file ops | Consistent |
| 4 | Merge/migration tests map to four repositories and envelopes | Consistent |
| 5 | CSP/router/client tests map to Host HTML and Webview shell | Consistent |
| 6 | Panel lifecycle tests map to contributions, commands, registry, serializer | Ruling R2 |
| 7 | State-machine/service tests map to serialized Boss transitions | Consistent |
| 8 | Rule-table tests map to pure 2048 modules and injected dependencies | Consistent |
| 9 | Session/conflict tests map to service, repository, and protocol | Consistent |
| 10 | DOM/keyboard tests map to accessible 2048 Webview | Consistent |
| 11 | URI/removal tests map to UUID identity, tombstones, relocation | Consistent |
| 12 | Encoding tests map to strict UTF/BOM/candidate confirmation | Consistent |
| 13 | Boundary/reuse tests map to streaming index and cache manifest | Ruling R3 |
| 14 | Bounded-read/progress tests map to logical locators and reader service | Consistent |
| 15 | Safe-text/anchor tests map to continuous reader Webview | Consistent |
| 16 | Limit/hostile-input tests map to bounded ZIP/XML/HTML boundary | Consistent |
| 17 | Spine/cache/progress tests map to safe EPUB reader | Consistent |
| 18 | Wording/cancellation tests map to bookshelf UI and Host picker | Consistent |
| 19 | Range/theme tests map to settings service and CSS | Consistent |
| 20 | Overlay/restoration tests map to lifecycle, title, context, keybinding | Consistent |
| 21 | Redaction/refresh tests map to error UX and in-host sessions | Consistent |
| 22 | Lifecycle/minimum-runtime tests map to isolated extension harness | Ruling R4 |
| 23 | Docs/package tests map to allowlisted VSIX and final regression | Ruling R5 |

## Preflight shared-file and interface matrix

| Producer → consumer | Shared file/interface | Finding |
|---|---|---|
| 1 → 2–23 | toolchain, scripts, TS/esbuild targets | Compatible after R1 |
| 1 → 6,20,22,23 | `package.json`, activation, extension scripts | Compatible after R2/R4/R5 |
| 2 → 5,9,11,12,14,17,19,21 | protocol unions, guards, `Result`, 1 MiB limit | Consumers extend the closed union without weakening guards |
| 3 → 4 | `transactJson`, recovery, lease lock | Repository mutations must remain short and locked |
| 3 → 22 | child-process contention and crash hooks | Test-only fault injection must not weaken production paths |
| 4 → 9,11,14,17,19,21 | repositories, envelopes, migrations | Module-specific merge rules remain authoritative |
| 5 → 6,10,15,18,20,21 | panel controller, router, app, message client | One shell; dynamic untrusted text never uses `innerHTML` |
| 6 → 7,18,20,22 | commands, context keys, panel lifecycle | Boss command independently checks live visibility |
| 7 → 20 | Boss state machine/service | Task 20 adds DOM adapter, not another state machine |
| 8 → 9,10 | immutable engine/state/events | Host service owns persistence; Webview owns presentation only |
| 9 → 10,20,22 | game protocol/session identity | Old sessions cannot overwrite active board; best score uses max |
| 11 → 12–18 | `BookMetadata`, identity, bookshelf repository | UUID survives relocation; source files never deleted |
| 12 → 13,18 | confirmed encoding and preview flow | No GB candidate becomes metadata before user confirmation |
| 13 → 14 | byte-range index manifest | Compatible after R3 |
| 14 → 15,17,20 | logical locators/progress | Pixel offsets remain session-only |
| 15 → 20 | reader pause/focus/scroll contracts | Underlying controller remains mounted in Boss Mode |
| 16 → 17 | bounded ZIP/XML/sanitizer and limits | EPUB reader may consume only sanitized structures |
| 17 → 18 | chapter/open/progress protocol | Bookshelf opens reader through typed Host request |
| 18 → 22 | file-picker/import integration | Test fixtures stay isolated and source deletion remains forbidden |
| 19 → 20 | `bossTemplate` and theme/settings | Selected static template is deterministic |
| 20 → 22 | Boss integration/keybinding | `ctrl+m` gated by open and visible context plus live check |
| 21 → 22 | refresh points and safe errors | No claim of cross-process realtime event delivery |
| 22 → 23 | current/minimum extension lanes | Both lanes gate packaging and engine claim |

## Preflight rulings

Ruling R1: The plan's `type: module` conflicts with the safest VS Code 1.96 Extension Host compatibility path. Use an esbuild CommonJS Extension Host bundle at `dist/extension.js` with no package-level ESM declaration; keep `esbuild.mjs` as the build script. Reason: the Design's minimum-runtime requirement outranks the plan example. If wrong, the cost is a small manifest/build-format adjustment, while choosing ESM risks activation failure at the supported floor.

Ruling R2: Task 1 must create a minimal functional `test:extension` runner/script contract so Task 6 can execute its smoke test; Task 22 expands it into current and minimum lanes. Reason: Task 6 consumes the script before Task 22. If wrong, only test-harness files move between commits; product behavior is unchanged.

Ruling R3: TXT index byte ranges will be derived from encoded-byte scanning/decoder boundary accounting, not by assigning a whole chunk's absolute byte offset to decoded paragraphs. Reason: UTF-8, UTF-16, and GB18030 are variable/boundary-sensitive and the Design requires stable byte offsets. If wrong, index implementation needs localized replacement; accepting the plan pseudocode literally risks corrupt range reads.

Ruling R4: `test:extension:current` uses the maintained test runner's stable/current download for automation, while daily F5 validates the actually installed development VS Code. `test:extension:min` pins exactly 1.96.0. Reason: the API runner does not infer the user's installed binary as a reliable automated lane. If wrong, only runner selection changes.

Ruling R5: Avoid npm lifecycle recursion: `package` orchestrates a separately named release-verification script and a separately named VSIX creation script; it never invokes itself. Reason: the Plan requires a gate, not recursive npm hooks. If wrong, only script naming changes.

Ruling R6: The machine exposes Node 26.4.0/npm 11.17.0 and no detected nvm/fnm or Node 22 installation. Do not modify the system or globally install tooling. Implement with the available newer development runtime while retaining the declared Node 22 contributor boundary and Node 20.18 production target; record warnings and do not count Node 22-specific verification as performed until an actual Node 22 run is available. Reason: environment mismatch is not a permitted stop condition and production compatibility is independently type/bundle/minimum-VS-Code gated. If wrong, a clean Node 22 `npm ci` and regression run may reveal tool-only issues requiring follow-up.

Ruling R7: Replace the nonexistent `@types/node@20.18.0` plan pin with exact `@types/node@20.17.30`. The official npm registry returns E404 for 20.18.0 and confirms 20.17.30 exists under MIT; choosing the nearest lower Node 20 typings is conservative against exposing APIs newer than the VS Code 1.96 Node 20.18 runtime. Keep esbuild target `node20.18` unchanged. If wrong, typings may omit a runtime API available in Node 20.18, causing a compile-time inconvenience rather than a production compatibility failure.

Task 1: in progress
Base: a8dc4ecda15ce391ae8bf87e248023cb8388071d
Implementer: /root/task_1

Task 1: complete
Commit: fed790b chore: add reproducible extension skeleton; 5111f75 chore: ignore local portable toolchains
Tests: Node 22.23.2 portable, SHA-256 verified; `npm ci`; 4/4 skeleton tests; full tests; build; lint; format; both TypeScript projects; extension-entry contract all PASS.
Review: initial Important finding for Node 22 evidence fixed in round 1; scoped re-review Approved with no remaining findings.
Rulings: R1, R2, R6, R7 applied. Vite 7.1.12 override and transitive npm audit findings retained for later dependency/security review; no auto-upgrade.
Next: Task 2

Task 2: complete
Commit: d817017 feat: define validated Webview message protocol; 20652ab fix: harden protocol session and outbound guards; 5ed26bf fix: require session for request dispatch
Tests: RED captured; 29/29 focused protocol and 33/33 full tests PASS; lint, dual target type checks, build PASS under portable Node 22.
Review: three Important findings fixed; one remaining mandatory-session finding fixed in round 2; scoped re-review Approved.
Rulings: Current session ID is a mandatory dispatch-validator input. Host responses/events are closed and size-guarded. Vitest file parallelism disabled as a documented deterministic toolchain workaround without skipped tests.
Next: Task 3

Task 3: complete
Commit: aae1668 feat: add crash-safe cross-process state transactions; 41d75c1 fix: harden cross-process state lock recovery; cc25560 fix: bound cross-process storage recovery; bc06062 fix: settle storage maintenance diagnostics
Tests: 41/41 focused storage and 74/74 full units PASS under Node 22; lint, Host/Webview/strict-storage typechecks, build, Task 3 format PASS; synchronized Windows child contention proves EEXIST.
Review: Critical ABA and five Important transaction/recovery issues fixed across 3 rounds; final scoped review Approved with no findings.
Rulings: deterministic owner-token claim serializes stale quarantine; uncertain liveness/I/O fail closed; per-module bounded recovery directories; cleanup after durable commit cannot change mutation result and diagnostics run outside lock.
Next: Task 4

Task 4: complete
Commit: 4389d6c
Tests: 80/80 full unit tests PASS; Task 4 repository and migration tests PASS; lint, build, and Extension Host typecheck PASS. Global format check remains non-zero because of pre-existing Task 2 formatting differences; only Task 4 files were formatted.
Review: local implementation covers versioned envelopes, per-module transaction repositories, tombstone protection, per-book progress merge, 2048 session rejection with best-score preservation, preferences adapter, and version-by-version migrations.
Next: Task 5

Task 5: complete
Commit: da2687a
Tests: 3/3 focused Webview tests PASS; prior full suite 80/80; lint, build, Extension Host typecheck, and Webview typecheck PASS.
Review: secure deny-by-default CSP with nonce and packaged assets, single-section router, correlated message requests with timeout/disposal rejection, and minimal single-panel controller are implemented.
Next: Task 6

Task 6: complete
Commit: 770ffe1
Tests: 83/83 full unit tests PASS; format check, lint, build, Extension Host typecheck, and Webview typecheck PASS.
Review: Activity Bar and Sidebar contributions, five commands, three context keys, one-panel-per-window registry, disposal/visibility state propagation, serializer registration, and navigation tests are implemented. Boss command remains a visibility-gated no-op as required before Task 7.
Next: Task 7

Task 7: complete
Commit: e46cb5b
Tests: Boss state-machine tests PASS; full unit regression PASS; format check, lint, build, and strict Boss source typecheck PASS.
Review: in-memory NORMAL/BOSS_MODE transitions retain route/module/focus/scroll snapshots, service toggles serialize, absent/hidden panels no-op, acknowledgements gate title/context updates, and timeout failures restore the prior stable mode without persistence.
Next: Task 8

Task 8: complete
Commit: 1b4eb60
Tests: 13 focused game-engine tests, full regression, format check, lint, build, and strict game source typecheck PASS. Coverage command unavailable because `@vitest/coverage-v8` is not in the existing dependency set; no dependency changes made.
Review: immutable 4x4 directional transforms, one-merge-per-tile scoring, injected spawn RNG, victory/game-over detection, continue-after-win behavior, move events, and deterministic new-game state are implemented.
Next: Task 9

Task 9: complete
Commit: 6004c95; follow-up type guard fix f761fe6
Tests: session service and concurrency tests PASS; full regression, format check, lint, build, and strict service typecheck PASS.
Review: explicit new sessions atomically replace the active session, service restores durable state, ordered moves reject stale sessions/sequences, and stale-session score can raise bestScore without replacing the active board.
Next: Task 10

Task 10: complete
Commit: 95c6f7e
Tests: Webview 2048 keyboard and view tests PASS; full regression, format check, lint, build, and Webview typecheck PASS.
Review: accessible 16-cell board rendering uses DOM textContent, arrows/WASD are scoped to focused board and ignored while paused, no-op moves avoid persistence, modal actions support continue/new game, and controller exposes pause/resume/dispose/focus restoration.
Next: Task 11

Task 11: complete
Commit: 5aee414
Tests: book identity/service tests PASS; full regression, format check, lint, build, and strict book source typecheck PASS.
Review: UUID-backed metadata, Windows case-insensitive and non-Windows case-sensitive URI identity, duplicate touch, source-safe tombstone removal, type-preserving relocation, fingerprint updates, and index invalidation are implemented.
Next: Task 12

Task 12: complete
Commit: 44969e6
Tests: 4 TXT encoding tests, full regression 118/118, format check, lint, build, and strict TXT source typecheck PASS.
Review: BOM detection, strict UTF-8 and incomplete-prefix handling, GB18030 candidate confirmation, GBK/UTF-16 previews through iconv-lite, 4,000-character bounded decoding, and confirmation-only metadata mutation are implemented.
Known issue: coverage is unavailable because `@vitest/coverage-v8` is not in the existing dependency set; no dependency was installed.
Next: Task 13

Task 13: complete
Commit: 4eb8e15
Tests: 6 focused TXT index tests; full regression 124/124; format check, lint, build, and strict TXT index typecheck PASS.
Review: streaming encoded-unit boundary accounting handles UTF-8, UTF-16, GB18030/GBK, BOMs, CR/LF normalization, and cross-chunk characters without whole-file reads. Index entries carry byte ranges, decoded lengths, paragraph counts, and fingerprints; manifests bind book identity and source metadata. IndexStore uses a safe book-specific directory, same-directory temporary publication, cancellation cleanup, and exact metadata invalidation.
Known issue: coverage is unavailable because `@vitest/coverage-v8` is not in the existing dependency set; no dependency was installed.
Next: Task 14

Task 14: complete
Commit: 5a04790
Tests: 7 focused reader/TXT tests, full regression 134/134; format check, lint, build, and strict reader/TXT/protocol typecheck PASS.
Review: bounded file-handle range reads decode incrementally, normalize CR/LF paragraphs, verify block fingerprints and decoded counts, detect missing/changed sources, and keep an LRU cache capped by entry count. ReaderService persists logical TXT locators with per-book percentage and restores by matching content fingerprint before clamped percentage fallback. ProgressRepository validates checkpoints and preserves stale-window merges for different books while rejecting stale same-book writes.
Known issue: coverage is unavailable because `@vitest/coverage-v8` is not in the existing dependency set; no dependency was installed.
Next: Task 15

Task 15: complete
Commit: 3e7fb62
Tests: 4 focused Reader Webview tests, full regression 138/138; format check, lint, build, and Webview typecheck PASS.
Review: structured ReaderBlock paragraphs are rendered exclusively through textContent; the mounted block window is bounded and deduplicated; focus/progress checkpoints use logical block IDs; paging uses viewport height; pause/resume, focus restore, VS Code theme variables, reduced motion, and route subscriptions are implemented without raw HTML or pixel-based persistence.
Known issue: coverage is unavailable because `@vitest/coverage-v8` is not in the existing dependency set; no dependency was installed.
Next: Task 16

Task 16: complete
Commit: 6a5cc19
Tests: 21 focused EPUB security tests, full regression 159/159; format check, lint, build, Extension Host typecheck, and production npm audit PASS. Audit reports 0 vulnerabilities, including 0 high/critical.
Review: all twelve approved numerical boundaries are frozen and N-1/N/N+1 checked; ZIP source access is lazy and stat-bounded, archive paths are canonical, entry metadata and extraction progress are bounded, compression bombs/encryption/symlinks/duplicates are rejected, XML forbids declarations and external entities before saxes, and parse5 traversal emits only bounded text plus image placeholders. Exact production pins: @zip.js/zip.js 2.8.60 BSD-3-Clause, saxes 6.0.0 ISC, parse5 8.0.1 MIT.
Known issue: parse5 8.0.1 resolves entities 8.0.0, whose metadata declares Node >=20.19 while VS Code 1.96 uses Node 20.18. The dependency is bundled and current tests/build pass; Task 22 Extension Host acceptance must explicitly exercise EPUB parsing. Coverage remains unavailable because @vitest/coverage-v8 is not installed.
Next: Task 17
