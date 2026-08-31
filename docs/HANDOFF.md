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

Implement Task 5 from the amended plan: Reader shell, typography, toolbar, bounded
content, safe paragraph rendering, logical focus/progress retention, and existing
viewport paging. Keep EPUB chapter adapter work for Task 6; do not change durable
reader services.

## UI Redesign Task 5 checkpoint

Updated: 2026-08-31

### Current Task

Task 6 — EPUB chapter navigation UI and Host adapter.

### Completed

- Task 5 committed as `00a01ab feat: redesign Moyu Reader presentation`.
- Added the presentation-only `ReaderPresentationModel` and a Reader shell with
  Back to Books, title/type/percentage context, quiet overflow actions, bounded
  centered content, progress, and boundary-aware Previous/Next controls.
- Reader paragraphs remain inert `textContent` nodes with the existing block IDs;
  `ReaderController` still owns bounded block loading, logical locators,
  pause/resume, capture/restore, and progress calls.
- Reader route actions return to Books or open Settings through the existing
  Router, and Reader/Game controllers are disposed with the app lifecycle.
- Reader CSS consumes the existing font-size, line-height, and content-width
  variables and includes narrow-panel, contrast, forced-colors, and
  reduced-motion hooks.

### Tests

- Focused Reader/toolbar/block-window/Boss tests: 17/17 PASS.
- Full unit regression: 288/288 PASS.
- Current and VS Code 1.96.0 Extension Host lanes: PASS.
- Format, lint, build, and extension/Webview typechecks: PASS.

### Known Issues

- Coverage remains unavailable because `@vitest/coverage-v8` is not installed.
- EPUB chapter protocol and Host presentation adapter remain Task 6 work; the
  existing EPUB service has not been modified.

### Last Good Commit

`00a01ab feat: redesign Moyu Reader presentation`

### Next Exact Action

Implement Task 6 from the amended plan: add `ChapterDrawer` and
`EpubPresentationAdapter`, the closed chapter request/response families, and
text-only EPUB chapter navigation. Do not modify
`src/application/reader/EpubReaderService.ts`; preserve parser, security, cache,
chapter identity, and progress semantics.

## UI Redesign Task 6 checkpoint

Updated: 2026-09-01

### Current Task

Task 7 — 2048 presentation redesign.

### Completed

- Task 6 committed as `a400f2f feat: add accessible EPUB chapter navigation`.
- Added `EpubPresentationAdapter` as the only new EPUB presentation boundary;
  it consumes the existing parser/cache/progress-backed `EpubReaderService`
  and returns only bounded chapter summaries, fingerprints, and text
  paragraphs. `src/application/reader/EpubReaderService.ts` was not modified.
- Added typed `reader/listChapters`, `reader/openChapter`, and
  `reader/navigateChapter` request/response families, strict DTO validation,
  exact book/chapter identity checks, and activation injection.
- Reader now restores EPUB locators, renders chapter paragraphs through
  `textContent`, exposes an accessible ChapterDrawer with ordered/current
  buttons, Escape/focus return, and previous/next boundary handling. The
  drawer closes when the Reader is paused for Boss Mode and is disposed with
  the view.
- The existing EPUB parser/sanitizer received only the minimal import/type
  compatibility fixes needed after activation made that code part of the
  Extension Host typecheck graph.

### Tests

- Task 6 focused EPUB/Webview/dispatcher/adapter tests: PASS.
- Full unit regression: 294/294 PASS.
- Current and VS Code 1.96.0 minimum Extension Host lanes: PASS.
- Format check, lint, build, Extension Host typecheck, and Webview typecheck:
  PASS.

### Known Issues

- Coverage remains unavailable because `@vitest/coverage-v8` is not installed.
- `parse5/entities` Node engine metadata remains a dependency audit note; the
  bundled EPUB path passes the isolated VS Code 1.96.0 Extension Host lane.
- Cross-window UI may remain temporarily stale until a declared refresh point,
  as specified by the existing lifecycle design.

### Last Good Commit

`a400f2f feat: add accessible EPUB chapter navigation`

### Next Exact Action

Implement Task 7 from the amended plan: redesign the 2048 presentation with
compact Score/Best blocks, the bounded 16-cell semantic board, keyboard help,
secondary New Game action, and accessible win/Game Over dialogs while
preserving the existing Game2048Controller transport and lifecycle semantics.

