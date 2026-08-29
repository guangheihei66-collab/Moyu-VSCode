# Moyu VS Code V1 Design

Date: 2026-08-29

Status: Approved after design review

Target platform: Windows 10 and Windows 11

Minimum VS Code engine: `^1.96.0`

Development runtime: Node.js 22 LTS for npm, build, test, lint, and packaging only

Production runtime boundary: VS Code 1.96.x Extension Host compatibility (Node 20.18); Webview compatibility with its Chromium 128 browser runtime

## 1. Product Goals

Moyu VS Code is a local-only leisure center that feels like a restrained VS Code feature. V1 provides:

- A local bookshelf for multiple TXT and EPUB novels.
- A responsive reader that restores stable logical reading positions.
- A complete, testable 2048 game with durable recovery.
- A fast, reversible boss mode contained entirely inside the Moyu Webview.
- Native discovery through an Activity Bar container and Sidebar navigation.
- F5 debugging, automated tests, reproducible builds, and VSIX packaging.

The extension requires no account, backend, network service, database server, or cloud synchronization. User files and application state remain local.

## 2. Non-Goals

V1 does not include Snake, fishing, idle games, online novel search, crawling, cloud sync, login, rankings, multiplayer, AI recommendations, advertising, backend services, or database services.

V1 EPUB does not preserve original layout or render images. V1 does not manipulate the user's real editor tabs or open fake source files. macOS, Linux, remote hosts, browser-hosted VS Code, and untested filesystem providers are not V1 acceptance targets.

## 3. User Experience

### Entry and navigation

The extension contributes a low-key Moyu icon to the Activity Bar. Selecting it opens a Sidebar view containing Home, Books, 2048, and Settings navigation plus lightweight summaries. Selecting a destination reveals the existing Moyu WebviewPanel or creates one if absent. Each VS Code window owns at most one Moyu panel.

The main WebviewPanel contains the full-width reader and 2048 interface. The Sidebar remains an entry and navigation surface, not a second implementation of the application.

### Reader journey

The user imports a local TXT or EPUB through a VS Code file picker. Import records the source URI and metadata without copying the source novel. The bookshelf displays all imported books and allows open, continue reading, relocate, reselect encoding for TXT, and remove from bookshelf.

Reading uses continuous scrolling. Previous Page and Next Page scroll by the current visible viewport; persisted progress uses logical blocks and offsets rather than pixels. Chapter and percentage indicators are informational and navigational.

### 2048 journey

The user opens 2048 from Sidebar or Home, moves with arrow keys or WASD, starts a new game explicitly, and can continue after reaching 2048. Board and score survive panel disposal and VS Code restart.

### Boss journey

When a Moyu panel exists and is visible, the configurable `moyu.toggleBossMode` command toggles `NORMAL` and `BOSS_MODE`. The default Windows keybinding is `Ctrl+M`. Entering boss mode overlays the current module with the selected local TypeScript, JSON, or Build Log template and temporarily changes the panel title. The Webview is not reloaded and the underlying module is not destroyed. A second invocation restores the exact module state and a reasonable logical focus.

If no Moyu panel is open or visible, the boss key has no effect on the editor and does not open Moyu. README documentation warns about the existing VS Code `Ctrl+M` conflict and explains keybinding reassignment.

## 4. Architecture

The system has four explicit layers:

1. **VS Code integration:** activation, commands, Activity Bar view, context keys, panel lifecycle, dialogs, and notifications.
2. **Application services:** bookshelf, reader, indexing, EPUB parsing, 2048 persistence coordination, boss state machine, and module repositories.
3. **Infrastructure:** VS Code `globalState` for noncritical preferences, transactional files under `globalStorageUri` for conflict-sensitive state, filesystem adapters, lock files, crash-safe writes, encoding decoder, schema migrations, and logging.
4. **Webview application:** router, reader UI, 2048 UI, boss overlay, settings UI, and typed message client.

Dependencies point inward. Pure domain modules do not import `vscode`, DOM APIs, Node filesystem APIs, or storage implementations. VS Code and Webview adapters depend on shared domain contracts.

The main panel is disposable. Correct restoration depends on persisted logical state, not on `retainContextWhenHidden`. When supported and beneficial, retaining context while merely hidden is an optimization, never the source of truth.

## 5. Extension Host

The Extension Host owns all privileged operations:

