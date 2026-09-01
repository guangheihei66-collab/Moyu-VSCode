# Moyu VS Code V1 Windows Acceptance Checklist

This record covers the `0.2.1` bounded 2048-removal package. Automated checks run in
isolated Extension Host lanes; the VSIX was installed into a separate profile and
does not use normal user storage.

## Environment

- [x] Windows version: Windows 11 Professional, 10.0.26100, build 26100
- [x] Architecture: x64
- [ ] Current VS Code version: no standard system Code.exe was discoverable;
      automated current/minimum lanes used the official cached 1.96.0 build
- [x] Minimum lane: VS Code 1.96.0 — PASS
- [x] Moyu removal commit: `7b93f93`
- [x] Package: `moyu-vscode-0.2.1.vsix`
- [x] Isolated profile: `%TEMP%\\moyu-vscode-0.2.1-acceptance-cli-38b44a7d8333463984cfc8672e5b82f3`
- [x] Manual fixture: empty-bookshelf baseline; no private or novel source
      content was copied into the acceptance record

## Core flow

- [x] The VSIX installed through the official VS Code CLI into the isolated
      profile; `code.cmd --list-extensions --show-versions` returned
      `undefined_publisher.moyu-vscode@0.2.1`.
- [ ] Activity Bar Moyu entry opens the Sidebar without a data-provider error —
      manual UI click-through was blocked by the Windows UI helper's stale
      window handle.
- [x] Static manifest/runtime and packaged Host contracts expose only Home,
      Books, and Settings as Sidebar routes.
- [x] No 2048 command, route, Home card, game persistence, or game identifier
      is present in the installed 0.2.1 runtime; the only numeric `2048`
      literals are EPUB chapter limits.
- [x] Packaged Host smoke reuses one visible Moyu main WebviewPanel and checks
      the command surface; manual duplicate-tab observation remains open.
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

- [ ] Dark 2026 theme: Sidebar, Books, Settings, and Boss overlay render.
- [x] Light 2026 theme: Books surface and Sidebar render without errors.
- [x] Dark High Contrast theme: Books surface and Sidebar render without
      provider, layout, or activation errors.
- [ ] Narrow smoke: 817x904; Books and Settings remain usable, with
      narrow content wrapping and vertical scrolling.
- [x] Normal smoke: 1443x904; Books and Sidebar render normally.
- [x] Wide smoke: 1707x1019; Books and Sidebar render normally.
- [x] Keyboard-only Settings path: Tab reached the controls and Reset; Enter
      reset the changed Font size value from 19 px to 16 px.
- [x] Settings live preview: Font size changed from 16 px to 19 px before the
      keyboard reset.
- [ ] Reader Boss flow and EPUB drawer —
      automated presentation/lifecycle coverage only because no manual book
      fixture was available.

## Automated release gates

- [x] `npm run package` — PASS for 0.2.1
- [x] Format, lint, build, Extension Host/Webview typechecks — PASS
- [x] Full unit regression — 57 files, 283/283 PASS
- [x] Extension contract — 5/5 PASS
- [x] Current and VS Code 1.96.0 Extension Host lanes — PASS
- [x] Package-input secret scan — PASS
- [x] VSIX archive allowlist — 11-entry runtime-only archive containing main
      Webview and Sidebar JS/CSS; no tests, fixtures, maps, logs, secrets, or
      user data
- [x] Packaged current/minimum install smoke — PASS

## Result and follow-up

The 0.2.1 package must retain the Activity Bar, Sidebar provider, three-entry
navigation, one-panel lifecycle, responsive surface rendering, theme switching,
Settings controls, and neutral Boss presentation while containing no 2048
production surface. Reader/EPUB fixture-driven visual checks remain explicitly
open; their Extension Host and Webview regression coverage is green.

The manual UI click-through could not be completed because Computer Use
rejected the isolated VS Code window handle as stale after re-observation.
No push, publish, Marketplace action, normal-profile write, or old-project
change was performed.
