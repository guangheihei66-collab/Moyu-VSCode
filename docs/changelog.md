# Development changelog

## 2026-09-01

- Removed Moyu 2048 completely in the local-only `0.2.1` release: three-entry
  Sidebar, Home/Books/Reader/Settings routes, closed protocol, Host/Webview
  bundles, and game persistence no longer contain a production game module.
- Kept legacy 2048 state files untouched and intentionally orphaned; no
  migration or user-data deletion is performed.

## 2026-08-31

- Completed the Windows current/minimum Extension Host acceptance harness.
- Added deterministic TEMP fixtures for TXT, EPUB, 2048, and multi-process
  transaction checks.
- Added the V1 user guide, architecture/decision notes, and package boundary
  documentation.

## 2026-08-30

- Completed recovery UX, lifecycle refresh coordination, and same-host panel
  session notices.

## 2026-08-29

- Completed the V1 domain, persistence, reader, EPUB, Bookshelf, settings,
  Boss Mode, and Webview implementation tasks.
