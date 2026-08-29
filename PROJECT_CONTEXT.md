# Project Context

## Project goal

Moyu VS Code is a local-only VS Code leisure center for Windows 10/11. V1 contains a local novel reader, 2048, and a reversible in-Webview boss mode.

## Current phase

Design and implementation planning only. No feature source, package manifest, dependencies, or build output exist yet.

## Approved architecture

- Activity Bar and Sidebar provide the native entry and lightweight navigation.
- One main WebviewPanel per VS Code window hosts the reader, 2048, and boss overlay.
- Extension Host owns commands, file access, persistence, lifecycle, indexing, and parsing.
- Webview owns rendering and interaction and has no Node.js file access.
- User data is globally shared with per-module optimistic concurrency; panel and boss state are window-local.

## Completed work

- Product and architecture decisions approved.
- V1 design specification prepared for review.

## Pending work

- User review of the design specification.
- Detailed implementation plan.
- Implementation is explicitly not started in this phase.

## Important decisions

- Windows 10/11 are the only V1 acceptance platforms; core logic remains cross-platform friendly.
- Vanilla TypeScript, HTML, CSS, and esbuild; no frontend framework.
- EPUB is safe text-only chapter reading with no original HTML rendering or images.
- TXT supports UTF-8, UTF-16LE/BE, GB18030, and GBK with explicit encoding confirmation.
- Boss mode overlays the existing Moyu Webview without changing the user's real editor layout.
