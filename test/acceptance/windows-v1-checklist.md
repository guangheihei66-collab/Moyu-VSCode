# Moyu VS Code V1 Windows Acceptance Checklist

This record covers the `0.2.0` UI redesign package. Automated checks run in
isolated Extension Host lanes; visual checks run in a separate VS Code profile
and do not use normal user storage.

## Environment

- [x] Windows version: Windows 11 Professional, 10.0.26100, build 26100
- [x] Architecture: x64
- [x] Current VS Code version: 1.135.0
- [x] Minimum lane: VS Code 1.96.0 — PASS
- [x] Moyu release commit: `f2bc9b2`
- [x] Package: `moyu-vscode-0.2.0.vsix`
- [x] Isolated profile: `%TEMP%\\moyu-vscode-ui-0.2.0-20260901`
- [x] Manual fixture: empty-bookshelf baseline; no private or novel source
      content was copied into the acceptance record

## Core flow

- [x] The VSIX installed through the VS Code UI and reported completed
      installation.
- [x] Activity Bar Moyu entry opens the Sidebar without a data-provider error.
- [x] Sidebar exposes Home, Books, 2048, and Settings as lightweight routes.
- [x] Each Sidebar route reuses the same visible Moyu main WebviewPanel; no
      duplicate Moyu tab was observed.
- [x] Books search (`no-match`) and the EPUB filter render correctly.
- [x] Import opens the native `TXT and EPUB books` picker; Escape cancels it
      and returns to the empty Books surface.
- [x] Empty Books copy states that the original file stays in place; actual
      import/removal was not run because no manual book fixture is shipped.
- [ ] Reader TXT import and content flow — automated only; no manual source
      fixture was available.
- [ ] EPUB ordered chapter content and drawer — automated only; the Host and
      Webview EPUB safety/integration suites pass.
- [ ] Close/restore and two-window conflict flow — automated only; current and
      minimum Extension Host lanes pass.

## Presentation matrix

- [x] Dark 2026 theme: Sidebar, Books, 2048, Settings, and Boss overlay render.
- [x] Light 2026 theme: Books surface and Sidebar render without errors.
- [x] Dark High Contrast theme: Books surface and Sidebar render without
      provider, layout, or activation errors.
- [x] Narrow smoke: 817x904; Books, 2048, and Settings remain usable, with
      narrow content wrapping and vertical scrolling.
- [x] Normal smoke: 1443x904; Books and Sidebar render normally.
- [x] Wide smoke: 1707x1019; Books and Sidebar render normally.
- [x] Keyboard-only Settings path: Tab reached the controls and Reset; Enter
      reset the changed Font size value from 19 px to 16 px.
- [x] Settings live preview: Font size changed from 16 px to 19 px before the
      keyboard reset.
- [x] 2048 surface: semantic board, Score/Best, keyboard help, and New Game
      are visible; New Game produced a non-empty board.
- [x] 2048 Boss smoke: Ctrl+M showed the neutral `extension.ts` document, and
      Ctrl+M returned to the same 2048 surface with its non-empty board.
- [ ] Reader Boss flow, EPUB drawer, and 2048 victory/Game Over modal —
      automated presentation/lifecycle coverage only because no manual book
      fixture was available.

## Automated release gates

- [x] `npm run package` — PASS
- [x] Format, lint, build, Extension Host/Webview typechecks — PASS
- [x] Full unit regression — 313/313 PASS
- [x] Extension contract — 5/5 PASS
- [x] Current and VS Code 1.96.0 Extension Host lanes — PASS
- [x] Package-input secret scan — PASS; no package secret patterns found
- [x] VSIX archive allowlist — 11 entries, including main Webview and Sidebar
      JS/CSS; no tests, fixtures, maps, logs, secrets, or user data
- [x] Packaged current/minimum install smoke — PASS

## Result and follow-up

The packaged Activity Bar, Sidebar provider, one-panel navigation, responsive
surface rendering, theme switching, Settings controls, and neutral Boss
presentation passed the available isolated visual smoke checks. Reader/EPUB
fixture-driven visual checks remain explicitly open; their Extension Host and
Webview regression coverage is green.

No push, publish, Marketplace action, normal-profile write, or old-project
change was performed.
