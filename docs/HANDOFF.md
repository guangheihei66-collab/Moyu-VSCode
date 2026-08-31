# Moyu VS Code V1 Handoff

Updated: 2026-08-31

## RESUME REPORT

Repository: `D:\Moyu\Moyu-VSCode`
Branch: `feature/moyu-v1-implementation`
Worktree: `D:\Moyu\Moyu-VSCode\.worktrees\moyu-v1-implementation`
HEAD: `ae6c97a fix: register Moyu Sidebar as a webview`; working tree is clean before this handoff update.

### Completed Tasks

- Tasks 1–3: complete and committed.
- Task 4: implementation complete and committed as `4389d6c`.
- Task 5: implementation complete and committed as `da2687a`; Webview tests, lint, build, and dual target type checks pass.
- Task 6: implementation complete and committed as `770ffe1`; 83/83 tests, format check, lint, build, and Extension Host typecheck pass.
- Task 7: implementation complete; Boss tests, lint, build, and strict Boss source typecheck pass.
- Task 8: implementation complete; 13 game-engine tests, full regression, format check, lint, build, and strict game source typecheck pass.
- Task 9: implementation complete; session service and concurrency tests, full regression, format check, lint, build, and strict service typecheck pass.
- Task 10: implementation complete; 2048 Webview keyboard/DOM tests, full regression, format check, lint, build, and Webview typecheck pass.
- Task 11: implementation complete; book identity/service tests, full regression, format check, lint, build, and strict book source typecheck pass.
- Task 12: implementation complete and committed as `44969e6`; TXT encoding tests, full regression, format check, lint, build, and strict TXT source typecheck pass.
- Task 13: implementation complete and committed as `4eb8e15`; streaming byte-aware TXT indexing, normalized paragraph boundaries, book-bound manifest validation, safe cache paths, atomic publication, reuse invalidation, cancellation, and cross-chunk encoding tests pass.
- Task 14: implementation complete and committed as `5a04790`; bounded indexed TXT reads, source-change detection, fixed-size decoded-block caching, logical locator recovery, per-book progress merge, and `reader/saveProgress` protocol validation pass.
- Task 15: implementation complete and committed as `3e7fb62`; safe text-only rendering, bounded deduplicated block mounting, logical focus anchors, viewport paging, pause/resume, theme styling, and route subscription pass.
- Task 16: implementation complete and committed as `6a5cc19`; all twelve EPUB limits, lazy bounded ZIP access, canonical paths, metadata and expansion checks, entity-free bounded XML, hostile-markup text extraction, and exact dependency audit pass.
- Task 17: implementation complete and committed as `b92d493`; container/OPF/spine parsing, ordered sanitized chapters, source-bound atomic cache, chapter navigation, domain EPUB locator reuse, and logical progress restore pass.
- Task 18: implementation complete and committed as `fcb6185`; safe Bookshelf cards/controller, native TXT/EPUB picker, relocation, bounded encoding previews, explicit removal confirmation, source-preserving cleanup, protocol validation, and Host smoke pass.
- Task 19: implementation complete as `1a4ba01` plus review fix `83e0b8f`; closed settings read/update flow, transactional field merge, strict envelope/range validation, accessible native controls, theme tokens, safe correlated errors, and app recovery pass independent review.
- Task 20: implementation and review fixes complete as `ac16118`, `54ff694`, `1910c34`, and `470b522`; persistent accessible Boss overlay, logical Reader/2048 module restoration, durable Host/Webview transports, non-empty state identity checks, acknowledgement-gated title/context changes, serializer/disposal cancellation barriers, and stable shell-route restoration pass independent review.
- Task 21: implementation complete as `0090e46`; stable path-free error codes/messages/actions, accessible recovery controls, cancellable locked-repository refresh coordination, Panel lifecycle refresh hooks, same-Extension-Host session registration, and committed local notices pass focused and full regression checks.
- Task 22: implementation complete as `e3e3a00`; isolated current and VS Code 1.96.0 Extension Host lanes, deterministic TEMP fixtures, activation/Webview/Sidebar/navigation/serializer/picker/Boss/lifecycle checks, TXT/EPUB import-read coverage, 2048 recovery, and competing child-process transaction recovery are automated; the Windows manual acceptance checklist is at `test/acceptance/windows-v1-checklist.md`.
- Task 23: implementation complete as `119bf28`; README, changelog/license, architecture and decision notes, runtime-only `.vscodeignore`, package-input secret scan, 9-entry VSIX archive allowlist verification, and isolated packaged current/minimum install smoke are complete.
- Post-implementation Sidebar VSIX integration fix: complete as `ae6c97a`; the contributed `moyu.sidebar` view now explicitly declares `type: "webview"`, matching the existing `registerWebviewViewProvider` runtime registration. A real Extension Host regression opens the container/View and observes provider resolution, and packaged current/minimum smoke covers the extracted VSIX.