- Registers `moyu.open`, `moyu.openBooks`, `moyu.open2048`, `moyu.openSettings`, and `moyu.toggleBossMode`.
- Sets `moyu.isOpen`, `moyu.isVisible`, and `moyu.isBossMode` context keys for the current window.
- Creates and reveals one `WebviewPanel` per window and registers a serializer for window reload restoration.
- Provides the Sidebar navigation provider.
- Opens file pickers and validates local file URIs.
- Reads TXT/EPUB files, builds indexes, parses content, and never exposes arbitrary filesystem access to the Webview.
- Owns persistence repositories, migrations, conflict handling, cache cleanup, and user-facing errors.
- Validates every Webview message before dispatch.
- Broadcasts committed module changes to Webview sessions hosted by the same Extension Host.

Activation is command/view driven, not `*`. The extension declares support for untrusted workspaces because it reads only files explicitly selected by the user, never executes workspace or book content, and never invokes workspace tasks or shells.

## 6. Webview

The Webview uses Vanilla TypeScript, HTML, and CSS bundled by esbuild. It is split by responsibility:

- Shell and router
- Shared message client and state store
- Home and Sidebar-facing navigation contracts
- Bookshelf
- TXT/EPUB reader
- 2048 presentation/controller
- Boss overlay
- Settings
- Theme and accessibility utilities

UI construction uses static HTML templates for trusted shell markup and DOM APIs such as `createElement`, `textContent`, and `replaceChildren` for dynamic content. Untrusted novel data, titles, paths, error details, and stored settings never enter `innerHTML`.

The Webview uses VS Code theme variables, semantic markup, visible focus indicators, ARIA labels, keyboard navigation, reduced-motion support, and high-contrast testing. It contains no Node integration and cannot read local files directly.

## 7. Message Protocol

Shared TypeScript contracts define discriminated unions with a protocol version, message ID, Webview session ID, request type, and validated payload. Representative Webview-to-Host requests are:

- `app/ready`
- `app/navigate`
- `books/list`
- `books/import`
- `books/remove`
- `books/relocate`
- `books/selectEncoding`
- `reader/open`
- `reader/readBlocks`
- `reader/saveProgress`
- `reader/navigateChapter`
- `game2048/load`
- `game2048/save`
- `game2048/newGame`
- `settings/read`
- `settings/update`
- `boss/setMode`

Host-to-Webview messages are either correlated success/error responses or events such as `books/changed`, `reader/progressChanged`, `game2048/changed`, `app/stateSnapshot`, and `boss/modeChanged`.

Runtime guards reject unknown protocol versions, unknown message types, missing fields, messages larger than 1 MiB after UTF-8 JSON serialization, invalid board shapes, invalid URIs, invalid numeric ranges, and messages from stale session IDs. Errors returned to the Webview use stable error codes and safe display messages; raw stack traces and local file contents are not exposed.

The protocol transports structured text blocks, not raw EPUB HTML or file handles. Large TXT content is requested in bounded chunks. Every request handler maps to one explicit service operation.

## 8. Novel Reader

### Data model

`BookMetadata` contains `id`, `title`, serialized URI, `type`, confirmed encoding for TXT, file fingerprint, `addedAt`, `lastOpenedAt`, and metadata version.

`ReadingProgress` is keyed by `bookId` and contains a type-specific logical locator, percentage, `updatedAt`, and per-book version:

- TXT locator: logical block ID, character offset within the block, and nearby content fingerprint for recovery.
- EPUB locator: chapter ID, paragraph index, character offset, and nearby content fingerprint.

`ReaderSettings` contains font size, line height, content width, preferred TXT block target size, default TXT encoding choice, and version metadata.

### Identity and relocation

First import assigns a UUID. A normalized URI lookup prevents duplicate records while preserving the UUID as permanent identity. Windows file URI comparison normalizes separators and uses filesystem-appropriate case-insensitive comparison without lowercasing URIs on every platform. Relocation updates the URI while retaining `bookId` and progress, then invalidates derived indexes when fingerprints differ.

Removing a book deletes metadata, progress, and derived indexes only. It never deletes the source file. User-facing text says “Remove from bookshelf.” Multi-window removals use tombstones so stale windows cannot resurrect a removed record.

### Rendering and navigation

The Extension Host returns bounded arrays of safe blocks. The Webview virtualizes or incrementally mounts blocks around the current viewport. Progress checkpoints are debounced and written on meaningful logical-position changes, navigation, panel visibility loss, and disposal. Pixel scroll position may be kept only in Webview session memory as a short-lived convenience.

## 9. TXT Strategy

### Encoding selection

Import examines a small bounded prefix:

