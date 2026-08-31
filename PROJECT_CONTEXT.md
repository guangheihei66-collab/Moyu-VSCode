# Project Context

## Project goal

Moyu VS Code is a local-only VS Code leisure center for Windows 10/11. V1 contains a local novel reader, 2048, and a reversible in-Webview boss mode.

## Current phase

V1 implementation and the UI redesign release checkpoint are complete on
`feature/moyu-v1-implementation`. UI Redesign Tasks 1–12 are implemented and
the local `0.2.0` VSIX is packaged. The isolated visual pass verified the
Activity Bar, four-entry Sidebar, one-panel navigation, themes, responsive
layouts, Settings, and neutral Boss presentation. Reader/EPUB fixture-driven
visual checks remain explicitly open because no manual book fixture is shipped;
their automated Host/Webview coverage is green. Follow-up notes remain in
`docs/todo.md` and `test/acceptance/windows-v1-checklist.md`.

## Approved architecture

- Activity Bar and Sidebar provide the native entry and lightweight navigation.
- One main WebviewPanel per VS Code window hosts the reader, 2048, and boss overlay.
- Extension Host owns commands, file access, persistence, lifecycle, indexing, and parsing.
- Webview owns rendering and interaction and has no Node.js file access.
- Conflict-sensitive user data is globally shared through per-module lease-locked file transactions under `globalStorageUri`; locks wait at most 5 seconds, heartbeat every 2 seconds, and become stale only after 30 seconds. Panel and boss state are window-local.

## Completed work

- Product and architecture decisions approved.
- V1 design specification approved subject to four review corrections, which are incorporated.
- V1 implementation plan prepared as 23 independently reviewable TDD tasks and self-reviewed.
- Reproducible extension skeleton, validated message protocol, crash-safe storage transactions, versioned module repositories, and the secure Webview shell are implemented and tested.
- Streaming TXT indexing now derives encoded byte ranges and normalized paragraph counts incrementally, with book-bound manifests and atomic cache publication.
- TXT blocks are read on demand through bounded file-handle ranges; logical TXT locators and per-book progress recover by content fingerprint before percentage fallback.
- The continuous Reader Webview renders structured blocks as inert text, keeps a bounded deduplicated block window, and captures logical focus/progress anchors independently of viewport pixels.
- EPUB input is isolated behind exact-pinned ZIP/XML/HTML parsers with twelve numerical limits, lazy source access, canonical archive paths, entity-free XML, and text-only chapter sanitization.
- EPUB container/OPF/spine parsing now produces ordered text-only chapters; the derived cache is source-bound, and chapter navigation/progress use logical EPUB locators.
- The Bookshelf Webview safely renders local books and routes import, continue, relocate, encoding, and confirmed removal workflows through the Extension Host; source files are never deleted.
- Reader settings now persist field-level concurrent updates, validate exact ranges, flow through closed Host/Webview messages, and drive accessible theme-token-based controls and reader CSS variables.
- Boss mode now uses a persistent accessible overlay over the single main panel, preserves module/controller/state identity, restores logical Reader anchors, serializes acknowledgement-gated transitions, and resets safely across hidden, disposed, and restored panels.
- Task 21 now maps domain and adapter failures to stable path-free error presentations with bounded recovery actions, renders accessible recovery controls, refreshes locked repositories at explicit panel lifecycle and mutation boundaries, and broadcasts committed notices only among sessions in the same Extension Host.
- Task 22 now provides isolated current/minimum VS Code Extension Host lanes, deterministic TEMP fixtures, TXT/EPUB/2048/Boss/Webview/lifecycle acceptance coverage, competing child-process transaction coverage, and a manual Windows checklist.
- Task 23 now provides the user guide, changelog/license, architecture and decision notes, a runtime-only `.vscodeignore` boundary, package-input secret scanning, VSIX archive allowlist verification, and isolated packaged current/minimum install smoke.
- UI Redesign Tasks 1–11 now provide the approved presentation layer across
  the shared components, native Sidebar, Home, Bookshelf, Reader, EPUB drawer,
  2048, Settings, neutral Boss overlay, responsive layouts, accessibility,
  themes, and integrated route/lifecycle regression coverage. Domain,
  protocol, persistence, parser, and controller boundaries remain intact.
- UI Redesign Task 12 packages version `0.2.0`, requires both main Webview and
  Sidebar runtime assets, fixes the package scanner's case-sensitive secret
  assignment boundary, verifies the 11-entry runtime-only VSIX archive, and
  records the isolated Windows smoke in
  `test/acceptance/windows-v1-checklist.md`.

## Pending work

- Complete a fixture-backed manual Reader TXT, EPUB drawer, Reader Boss, and
  2048 modal visual pass when an approved non-private fixture is available.
- Keep the known coverage-provider, parse5/entities engine metadata, and
  documented cross-window refresh notes in `docs/todo.md`.

## Important decisions

- Windows 10/11 are the only V1 acceptance platforms; core logic remains cross-platform friendly.
- Vanilla TypeScript, HTML, CSS, and esbuild; no frontend framework.
- Node.js 22 LTS is development tooling only. Production Extension Host code targets the Node 20.18 runtime boundary of minimum VS Code 1.96.x; Webview code targets Chromium 128 separately.
- EPUB is safe text-only chapter reading with no original HTML rendering or images.
- TXT supports UTF-8, UTF-16LE/BE, GB18030, and GBK with explicit encoding confirmation.
- Boss mode overlays the existing Moyu Webview without changing the user's real editor layout.
- The `0.2.0` UI redesign is released locally only; no push, Marketplace
  publish, or normal VS Code profile mutation is part of the release checkpoint.