### Current Task

Post-implementation VSIX Sidebar integration bugfix — complete.

### Current Task Status

The production VSIX integration bug is fixed and committed. The manifest/runtime View ID and view type are covered by regression tests; the real current/minimum Extension Host and packaged VSIX lanes are GREEN.

### Uncommitted Changes

- None.

### Passing Tests

- Full regression: 262/262 unit tests.
- Focused Task 21 error/session/Webview/Panel recovery tests: 16/16.
- Focused Task 20 Boss/Webview/protocol/extension tests: 88/88.
- Extension contract: 5/5 tests.
- Extension Host current lane: PASS.
- Extension Host minimum lane: PASS on VS Code 1.96.0.
- Task 22 acceptance includes TXT/EPUB import-read, 2048 restore, Boss acknowledgement, panel reuse/disposal, serializer delegation, picker cancellation, context state, and multi-process transaction recovery.
- Sidebar manifest/runtime regression: PASS; declared `moyu.sidebar` / `type: "webview"` matches the runtime registration argument exactly.
- Real Sidebar Extension Host regression: PASS in current and VS Code 1.96.0 lanes; the provider instance resolves after opening `workbench.view.extension.moyu` and `moyu.sidebar`.
- Package gate: PASS; 262/262 unit tests, contract 5/5, secret scan 7 files, VSCE list 7 source inputs, 9-entry VSIX archive verification, and packaged current/minimum provider smoke.
- Local VSIX: `moyu-vscode-0.1.0.vsix` (242.60 KB; ignored by Git).
- `npm run format:check`
- `npm run lint`
- `npm run build`
- Extension Host and Webview TypeScript typechecks.

### Known Issues

- No failing tests in this checkpoint.
- Coverage is unavailable because the dependency set does not include `@vitest/coverage-v8`; no coverage dependency was installed.
- `parse5@8.0.1` resolves `entities@8.0.0`, whose package metadata declares Node >=20.19 while the minimum VS Code 1.96 runtime is Node 20.18; the bundled EPUB path now passes the isolated VS Code 1.96.0 Extension Host lane, but the metadata mismatch remains a dependency audit note.
- Cross-window UI may remain temporarily stale until a declared refresh point; the acceptance harness verifies conflict-safe writes, not realtime cross-process event delivery.
- This host exposes Node 26.4.0 rather than the documented Node 22 development runtime; no system/toolchain change was made. Node 22-specific execution evidence remains pending until a Node 22 environment is available.
- The old 0.1.0 VSIX failure was reproduced in an isolated profile. A new isolated profile was prepared for the fixed VSIX, but the manual UI click-through was interrupted by the physical Escape key stopping Computer Use; packaged current/minimum smoke is GREEN, but the visual four-entry click-through remains to be repeated.

### Last Good Commit

`ae6c97a fix: register Moyu Sidebar as a webview`

### Next Exact Action

Repeat the fixed VSIX manual acceptance in an isolated profile: click the Moyu Activity Bar icon, verify Home/Books/2048/Settings render without the data-provider error, and click a destination to confirm the single main WebviewPanel opens. Preserve the no-push/no-publish boundary.

## UI Redesign continuation — latest checkpoint

Updated: 2026-08-31

### Current Task

Task 2 — native Sidebar redesign.

### Completed in this checkpoint

- Approved Spec/Plan gates amended and committed as `0db2201`.
- UI Redesign Task 1 completed and committed as `736b91c`.
- Added the shared safe DOM/component layer, keyboard ActionMenu, accessible
  Modal, progress component, token aliases, shared component CSS, and deterministic
  base-style imports.
- Task 1 did not modify domain, protocol, Extension Host, parser, persistence,
  or service code.

### Tests

- Focused Task 1 tests: 7/7 PASS.
- Full unit regression: 267/267 PASS.
- `npm run format:check`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- Webview typecheck: PASS.

### Known Issues

- Coverage remains unavailable because `@vitest/coverage-v8` is not installed.
- Existing non-Task-1 Boss CSS fallback remains for the later theme/accessibility
  polish task.

### Last Good Commit

`736b91c feat: add Moyu presentation tokens and shared components`

### Next Exact Action

Implement Task 2 from the amended plan: the four-entry Sidebar bundle and
provider lifecycle while preserving the `moyu.sidebar` Webview contribution and
single main WebviewPanel architecture. Use layered Sidebar tests; do not require
the provider shell to contain visible labels.