1. BOM determines UTF-8, UTF-16LE, or UTF-16BE.
2. Without BOM, strict UTF-8 validation is attempted.
3. Invalid UTF-8 produces a GB18030 candidate preview. Successful GB18030 decoding is not treated as reliable detection because most arbitrary byte sequences are decodable.
4. On first import of that candidate, the user must confirm GB18030, select GBK, or manually select a supported UTF encoding while viewing bounded text previews.
5. No candidate is committed until confirmation. The confirmed encoding is persisted in `BookMetadata` and is reused without further guessing.
6. “Reselect encoding” shows the same explicit preview flow, invalidates the index only after confirmation, and reopens at a recovered logical location without deleting prior progress until a successful rebuild.

`iconv-lite` is the planned local decoder because it is pure JavaScript, supports streaming and GBK/GB18030, includes TypeScript declarations, and is MIT licensed. The exact dependency version is locked during Task 1 implementation setup after audit.

### Large-file index

The indexer streams bytes from the selected file without synchronously reading the entire novel. It decodes incrementally while preserving decoder boundary state, recognizes normalized paragraph boundaries, and emits compact index entries that map logical block IDs to byte ranges and decoded character boundaries.

Each index manifest binds `bookId`, serialized URI, byte size, modification time, file fingerprint sample, index schema version, and confirmed encoding. Derived index files live under `globalStorageUri`, not `globalState`. Index publication uses a temporary file plus atomic rename within the storage directory. Cancellation removes only incomplete temporary artifacts.

Opening an unchanged book reuses the index. A changed size, modification time, fingerprint, encoding, or index schema invalidates it. Rebuild runs asynchronously with progress and cancellation. Requested blocks are decoded on demand from indexed byte ranges and held in a bounded least-recently-used memory cache.

Empty files produce an explicit empty-book state. Invalid paths, permissions, truncated reads, encoding failures, and mid-read source changes return typed recoverable errors and do not mutate confirmed metadata or progress.

## 10. EPUB Strategy

EPUB is treated as an untrusted ZIP container. V1 uses the following inclusive hard limits; values above a limit are rejected before further expansion or transport:

| Resource | Maximum |
|---|---:|
| EPUB source file | 256 MiB |
| ZIP entries | 4,096 |
| One expanded ZIP entry | 16 MiB |
| Total expanded ZIP bytes | 512 MiB |
| Per-entry and aggregate compression ratio | 100:1 |
| `META-INF/container.xml` | 256 KiB |
| OPF package document | 4 MiB |
| Spine chapters | 2,048 |
| One chapter's source markup | 8 MiB |
| One chapter's sanitized UTF-8 text | 4 MiB |
| XML/HTML element nesting depth | 64 |
| One Host/Webview JSON message | 1 MiB serialized UTF-8 |

The Extension Host:

1. Validates extension, readability, ZIP structure, entry count, total expanded size, individual entry size, and compression ratio limits.
2. Reads `META-INF/container.xml` and resolves the OPF path without allowing path traversal.
3. Parses OPF manifest and spine using a non-executing XML parser.
4. Resolves only in-container chapter resources with canonical normalized paths.
5. Parses XHTML/HTML without executing it.
6. Drops scripts, styles, iframes, objects, embeds, event attributes, forms, SVG active content, external links, remote resources, media, fonts, and images.
7. Emits `chapterId`, safe title, and `paragraphs: string[]` only.

Every byte, count, ratio, depth, and message limit is checked incrementally where possible so rejection occurs before the next allocation or decompression step. Image elements are ignored or converted to the literal paragraph `[Image omitted]`; image bytes are never sent to the Webview. Entity expansion and external entity resolution are disabled.

Parsed chapter indexes and sanitized text caches may live in versioned derived storage under `globalStorageUri`. Original EPUB bytes remain at the selected URI and are not copied into extension storage.

## 11. EPUB V1 Capability Boundary

V1 supports container reading, OPF discovery, manifest/spine ordering, chapter title and text extraction, chapter list, previous/next chapter, chapter jump, and progress by chapter and paragraph locator.

V1 does not support original EPUB CSS, JavaScript, iframe, audio, video, custom fonts, active SVG, remote images/resources, automatic external links, embedded interaction, DRM, complex layout, columns, original themes, or body images. Unsupported content is ignored safely without failing the remaining text flow where possible. Complete EPUB visual fidelity and controlled image support are future features, not partial V1 promises.

## 12. 2048 Architecture