## UI Redesign Task 7 checkpoint

Updated: 2026-09-01

### Current Task

Task 8 — Settings form and template preview.

### Completed

- Task 7 committed as `930b926 feat: refine Moyu 2048 presentation`.
- 2048 now presents compact accessible Score/Best blocks above a bounded
  semantic 16-cell board. Each cell retains text-only values and exposes a
  `data-value` styling hook using VS Code surface/contrast tokens rather than
  rainbow or brand colors.
- Added keyboard guidance, responsive layout/state hooks, a secondary New Game
  control below the board, and shared `Modal`-backed victory/Game Over dialogs.
  Continue and New Game return focus to the board; paused/Boss state blocks
  movement and closes active modal presentation.
- `Game2048Controller` transport, capture/restore lifecycle, durable game
  state, session identity, move sequence, engine, and persistence behavior were
  preserved.

### Tests

- Focused Task 7 view/keyboard tests: 6/6 PASS.
- Full unit regression: 297/297 PASS.
- Format check, lint, build, and Webview typecheck: PASS.

### Known Issues

- Coverage remains unavailable because `@vitest/coverage-v8` is not installed.
- Existing cross-window UI staleness and `parse5/entities` Node engine notes
  remain unchanged.

### Last Good Commit

`930b926 feat: refine Moyu 2048 presentation`

### Next Exact Action

Implement Task 8 from the amended plan: redesign Settings with Reading and Boss
Mode sections, labelled descriptions/current range outputs, native controls with
the existing exact ranges, template preview/reset callbacks, and unchanged
versioned ReaderSettingsService persistence.

## UI Redesign Task 8 checkpoint

Updated: 2026-09-01

### Current Task

Task 9 — Boss neutral overlay presentation.

### Completed

- Task 8 committed as `0ebb4ad feat: redesign Moyu Settings presentation`.
- Settings now has distinct Reading and Boss Mode sections with exact native
  ranges: Font size 12–32 step 1, Line height 1.2–2.2 step 0.05, and Content
  width 480–1200 step 20.
- Every reading field exposes a label, the approved description, a live
  accessible value output, and a native range control. Range input previews
  the value and reader CSS variables immediately; change events still use the
  existing typed settings update path.
- Boss template IDs remain exactly `typescript`, `json`, and `buildLog`, while
  the UI presents TypeScript, JSON, and Build Log labels and a local text-only
  preview using the existing `BOSS_TEMPLATES` and title mapping. No user source
  file is read.
- Reset is a typed optional action and the app submits only the default reading
  fields through the current base version. Boss template, books, progress,
  game state, and Boss state are not reset. Failed updates retain the existing
  durable reread and safe status behavior.
- Settings CSS uses shared VS Code/theme tokens with visible focus, forced
  colors, high-contrast, responsive, and reduced-motion hooks; no color
  literals were added.

### Tests

- Focused Task 8 Settings/theme/reader/panel tests: 33/33 PASS.
- Full unit regression: 301/301 PASS.
- Format check, lint, build, Extension Host typecheck, and Webview typecheck:
  PASS.
- Current and VS Code 1.96.0 Extension Host lanes: PASS. The first current
  attempt encountered a transient TEMP fixture `state.lock` EPERM; after the
  fixture lock was gone, the clean rerun passed. No source change was made for
  that environmental retry.

### Known Issues

- Coverage remains unavailable because `@vitest/coverage-v8` is not installed.
- Existing parse5/entities Node-engine metadata and cross-window refresh notes
  remain unchanged.

### Last Good Commit

`0ebb4ad feat: redesign Moyu Settings presentation`

### Next Exact Action

Read and implement Task 9 from the amended plan: redesign the Boss overlay as
an accessible neutral editor-like static document while preserving the existing
ModuleLifecycle capture/resume state machine, template IDs, titles, and safe
text-only rendering.

## UI Redesign Task 9 checkpoint

Updated: 2026-09-01

### Current Task

Task 10 — Responsive, accessibility, and theme polish.

### Completed

