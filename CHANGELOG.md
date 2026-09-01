# Changelog

## 0.2.1 — 2048 removal

- Removed the Moyu 2048 feature from the Sidebar, Home, routes, protocol,
  persistence, Host/Webview bundles, and production tests.
- Kept Books, TXT/EPUB Reader, Settings, and reversible Boss Mode on the
  existing single-panel architecture.
- Legacy 2048 state files are left untouched; the extension no longer reads or
  writes them.

## 0.1.0 — V1

- Added the native Moyu Activity Bar, lightweight Sidebar, and single main
  WebviewPanel lifecycle.
- Added local TXT and safe text-only EPUB reading with logical progress.
- Added persistent 2048 and reversible, acknowledgement-gated Boss Mode.
- Added crash-safe cross-window transactions, recovery UX, and Windows
  current/minimum Extension Host acceptance lanes.