The 2048 domain engine is a pure TypeScript module. It accepts a board, direction, and injected RNG and returns a new immutable state plus move events. It has no DOM, VS Code, storage, clock, or global randomness dependency.

Rules include a 4x4 board, one merge per tile per move, score accumulation, spawn only after an effective move, deterministic empty-cell selection under injected RNG, victory at 2048, game-over detection, and continued play after victory when selected.

`Game2048State` contains `gameSessionId`, board, score, bestScore, won, gameOver, move sequence, started/updated timestamps, and state version. Starting a game explicitly creates a new UUID session. Persistence is debounced after valid moves and flushed on visibility loss/disposal. The Webview renders the board and animation from engine events; the persisted board is authoritative for recovery.

Keyboard handling is scoped to the visible 2048 surface. Arrow keys and WASD call the same controller operation. Inputs are ignored in boss mode, during modal decisions, or when focus is inside unrelated controls.

## 13. Boss Mode

The window-local state machine has two states: `NORMAL` and `BOSS_MODE`. It is idempotent and serializes rapid toggle requests so an even number of accepted toggles returns to the original state.

Entering boss mode:

- Captures current route, module state reference, logical focus token, and scroll anchor.
- Sets the window-local mode before notifying the Webview.
- Applies an inert/hidden boundary to the normal interaction region.
- Pauses nonessential animation and timers.
- Reveals an accessible overlay containing the selected static template.
- Changes the Panel title to `extension.ts`, `settings.json`, or `build.log` according to the selected template.
- Sets `moyu.isBossMode`.

Exiting reverses the overlay, title, context key, paused activities, logical focus, and scroll anchor without reconstructing the module. 2048 and reader state objects remain alive. Boss mode does not persist globally; after panel disposal or window reload the safe startup mode is `NORMAL` while durable reader/game state restores normally.

`moyu.toggleBossMode` is contributed with Windows `Ctrl+M` and a `when` clause requiring both `moyu.isOpen && moyu.isVisible`. The command handler independently checks the live panel state because context keys are UI gating, not a security boundary. No DOM-level global shortcut is hardcoded.

If Moyu is absent or hidden, the command is a no-op. It never opens Moyu, closes editors, changes real files, creates tabs, changes VS Code layout, or steals Windows foreground focus. A future opt-in Hard Disguise Mode may use a temporary virtual document, but is excluded from V1.

## 14. Persistence

### Storage placement

Conflict-sensitive state is stored as separate versioned JSON files beneath `globalStorageUri/state/`:

- `bookshelf.json`
- `reading-progress.json`
- `game2048.json`

`readerSettingsState`, the global schema metadata, and noncritical presentation preferences may use `globalState`. `globalState` is not used as a compare-and-swap primitive: the VS Code `Memento` API exposes `get`, `keys`, and `update`, but no atomic conditional update or transaction.

`globalStorageUri` also stores derived TXT indexes, sanitized EPUB chapter caches, bounded cache metadata, transaction recovery files, and migration backups. Raw full novels, Webview DOM, timers, panel handles, focus, boss mode, Webview session IDs, and current visibility are not persisted as global truth.

### Cross-process file transaction

Each critical state file has its own short-lived lease lock file. Lock metadata is `{ ownerToken, pid, acquiredAt, renewedAt }`, where `ownerToken` is a UUID and is the authoritative lock identity. Every critical read-modify-write operation follows this Windows V1 protocol:

1. Acquire the module lock using exclusive file creation (`wx`). If it exists, retry with bounded jitter for at most 5 seconds. Failure returns `STATE_LOCK_TIMEOUT`; reaching the timeout never authorizes takeover.
2. A holder renews `renewedAt` about every 2 seconds. A lease is stale only after 30 seconds without renewal. Any unexpired lease is never taken over, including when its holder is live but slow.
3. Stale recovery first reads the owner metadata. PID/liveness is auxiliary evidence only; a contender may proceed only when the lease has expired and the owner is clearly absent. If owner death cannot be determined reliably, it does not force recovery and returns `STATE_LOCK_TIMEOUT` after the acquisition deadline.
4. Recovery contenders atomically rename `module.lock` to `module.lock.stale.<uuid>`. Only the contender whose rename succeeds performs recovery; it then returns to the normal exclusive-acquire path. No contender blindly deletes or overwrites the canonical lock.
5. Under the acquired lock, recover an interrupted transaction, read the latest validated state, validate the caller's `baseVersion`, and apply the module-specific merge or rejection rule.
6. Write the complete next envelope to a same-directory uniquely named temporary file, flush and close it, rotate the prior validated file to a recovery backup, and atomically rename the temporary file to the canonical module filename.
7. Re-read and validate the committed generation before returning it.
8. Before release, re-read the canonical lock and delete it only when its on-disk `ownerToken` exactly equals the holder token. A mismatched or unreadable token must not release the lock.

