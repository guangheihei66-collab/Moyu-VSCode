# Moyu V1 architecture

Moyu is a local-only VS Code extension with a native entry point and one
Webview UI per VS Code window.

## Runtime topology

```text
Activity Bar
    |
native Sidebar (Home / Books / Settings)
    |
one main WebviewPanel per VS Code window
    |-----------------------------|
Extension Host                 Webview
commands, files,               rendering, input,
persistence, parsing,          routing, accessible DOM
lifecycle, recovery             no Node.js file access
```

The Sidebar is an entry and light-navigation surface. Reader controllers live
only in the main panel. Opening a route reveals that panel; it does not create
a second reader surface.

## Boundaries

- `src/domain` contains pure domain types and rules.
- `src/application` owns workflows, validation, merges, and services.
- `src/infrastructure` owns bounded files, ZIP/XML parsing, indexes, caches,
  and lease-locked JSON transactions.
- `src/extension` adapts VS Code commands, context keys, Sidebar, serializers,
  panel lifecycle, and Host/Webview messages.
- `webview` renders safe text and controls. Dynamic content uses DOM text APIs;
  it never receives Node.js file access.

## Persistence and recovery

Books, logical reader progress, and settings are stored below the extension's
VS Code `globalStorage` directory. Each module uses a versioned
envelope and a short lease-locked transaction. A stale lock is quarantined
only after bounded liveness evidence; uncertain I/O fails closed. Repository
merge rules preserve unrelated concurrent updates and reject stale same-item
writes where required.

Panel and Boss state are window-local. Refresh coordination rereads shared
repositories at panel creation, restore, reveal, route navigation, and before
mutations. There is no cross-process realtime event bus, so another window can
be visually stale until one of those boundaries.

## Safety and compatibility

TXT indexes use encoded byte ranges and bounded reads. EPUB parsing is lazy,
path-canonicalized, numerically bounded, and emits text-only chapters. The
Extension Host bundle is CommonJS targeting Node 20.18 for the VS Code 1.96.0
floor; development tooling uses Node 22, and the Webview bundle targets
Chromium 128.