- Task 9 committed as `5fe7317 feat: refine Moyu neutral Boss presentation`.
- The single persistent Boss overlay now uses the neutral accessible name
  `Work document preview`, a safe filename header, and an editor-like themed
  document surface. The exact title mapping remains TypeScript → `extension.ts`,
  JSON → `settings.json`, and Build Log → `build.log`.
- Static template content continues to use `textContent` with the existing
  local `BOSS_TEMPLATES`; no user source file, HTML, or second state machine was
  introduced. Re-selecting a template reuses the same overlay element.
- Focus enters the overlay without scroll, returns to the opener on hide, and
  the normal region remains inert and hidden with `aria-hidden` while active.
  Reader/2048 controller and state identity, logical restoration, lifecycle
  snapshots, acknowledgement-gated title/context changes, and command gating
  remain unchanged.

### Tests

- Focused Boss overlay/restoration/PanelController/extension Boss tests: 24/24
  PASS.
- Full unit regression: 302/302 PASS.
- Format check, lint, build, Extension Host typecheck, and Webview typecheck:
  PASS.
- Current and VS Code 1.96.0 Extension Host lanes: PASS.

### Known Issues

- Coverage remains unavailable because `@vitest/coverage-v8` is not installed.
- Existing parse5/entities Node-engine metadata and cross-window refresh notes
  remain unchanged.

### Last Good Commit

`5fe7317 feat: refine Moyu neutral Boss presentation`

### Next Exact Action

Read and implement Task 10 from the amended plan: apply responsive,
accessibility, and theme polish across the shared tokens, shell/components,
Sidebar, Home, Bookshelf, Reader, 2048, Settings, and Boss styles without
introducing hard-coded colors or changing module/business behavior.

## UI Redesign Task 10 checkpoint

Updated: 2026-09-01

### Current Task

Task 11 — integrated regression and presentation boundary review.

### Completed

- Task 10 committed as `e088dcf feat: polish Moyu responsive accessibility and themes`.
- Added the cross-surface `accessibilityPresentation.test.ts` regression for
  shared spacing/radius/motion/layout tokens, VS Code theme aliases, forbidden
  private colors/network assets, focus paths, responsive hooks, semantic state
  attributes, and bounded recovery-action presentation.
- Normalized shared and feature CSS around fluid `min-width: 0`/overflow-safe
  layouts and the existing VS Code-variable token layer. Sidebar, Home,
  Bookshelf, Reader, 2048, Settings, Boss, and shared components now expose
  contrast, forced-colors, and reduced-motion hooks; Reader narrow toolbars
  stack at the smallest supported width.
- Added global button/input/select focus inheritance and visible forced-color
  focus, marked the shell normal region as the accessible `main`, and hardened
  ErrorView to accept only the bounded `RECOVERY_ACTIONS` allowlist while
  retaining textContent-only rendering and grouped recovery controls.
- Reader chapter drawer no longer contains a hard-coded RGB shadow or undefined
  presentation aliases; parser, cache, chapter identity, progress, and module
  behavior remain unchanged.

### Tests

- Focused Task 10 presentation tests: 12/12 PASS.
- Entire Webview test directory: 72/72 PASS.
- Full unit regression: 307/307 PASS.
- Format check, lint, build, Extension Host/Webview typechecks: PASS.
- Current Extension Host lane: PASS after one transient TEMP fixture
  `state.lock` EPERM retry; minimum VS Code 1.96.0 lane: PASS.
- Extension contract: 5/5 PASS; package-content checks: 4/4 PASS.

### Known Issues

- Coverage remains unavailable because `@vitest/coverage-v8` is not installed.
- `parse5/entities` Node-engine metadata and the existing cross-window refresh
  note remain unchanged.
- `scan-package-secrets.mjs` currently reports a false positive in the
  bundled ZIP dependency at `dist/extension.js` (`password: encodePassword`);
  no credential or provider token was found. This is a pre-existing packaging
  scanner issue and needs an evidence-based packaging decision in Task 11/12.

### Last Good Commit

`e088dcf feat: polish Moyu responsive accessibility and themes`

### Next Exact Action

Read and implement Task 11 from the amended UI redesign plan: run the
integrated regression and review presentation boundaries, fixing only actual
evidence and preserving domain, protocol, lifecycle, persistence, and safe DOM
contracts.
