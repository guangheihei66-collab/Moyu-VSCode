# Moyu VS Code

Moyu is a local-only leisure center for Windows VS Code. V1 combines a quiet
novel reader and a reversible Boss Mode in one native Activity Bar entry.

## Install

Download the versioned `.vsix` from a trusted release, then open VS Code's
Extensions view, select `...`, choose **Install from VSIX...**, and reload when
VS Code asks. Moyu requires VS Code 1.96.0 or newer.

Moyu does not require an account, a cloud service, or a network connection at
runtime. It reads only the book file that you select through VS Code's native
file picker.

## Start developing

Requirements:

- Windows 10/11 for the V1 acceptance target.
- Node.js 22 LTS for development tooling.
- VS Code 1.96.0 or newer.

From the repository root:

```powershell
npm ci
npm run build
npm test
npm run lint
npm run format:check
```

Press **F5** in VS Code to launch an Extension Development Host. The two
automated Windows lanes are:

```powershell
npm run test:extension:current
npm run test:extension:min
```

The minimum lane downloads VS Code 1.96.0 into an isolated temporary cache.
It does not use your normal VS Code user-data or extensions directories.

Create and verify a local VSIX with:

```powershell
npm run package
```

The package command runs formatting, lint, unit tests, the extension contract,
both Extension Host lanes, a package-input secret scan, VSIX listing, archive
allowlist verification, and isolated install smoke. It never publishes or
pushes anything.

## Use Moyu

The Moyu Activity Bar entry opens a lightweight Sidebar with **Home**,
**Books**, and **Settings**. Those entries navigate one main WebviewPanel per
VS Code window; opening another entry reveals the existing panel.

The main navigation commands are:

```text
moyu.openBooks
moyu.openSettings
```

### Books and reader

Choose **Import book** from Books and select a `.txt` or `.epub` file. The
original file stays in its original location. TXT books show a bounded preview
and require explicit encoding confirmation when the encoding is ambiguous.
EPUB books are parsed into ordered, text-only chapters; active markup, remote
content, and images are not executed or loaded.

The reader stores logical block/chapter progress in Moyu's local storage, so a
source change can be detected and the nearest safe position can be recovered.
Use **Relocate** when a book has moved.

Remove from bookshelf never deletes the source file. It removes only Moyu
metadata, progress, and derived cache data after the explicit confirmation.

### Boss Mode

With a visible Moyu panel, press **Ctrl+M** to enter Boss Mode and press it
again to return. Boss Mode overlays the existing reader controller and does
not replace real editor tabs. If the panel is hidden or closed, the command is
a no-op.

The keybinding is contributed by the extension and can be reassigned in
**File > Preferences > Keyboard Shortcuts**. Search for **Moyu: Toggle Boss
Mode** if `Ctrl+M` conflicts with another command.

## Local data and privacy

Books are never copied into Moyu's application data. Versioned metadata,
progress, settings, and derived indexes are stored under the extension's VS
Code `globalStorage` directory. Cross-window writes use
short-lived lease-locked transactions; the UI may remain briefly stale until
the next documented refresh point.

Moyu is intentionally local-only. Do not put a private book, secret, password,
API key, or personal path into an issue or commit. `.env` files are excluded
from source control and from the VSIX package.

### Multi-window behavior

Moyu supports multi-window use with conflict-safe local transactions. Each
window owns its panel and Boss Mode state; another window's UI may update at
the next refresh boundary rather than immediately.

## Troubleshooting

- If the panel is not visible, run `moyu.open` from the Command Palette.
- If a TXT book looks incorrect, reopen its encoding selection and confirm the
  correct candidate.
- If two windows show different data briefly, reveal the Moyu panel or switch
  routes to trigger the declared refresh boundary.
- For a reproducible development failure, record the VS Code version, Moyu
  commit, command, and the smallest safe fixture; do not include private book
  contents or normal user-data paths.

Maintainers can use `test/acceptance/windows-v1-checklist.md` for manual theme,
high-contrast, keybinding, keyboard-only, and two-window checks.