The critical mutation sequence is therefore: acquire, read latest, validate `baseVersion`, merge or reject, write a unique temporary file, flush/close, rotate the recovery backup, same-directory rename, re-read/validate the committed generation, then release. Large TXT indexing, EPUB parsing, large-file scanning, UI waits, and user-input waits are always completed outside the critical lock; the lock protects only short state transactions.

Critical readers also acquire the same module lock, so they never observe the brief Windows replacement sequence. On startup or lock acquisition, recovery selects the highest valid generation from canonical, backup, and completed temporary candidates; invalid candidates are quarantined rather than silently accepted. All transaction paths are confined to `globalStorageUri` and use same-volume renames. No IPC server, daemon, Registry, or OS-global mutex is introduced.

### Versioned envelopes and merge rules

Each module envelope has `schemaVersion`, module `version`, `generation`, and `updatedAt`. Version comparison and persistence occur inside the file lock; versions are conflict inputs, not a claim of CAS by themselves.

- Bookshelf merges by `bookId`; additions are unioned; removals create versioned tombstones retained long enough to prevent stale resurrection.
- Reading progress has a separate version per `bookId`; conflicts for the same book retain the later valid logical checkpoint by timestamp and record a diagnostic conflict event. Different books merge independently.
- Reader settings use last-write-wins at the field-envelope level.
- 2048 best score always merges with `max`.
- Board updates are accepted only for the active `gameSessionId` and increasing move sequence. Explicit new-game creation atomically changes the active session. Stale session board writes are rejected with “The game was restarted in another window”; their observed score may still raise `bestScore`.

Migrations are pure, version-by-version transformations performed under the corresponding lock with validation and a recoverable backup. Corrupt state falls back per module, not by erasing all Moyu data.

## 15. Multi-window Data Semantics

Bookshelf, progress, reader settings, 2048 state, best score, and schema version are user-global. Panel existence, visibility, boss mode, focus, temporary UI, and Webview session ID are window-local.

VS Code desktop windows normally have separate Extension Host processes. The official `Memento` surface does not expose atomic compare-and-swap, and `globalState.update` does not provide a dependable cross-window subscription bus. In-process event emitters cannot cross process boundaries. Therefore V1 uses per-module filesystem transactions for correctness and does not claim reliable real-time cross-window broadcasting.

Within one Extension Host, a Webview session registry broadcasts committed changes immediately. Across windows, every critical mutation runs under its module lock and rereads the latest file before merge. Panels refresh module state when created, restored, revealed, focused through a user action, navigated, and immediately before a mutation. A low-frequency visibility-scoped refresh may improve freshness but is not correctness-critical.

This model serializes critical cross-process read-modify-write transactions and provides deterministic crash recovery without introducing IPC servers, lock daemons, filesystem watchers as a protocol, or distributed-system machinery. It does not make all UI state realtime: two windows may display temporarily stale information until the next refresh point, but a stale mutation cannot bypass the locked merge rules.

## 16. Security

The Webview uses `enableScripts: true` only because interactive modules require it. `localResourceRoots` contains only the extension's packaged Webview assets. All resources use `webview.asWebviewUri`.

Each HTML document has a fresh cryptographic nonce and CSP equivalent to:

```text
default-src 'none';
style-src webview-csp-source;
script-src 'nonce-<generated>';
connect-src 'none';
object-src 'none';
frame-src 'none';
base-uri 'none';
form-action 'none';
```

V1 contains no image or custom-font rendering, remote resources, or network requests, so CSP grants neither `img-src` nor `font-src`; both fall back to `default-src 'none'`. Inline event handlers, `eval`, dynamic code construction, unsafe `innerHTML`, and executable EPUB content are forbidden. Message payloads are validated at runtime and capped at 1 MiB serialized UTF-8. File access is limited to URIs explicitly selected or relocated by the user. Paths are not interpolated into shell commands. The extension never executes novel content.

ZIP extraction is logical and bounded; entries are read by validated canonical names rather than extracted into user directories. Logs redact full content and avoid exposing sensitive paths in normal telemetry. V1 does not add telemetry.

## 17. Error Handling

