# Moyu VS Code V1 Handoff

Updated: 2026-08-30

## RESUME REPORT

Repository: `D:\Moyu\Moyu-VSCode`
Branch: `feature/moyu-v1-implementation`
Worktree: `D:\Moyu\Moyu-VSCode\.worktrees\moyu-v1-implementation`
HEAD: `6876d1a docs: record V1 task 17 handoff`; working tree has the Task 18 RED test listed below.

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

### Current Task

Task 18 — Bookshelf Webview and Import Workflows.

### Current Task Status

Task 18 is IN PROGRESS. The Webview RED test is written and fails for the expected missing BookshelfController/BookshelfView modules. Production implementation and Extension Host import smoke are not started.

### Uncommitted Changes

- `test/unit/webview/bookshelf.test.ts` — RED tests for safe text rendering, removal wording, and cancelled picker behavior.

### Passing Tests

- Full regression: 38 test files, 162/162 tests.
- `npm test -- --run test/unit/epub test/unit/reader`: 27/27.
- `npm run format:check`
- `npm run lint`
- `npm run build`
- Extension Host TypeScript typecheck.
- `npm audit --omit=dev`: 0 vulnerabilities, including 0 high/critical.

### Failing Tests

- `npm test -- --run test/unit/webview/bookshelf.test.ts` fails because `webview/books/BookshelfController.ts` and `BookshelfView.ts` do not exist yet (expected Task 18 RED).
- Coverage is unavailable because the dependency set does not include `@vitest/coverage-v8`; no coverage dependency was installed.
- `parse5@8.0.1` resolves `entities@8.0.0`, whose package metadata declares Node >=20.19 while the minimum VS Code 1.96 runtime is Node 20.18; esbuild bundles it and current tests/build pass, but Task 22 Extension Host acceptance must explicitly verify this path.

### Last Good Commit

`6876d1a docs: record V1 task 17 handoff`

### Next Exact Action

Implement `webview/books/bookCard.ts`, `BookshelfView.ts`, and `BookshelfController.ts` until `test/unit/webview/bookshelf.test.ts` is GREEN; then add the Host picker/confirmation flow in `src/extension/commands.ts` and create the missing `test/extension/suite/bookImport.test.ts` smoke without weakening cancellation behavior.
