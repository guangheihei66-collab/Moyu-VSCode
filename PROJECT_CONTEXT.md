# Project Context

## Project goal

Moyu VS Code is a local-only VS Code leisure center for Windows 10/11. V1 contains a local novel reader, 2048, and a reversible in-Webview boss mode.

## Current phase

Implementation in progress on `feature/moyu-v1-implementation`. Tasks 1–16 are complete; Task 17 is next.

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

## Pending work

- Task 17: EPUB spine, chapters, cache, and progress.

## Important decisions

- Windows 10/11 are the only V1 acceptance platforms; core logic remains cross-platform friendly.
- Vanilla TypeScript, HTML, CSS, and esbuild; no frontend framework.
- Node.js 22 LTS is development tooling only. Production Extension Host code targets the Node 20.18 runtime boundary of minimum VS Code 1.96.x; Webview code targets Chromium 128 separately.
- EPUB is safe text-only chapter reading with no original HTML rendering or images.
- TXT supports UTF-8, UTF-16LE/BE, GB18030, and GBK with explicit encoding confirmation.
- Boss mode overlays the existing Moyu Webview without changing the user's real editor layout.