Services return typed result objects or throw typed domain errors at adapter boundaries. Stable codes include:

- `BOOK_NOT_FOUND`
- `BOOK_PERMISSION_DENIED`
- `BOOK_CHANGED`
- `ENCODING_AMBIGUOUS`
- `ENCODING_INVALID`
- `TXT_INDEX_INVALID`
- `EPUB_INVALID_CONTAINER`
- `EPUB_LIMIT_EXCEEDED`
- `EPUB_UNSUPPORTED_DRM`
- `STATE_CONFLICT`
- `STATE_LOCK_TIMEOUT`
- `STATE_CORRUPT`
- `GAME_SESSION_STALE`
- `PROTOCOL_INVALID`

Errors state what failed and provide bounded actions such as Relocate, Reselect Encoding, Rebuild Index, Retry, Remove from Bookshelf, or Start New Game. Failed operations do not overwrite the last confirmed metadata, progress, index, or game state. Background work supports cancellation and reports progress for long scans.

## 18. Testing

Tests use a fast TypeScript unit runner selected during skeleton implementation, VS Code's maintained extension test tooling for integration tests, and deterministic fixtures generated inside the test tree.

Required suites include:

- 2048 moves in four directions, merge rules, no double merge, spawn, score, no-op move, game over, victory, continue, deterministic RNG, session conflict, serialization, and recovery.
- TXT BOM detection, strict UTF-8, mandatory first-confirmation previews after invalid UTF-8, manual UTF/GB18030/GBK selection, no silent GB candidate commit, streaming decoder boundaries, indexing, block reads, large-file behavior, empty file, invalid path, file mutation, logical progress, relocation, and boundary navigation.
- EPUB container/OPF/spine/title/text extraction, missing resources, chapter navigation, progress, path traversal, external entities, scripts, event attributes, remote resources, images, malformed markup, and each numeric security limit at `limit - 1`, `limit`, and `limit + 1`. Size tests use mocked metadata or sparse fixtures where allocating the full limit would be wasteful.
- Persistence serialization, module migrations, corrupt module fallback, tombstones, per-book progress merge, settings last-write-wins, best-score max, and game-session rejection.
- Cross-process transactions verify exclusive acquisition, a 5-second timeout returning `STATE_LOCK_TIMEOUT`, 2-second heartbeat prevention of false stale takeover, a 30-second stale threshold, crashed-owner recovery, no takeover of a live but slow owner, refusal when owner death is uncertain, exactly one stale-quarantine winner, wrong-token release refusal, competing-process serialization, stale `baseVersion`, same-module serialization, different-module independence, temp-write failure, every commit crash window, corrupt canonical recovery, and recovery of the highest valid generation.
- Boss enter, exit, rapid toggles, hidden/absent no-op, title restoration, focus token restoration, timer pause/resume, and reader/game identity preservation.
- Protocol valid mappings, unknown version/type, malformed payload, exactly 1 MiB payload acceptance, over-1-MiB rejection, stale session, and safe error mapping.
- Extension integration for activation, commands, context keys, file picker cancellation, Sidebar-to-Panel navigation, serializer restoration, and VSIX smoke installation.

The runtime matrix has two mandatory lanes. The current development VS Code is used for daily F5 and integration coverage. An isolated downloaded VS Code `1.96.0` test instance runs activation compatibility plus Webview, TXT, 2048, and Boss Mode smoke tests. Windows 10 and Windows 11 manual acceptance additionally covers import, reading, restart recovery, keybinding reassignment, theme variants, high contrast, and multiple VS Code windows. The project may continue to declare `engines.vscode: ^1.96.0` only while the minimum-version smoke lane passes.

## 19. Project Structure

The planned structure keeps files focused:

```text
Moyu-VSCode/
├── .vscode/
│   ├── launch.json
│   └── tasks.json
├── docs/superpowers/
│   ├── specs/
│   └── plans/
├── src/
│   ├── extension/
│   │   ├── activation.ts
│   │   ├── commands.ts
│   │   ├── contextKeys.ts
│   │   ├── panel/
│   │   └── sidebar/
│   ├── application/
│   │   ├── books/
│   │   ├── reader/
│   │   ├── game2048/
│   │   ├── boss/
│   │   └── persistence/
│   ├── domain/
│   │   ├── books/
│   │   ├── reader/
│   │   ├── game2048/
│   │   └── shared/
│   ├── infrastructure/
│   │   ├── storage/
│   │   ├── filesystem/
│   │   ├── txt/
│   │   └── epub/
│   └── shared/protocol/
├── webview/
│   ├── shell/
│   ├── books/
│   ├── reader/
│   ├── game2048/
│   ├── boss/
│   ├── settings/
│   └── styles/
├── test/
│   ├── unit/
│   ├── fixtures/
│   └── extension/
├── media/
├── scripts/
├── package.json
├── tsconfig.extension.json
├── tsconfig.webview.json
├── eslint.config.js
└── README.md
```

