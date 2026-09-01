# Moyu V1 decisions

## 2026-08-29 — Keep one main panel per window

The Activity Bar and Sidebar remain native entry/navigation surfaces. Reader,
settings, and Boss Mode share one main WebviewPanel so lifecycle, focus,
serializer, and visibility state have one owner.

## 2026-09-01 — Remove 2048 without deleting legacy state

The 0.2.1 product surface removes 2048 from the Sidebar, Home, routes,
protocol, Host/Webview bundles, and persistence. Existing legacy game state is
not deleted or migrated; it is intentionally orphaned because the extension no
longer reads or writes it. Books, Reader, Settings, Boss Mode, and the shared
lease/transaction infrastructure remain unchanged.

## 2026-08-29 — Keep shared state in locked local files

Module repositories use versioned JSON envelopes and short lease-locked
transactions under VS Code `globalStorage`. This keeps the product local,
supports cross-window conflict handling, and avoids an unbounded in-memory
authority.

## 2026-08-29 — Treat EPUB as text-only input

ZIP/XML/HTML parsing is behind fixed numerical limits and canonical paths.
Chapter output contains sanitized text and image placeholders; original HTML,
scripts, styles, remote resources, and active content are never rendered.

## 2026-08-30 — Use CommonJS at the VS Code floor

The Extension Host bundle remains CommonJS and targets Node 20.18. This keeps
the declared VS Code `^1.96.0` compatibility claim aligned with the runtime;
ESM is not required by the product architecture.

## 2026-08-31 — Gate packaging with an archive allowlist

The VSIX contains only compiled runtime assets, the manifest, README, license,
and the Moyu icon. Source, tests, development dependencies, caches, maps,
logs, and secret-like files are rejected by both `.vscodeignore` and the
post-package verifier.