## UI Redesign Task 2 checkpoint

Updated: 2026-08-31

### Current Task

Task 3 — Home and overview snapshot adapter.

### Completed

- Task 2 committed as `2b5e465`.
- Sidebar now renders Home, Books, 2048, and Settings as lightweight semantic
  navigation entries with selected/hover/focus states and safe summaries.
- Provider/runtime wiring uses the exact `moyu.sidebar` View ID, strict CSP,
  packaged `dist/webview/sidebar.js` and `sidebar.css`, local resource roots,
  typed message validation, active-state updates, and disposal-owned listeners.
- Real current and VS Code 1.96.0 Extension Host lanes verify provider resolution
  and production Sidebar asset existence.

### Tests

- Focused Task 2 tests: 41/41 PASS.
- Full unit regression: 270/270 PASS.
- Current/minimum Extension Host lanes: PASS.
- Format, lint, extension/Webview typechecks, and build: PASS.

### Known Issues

- Home remains a shell fallback until Task 3 supplies its safe snapshot surface.
- Coverage remains unavailable because `@vitest/coverage-v8` is not installed.
- Existing non-Task-1 Boss CSS fallback remains for the later theme/accessibility
  polish task.

### Last Good Commit

`2b5e465 feat: redesign Moyu native Sidebar navigation`

### Next Exact Action

Implement Task 3 from the amended plan: add Home Continue Reading, Quick Access,
Recent Books, and safe empty states through the presentation snapshot adapter,
without adding a new store or changing durable services.

## UI Redesign Task 3 checkpoint

Updated: 2026-08-31

### Current Task

Task 4 — Bookshelf presentation and safe actions.

### Completed

- Task 3 committed as `4364f5c feat: add Moyu Home presentation`.
- Added the read-only `PresentationSnapshotProvider`, validated Home/Books
  snapshot DTOs, correlated `home/read` transport, and Home route/controller.
- Home now renders Continue Reading, Quick Access, Recent Books, safe empty
  states, source-missing state, chapter/progress metadata, and typed navigation
  actions through shared safe DOM components.
- Existing bookshelf, progress, game, and file-stat services remain the source
  of truth; no new store, source mutation, or persistence schema was added.

### Tests

- Focused Home/protocol/adapter/dispatcher/router tests: 19/19 PASS.
- Full unit regression: 279/279 PASS.
- Current and VS Code 1.96.0 Extension Host lanes: PASS.
- Format, lint, build, and Extension Host/Webview typechecks: PASS.

### Known Issues

- Coverage remains unavailable because `@vitest/coverage-v8` is not installed.
- Existing non-Task-1 Boss CSS fallback remains for the later responsive/theme
  polish task.

### Last Good Commit

`4364f5c feat: add Moyu Home presentation`

### Next Exact Action

Implement Task 4 from the amended plan: compact Bookshelf rows, local search and
type filters, safe overflow actions, source-missing recovery, and the existing
validated import/relocate/reselect/remove/open flows without source deletion.

## UI Redesign Task 4 checkpoint

Updated: 2026-08-31

### Current Task

Task 5 — Reader presentation and safe navigation.

### Completed

- Task 4 committed as `5dd94bb feat: redesign Moyu Bookshelf presentation`.
- Books now renders compact safe rows from a validated snapshot DTO with title,
  type, progress, last-opened/chapter metadata, and source-missing state without
  exposing source paths.
- Search and TXT/EPUB filters are local presentation state; empty, no-match, and
  source-missing states are explicit and accessible.
- Overflow actions use the shared ActionMenu with exact Open, Relocate file,
  Reselect encoding, and Remove from bookshelf semantics. Native picker,
  confirmation, source-retaining removal, and existing service workflows remain
  Host-side.
- Typed `books/*` messages return safe snapshots and preserve the existing single
  WebviewPanel and Reader/Books route lifecycle.

### Tests

- Focused Task 4 tests: 50/50 PASS.
- Full unit regression: 285/285 PASS.
- Current and VS Code 1.96.0 Extension Host lanes: PASS.
- Format, lint, build, and extension/Webview typechecks: PASS.

### Known Issues

- Coverage remains unavailable because `@vitest/coverage-v8` is not installed.
- Existing non-Task-1 Boss CSS fallback remains for the later theme/accessibility
  polish task.

### Last Good Commit

`5dd94bb feat: redesign Moyu Bookshelf presentation`

### Next Exact Action

Implement Task 5 from the amended plan: the Reader presentation layer using the
existing reader service through `EpubPresentationAdapter`, safe DTOs, ChapterDrawer
navigation, and preserved parser/security/cache/chapter identity/progress semantics.