The structure is planned, not created in the design phase. Large responsibilities are split by domain and adapter rather than accumulated in one extension or Webview file.

## 20. Build / Debug

Extension Host and Webview assets have separate TypeScript/esbuild entry points and deliberately different runtime targets:

- Extension Host bundle: esbuild `platform: 'node'`, `target: 'node20.18'`; TypeScript `target: 'ES2022'`, `lib: ['ES2022']`, with Node 20.18 and VS Code 1.96 typings. Production code must not use Node 22-only runtime APIs.
- Webview bundle: esbuild `platform: 'browser'`, `target: 'chrome128'`; TypeScript `target: 'ES2022'`, `lib: ['ES2022', 'DOM', 'DOM.Iterable']`, without Node types.
- Node.js 22 LTS is only the reproducible development toolchain for npm, build, test, lint, and package. It is not the production Extension Host runtime.

Shared protocol and pure domain types compile under both targets without importing environment-specific APIs. The two bundles are not unified under `esnext`.

Planned scripts include:

- `npm run build`: clean production bundles and type-check both targets.
- `npm run watch`: concurrent incremental Extension Host and Webview builds.
- `npm test`: all deterministic unit tests.
- `npm run test:extension`: Extension Development Host integration tests.
- `npm run lint`: ESLint.
- `npm run format:check`: formatter verification.
- `npm run package`: validated VSIX creation.

`.vscode/launch.json` launches an Extension Development Host after the watch task. The extension manifest uses `engines.vscode: ^1.96.0`, `@types/vscode` instead of the deprecated `vscode` package, explicit activation events, and Windows keybindings with context clauses.

## 21. Packaging

Packaging uses the maintained VS Code extension packaging CLI as a pinned development dependency. A packaging allowlist excludes tests, fixtures not needed at runtime, sources if maps are omitted, caches, logs, credentials, `.env`, and development artifacts. It includes compiled Extension Host code, Webview assets, media, README, license, changelog, and package metadata.

The prepackage gate runs clean install from the lockfile, lint, formatting check, unit tests, extension tests where supported, production build, license review, secret scan, package-content listing, and VSIX smoke installation in an isolated VS Code profile. No publish or remote push occurs without separate approval.

## 22. V1 Acceptance Criteria

V1 is accepted on Windows 10/11 when all of the following are demonstrated:

1. F5 opens an Extension Development Host and the Activity Bar Moyu entry opens one main panel.
2. Multiple TXT books can be imported without copying originals; BOM and strict UTF-8 paths behave deterministically, while invalid UTF-8 always presents a GB18030 candidate preview and requires explicit confirmation or manual encoding selection before metadata is committed.
3. A large TXT opens through a reusable asynchronous index without synchronously loading the entire file; logical progress survives viewport resizing, panel close, and VS Code restart.
4. Missing or moved files show Relocate and preserve identity/progress after successful relocation.
5. EPUB imports produce safe ordered chapters and text-only reading; malicious and unsupported active content does not execute or load, and every published byte/count/ratio/depth/payload limit passes boundary tests.
6. Removing a book never deletes the source file.
7. 2048 supports arrows/WASD, valid merges, scoring, best score, new game, victory/continue, game over, and exact recovery after restart.
8. `Ctrl+M`, while the Moyu panel is visible, instantly overlays the selected disguise without reconstructing reader or game state; the second toggle restores module, position, title, and focus.
9. `Ctrl+M` while Moyu is absent or hidden does not open Moyu or change the real editor. Users can rebind the command.
10. Competing Windows Extension Host processes serialize critical module transactions through the specified lease locks; heartbeat, live-slow-holder, timeout, single-winner quarantine, wrong-token release, competing-process, commit-crash, and highest-generation recovery tests pass, and conflicts cannot silently lower best score, resurrect books, lose newer progress, or overwrite a newer game session.
11. Light, dark, high-contrast, keyboard, and reduced-motion checks pass.
12. `npm test`, `npm run build`, lint, formatting checks, extension integration tests, and VSIX packaging pass from a clean checkout.
13. The VSIX installs in isolated current-development and VS Code 1.96.0 profiles. VS Code 1.96.0 passes activation, Webview, TXT, 2048, and Boss Mode smoke flows offline; only then may `engines.vscode: ^1.96.0` remain declared.

## 23. Cross-platform Readiness

V1 is formally tested only on Windows 10/11. Core modules use `vscode.Uri`, Node `path`, injected filesystem adapters, and platform-aware URI comparison. They do not hardcode drive letters, backslashes, Registry access, shell commands, or Windows APIs. Keyboard behavior is declared through commands and keybindings, not DOM or OS-global hooks.

Future macOS/Linux support requires:

- CI and manual testing on case-sensitive and case-preserving filesystems.
- File URI canonicalization and relocation tests for symlinks, mounted volumes, and permission models.
- macOS `Cmd+M` conflict evaluation and Linux desktop keybinding checks.
- Native dialogs, high contrast, font rendering, keyboard layout, and accessibility verification.
- global storage, multi-window, suspend/resume, and packaging tests on each platform.
- Documentation of supported remote/WSL scenarios after explicit testing.

No platform-specific behavior is claimed until that matrix passes.

## 24. Future Extension Points

The boundaries permit future games through independent pure engines and Webview modules, additional local disguise templates, optional controlled EPUB images, richer EPUB layout, optional Hard Disguise Mode using temporary virtual documents, macOS/Linux qualification, export/import of settings, and additional local reading formats.

These extensions must reuse the typed protocol, storage repositories, CSP, module lifecycle, and boss-state contracts. They do not justify adding V1 abstractions without a current consumer.

## 25. Design Self-Review

- **Requirements:** All requested V1 systems, exclusions, platform scope, encoding support, EPUB boundary, multi-window semantics, build/debug, packaging, and acceptance flows are represented.
- **Consistency:** Sidebar is consistently an entry/navigation surface; the single panel is the only main content surface. Boss mode is always window-local and in-Webview.
- **Scope:** No future game, network, backend, AI, cloud, original EPUB rendering, or hard disguise implementation enters V1.
- **File responsibility:** Domain, application, infrastructure, VS Code adapters, Webview modules, and shared protocol have separate ownership.
- **Security:** Novel and EPUB input never becomes executable HTML; CSP grants only packaged styles and nonce scripts, with no image, font, frame, object, form, or network source. Every parser and message limit is numeric and boundary-testable.
- **EPUB complexity:** The design stops at ordered, sanitized text chapters and deliberately omits layout and images.
- **Boss restoration:** The normal module is retained, durable state is independent of DOM lifetime, and focus/scroll restoration use logical tokens.
- **Cross-process race:** Critical state uses per-module exclusive lease locks with 2-second heartbeat and 30-second expiry. A 5-second wait never authorizes takeover; expired locks require clear owner absence and atomic single-winner quarantine. Latest read, validation/merge, durable temporary write, same-directory rename, validation, and token-checked release occur inside the lock. Readers share the lock and interrupted generations recover the highest valid generation. `globalState` is not presented as CAS.
- **TXT encoding:** Invalid UTF-8 only creates a GB18030 preview candidate. First import requires confirmation, and no successful decode is treated as high-confidence detection.
- **EPUB limits:** Source, ZIP, XML, OPF, chapter, text, nesting, ratio, and protocol limits are concrete and tested at boundaries.
- **Runtime compatibility:** Node 22 is development-only; Extension Host and Webview bundles target Node 20.18 and Chromium 128 separately. The `^1.96.0` claim is gated by an isolated VS Code 1.96.0 activation/Webview/TXT/2048/Boss smoke lane.
- **Multi-window complexity:** Conflicts are module-specific, refresh is honest about cross-process limits, and no IPC subsystem is introduced.
- **Ambiguity:** Minimum VS Code version, supported encodings, storage placement, conflict rules, commands, platform acceptance, and non-goals are concrete.

## References

- VS Code Webview API and security guidance: https://code.visualstudio.com/api/extension-guides/webview
- VS Code Webview UX guidance: https://code.visualstudio.com/api/ux-guidelines/webviews
- VS Code Extension API reference: https://code.visualstudio.com/api/references/vscode-api
- VS Code Workspace Trust guidance: https://code.visualstudio.com/api/extension-guides/workspace-trust
- iconv-lite package and license: https://www.npmjs.com/package/iconv-lite
- iconv-lite supported encodings: https://github.com/ashtuchkin/iconv-lite/wiki/Supported-Encodings
