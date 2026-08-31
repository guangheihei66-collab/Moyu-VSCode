# Moyu VS Code V1 UI Redesign Implementation Plan

Date: 2026-08-31
Status: Proposed for implementation review
Spec: `docs/superpowers/specs/2026-08-31-moyu-vscode-ui-redesign.md`
Target branch: `feature/moyu-v1-implementation`

This is a plan for a later implementation pass. The current planning pass
creates this document and the linked design spec only; it does not modify
production code, install dependencies, build a VSIX, or change the current
version `0.1.0`.

## Plan goal

Redesign the Presentation Layer of the completed Moyu V1 while preserving the
existing Activity Bar → Sidebar → single WebviewPanel topology, typed
Host/Webview protocol, durable services, parser and indexing boundaries,
cross-process persistence rules, and Boss restoration semantics.

The implementation uses Vanilla TypeScript, DOM APIs, CSS, and the existing
esbuild/Vitest toolchain. It adds no frontend framework, design system
dependency, font, backend, database, or network capability.

## Global implementation rules

1. Begin every task from a clean checkpoint on
   `feature/moyu-v1-implementation`. Inspect `git status`, the relevant
   ledger entry, and the current source before writing the first test.
2. Tasks 1–10 follow RED → minimal implementation → focused GREEN → full
   regression → review → fix → verify → commit. Task 11 is evidence-first
   integrated verification and does not require an artificial RED run. Task 12
   is release/package verification plus isolated observable manual acceptance.
3. Keep the active worktree
   `D:\Moyu\Moyu-VSCode\.worktrees\moyu-v1-implementation`. Do not modify
   `D:\Moyu\Thief-Book-VSCode`, push, merge main, publish, or delete user
   data.
4. Do not use `git reset --hard`, `git clean`, `git restore`, checkout of
   another development branch, or broad generated-file cleanup.
5. Do not add npm dependencies. The existing Vanilla TypeScript, HTML, CSS,
   esbuild, Vitest, and custom DOM-test stubs are sufficient.
6. Dynamic titles, paths, chapter text, error messages, and template data must
   continue to render through `textContent` or safe DOM construction. No
   dynamic value may enter `innerHTML`.
7. Theme-sensitive colors must be VS Code variables. No hardcoded color
   literal, external font, gradient, glass surface, glow, or saturated brand
   palette may enter the redesigned CSS.
8. The Sidebar is navigation and summary only. It must never mount a complete
   Reader, Settings form, or 2048 board.
9. A task is not complete until its focused tests, listed regression gates,
   review, commit, progress ledger, and `docs/HANDOFF.md` checkpoint are
   updated. An in-progress task must be recorded as in progress with its
   current failure and next exact action.
10. No production implementation begins until the user approves the written
    spec and this plan.

## Existing contracts that must remain green

The following are regression gates for every task that touches Webview or
Host wiring:

| Gate | Required protection |
| --- | --- |
| Unit suite | Existing unit tests remain present and pass; DOM selector changes may assert the redesigned behavior but may not remove functional assertions. |
| Message protocol | Envelope version, request ID, session ID, runtime validation, safe errors, and the 1 MiB serialized UTF-8 limit remain enforced. |
| TXT | Encoding confirmation, streaming index, bounded block reads, fingerprints, logical locators, progress merge, and source-change recovery remain unchanged. |
| EPUB | ZIP/XML/HTML limits, canonical paths, text-only sanitization, cache binding, chapter identity, and EPUB locator recovery remain unchanged. |
| 2048 engine | Pure move rules, spawn, score, victory, game over, continuation, session identity, sequence, best-score merge, and persistence remain unchanged. |
| Persistence | Per-module leases, timeout and heartbeat rules, crash recovery, tombstones, repository transactions, and multi-window conflict behavior remain unchanged. |
| Single panel | One `WebviewPanel` per window, reveal instead of duplicate creation, disposal cleanup, serializer restore, and context keys remain unchanged. |
| Boss | NORMAL/BOSS_MODE state, acknowledgement, hidden/absent no-op, title mapping, inert overlay, controller identity, logical focus, and restoration remain unchanged. |
| Minimum runtime | Current and VS Code 1.96.0 Extension Host lanes remain green; production bundles retain Node 20.18 and Chromium 128 targets. |
| Packaging | Runtime-only VSIX allowlist, secret scan, packaged asset references, Sidebar Webview declaration, and isolated install smoke remain green. |

## Task 1: UI tokens and shared components

### Files

Create:

- `webview/components/dom.ts`
- `webview/components/Icon.ts`
- `webview/components/Button.ts`
- `webview/components/SectionHeader.ts`
- `webview/components/EmptyState.ts`
- `webview/components/ProgressBar.ts`
- `webview/components/ActionMenu.ts`
- `webview/components/Modal.ts`
- `webview/components/components.css`
- `webview/styles/tokens.css`

Modify:

- `webview/styles/base.css`
- `webview/styles/theme.css`

Test:

- `test/unit/webview/components.test.ts`
- `test/unit/webview/themeTokens.test.ts`

### Interfaces and constraints

The shared helpers expose small DOM contracts:

```ts
createText(document: Document, tag: string, text: string): HTMLElement
createButton(document: Document, options: ButtonOptions): HTMLButtonElement
createProgress(document: Document, options: ProgressOptions): HTMLElement
ActionMenu.mount(anchor: HTMLButtonElement, items: readonly MenuItem[]): void
Modal.open(options: ModalOptions): void
Modal.close(): void
```

The exact public names may remain focused, but every helper must accept safe
text and typed callbacks rather than HTML strings. `ActionMenu` owns Escape,
focus movement, selected item state, and focus return. `Modal` owns labelled
dialog structure, focus return, and a reduced-motion path.

`tokens.css` defines the six spacing steps, 4/6 px radii, control height,
content maximum, reader default width, motion durations, focus ring, and
aliases to VS Code variables. `base.css` imports tokens, shared components,
feature styles, and the existing reader-setting variables in a deterministic
order.

### Package contract

Add tests for:

- semantic native button and label output;
- safe text rendering when a title contains markup-looking text;
- menu keyboard order, Escape close, and focus return;
- dialog role, accessible name, focus return, and close behavior;
- progress text fallback and clamped display;
- required token names and absence of theme color literals.

### Expected failure

The RED run fails because the shared component modules and token layer do not
exist, the current CSS has no shared token imports, and the existing fallback
focus colors violate the new static CSS assertion.

### Implementation

Implement the shared DOM primitives with `createElement`, `append`,
`replaceChildren`, attributes, and `textContent`. Keep icon glyphs local and
decorative; do not load a Codicon font or an external asset. Use native
`button`, `input`, `select`, and dialog-compatible elements. Add visible focus,
hover, selected, disabled, high-contrast, forced-colors, and reduced-motion
rules using the token aliases.

Do not move feature-specific state or service calls into shared components.
Components report typed user intent to their owner view.

### GREEN test

Run:

```powershell
npm test -- --run test/unit/webview/components.test.ts test/unit/webview/themeTokens.test.ts
npm run build
npm run lint
npm run format:check
```

Expected result: focused component and token tests pass; both production
bundles build; lint and formatting pass.

### Regression

Run existing Reader, Settings, 2048, Boss, CSP, and Router Webview tests. Check
that the main CSS still imports all existing feature styles and that no
domain, service, protocol, or Host file changed in this task.

### Commit and handoff

Commit:

```text
feat: add Moyu presentation tokens and shared components
```

Update the ledger and `docs/HANDOFF.md` with the commit, tests, known issues,
and Task 2 as the next exact action.

## Task 2: Native Sidebar redesign

### Files

Create:

- `webview/sidebar/main.ts`
- `webview/sidebar/SidebarView.ts`
- `webview/sidebar/sidebar.css`
- `src/extension/sidebar/sidebarHtml.ts`
- `test/unit/webview/sidebar.test.ts`
- `test/unit/extension/sidebarProvider.test.ts`

Modify:

- `src/extension/sidebar/MoyuSidebarProvider.ts`
- `src/shared/protocol/messages.ts`
- `src/shared/protocol/validate.ts`
- `webview/styles/base.css`
- `esbuild.mjs`
- `test/extension/suite/sidebar.test.ts`

### Interfaces and constraints

Add the presentation route `home` to the existing `AppSection` union while
retaining `books`, `reader`, `game2048`, and `settings`. Define a closed
Sidebar section union containing only `home`, `books`, `game2048`, and
`settings`.

The Sidebar view and provider use:

```ts
interface SidebarViewModel {
  active: 'home' | 'books' | 'game2048' | 'settings';
  booksCount: number;
  bestScore: number;
}

type SidebarMessage = {
  type: 'navigate';
  section: SidebarViewModel['active'];
};

class SidebarView {
  render(model: SidebarViewModel): void;
  focusActive(): void;
}

class MoyuSidebarProvider {
  setActiveSection(section: SidebarViewModel['active']): void;
  setSummary(summary: Pick<SidebarViewModel, 'booksCount' | 'bestScore'>): void;
}
```

The host provider validates the message before calling
`PanelRegistry.openOrReveal(windowId, section)`. A summary refresh failure
does not block navigation. `moyu.open` continues to open Books for command
compatibility; Sidebar Home is the new Home entry.

### RED test

Add tests that require:

- Webview behavior: Home, Books, 2048, and Settings, selected/hover/focus
  states, keyboard activation, and one typed navigation message;
- provider behavior: exact View ID, Webview lifecycle, listener disposal,
  nonce/CSP, and packaged JS/CSS URI references;
- real Extension Host behavior: manifest declaration, runtime registration,
  provider resolution, and production Sidebar asset existence/load through the
  expected resource boundary.

The provider shell is not required to contain the four visible labels. Do not
duplicate production Sidebar markup just to satisfy a label-string assertion.

### Expected failure

The RED run fails because the current provider emits three browser-default
buttons in one inline HTML string, has no Home route, has no dedicated bundle,
and has no selected-state or summary contract.

### Implementation

Create the small browser Sidebar bundle and package its JS/CSS beneath the
existing `dist/webview` runtime boundary. `sidebarHtml.ts` emits only trusted
shell markup with a deny-by-default CSP, a nonce-bearing script, and resource
URIs derived through `asWebviewUri`.

`SidebarView` renders a semantic `nav` with compact entries and decorative
icons. Use shared component styles and VS Code selection/list-hover/focus
variables. Preserve the current WebviewView contribution and runtime View ID
exactly; this task must not revert the `type: "webview"` integration fix.

The provider stores the current model, refreshes the active item when a host
command navigates the panel, and disposes listeners when the WebviewView or
extension context is disposed. It never constructs a Reader, 2048, or
Settings controller.

### GREEN test

Run:

```powershell
npm test -- --run test/unit/webview/sidebar.test.ts test/unit/extension/sidebarProvider.test.ts test/unit/extension/panelRegistry.test.ts
npm run build
npm run test:extension:current
npm run test:extension:min
```

Expected result: four-entry Sidebar behavior passes in unit tests and both
real Extension Host lanes; the Sidebar bundle is present in the build.

### Regression

Run manifest, CSP, activation, navigation, single-panel, serializer, and
packaged Sidebar provider tests. Verify `package.json` still declares
`moyu.sidebar` with `type: "webview"`, and the runtime registration argument
is character-for-character `moyu.sidebar`.

### Commit and handoff

Commit:

```text
feat: redesign Moyu native Sidebar navigation
```

Update the ledger and `docs/HANDOFF.md`; the next action is Task 3 Home.

## Task 3: Home and overview snapshot adapter

### Files

Create:

- `webview/home/HomeView.ts`
- `webview/home/HomeController.ts`
- `webview/home/home.css`
- `src/extension/panel/PresentationSnapshotProvider.ts`
- `test/unit/webview/home.test.ts`
- `test/unit/extension/presentationSnapshot.test.ts`

Modify:

- `src/shared/protocol/messages.ts`
- `src/shared/protocol/validate.ts`
- `webview/shell/router.ts`
- `webview/shell/main.ts`
- `webview/shell/app.ts`
- `webview/shell/messageClient.ts`
- `src/extension/panel/SettingsMessageDispatcher.ts`
- `src/extension/panel/PanelController.ts`
- `src/extension/activation.ts`
- `test/unit/webview/router.test.ts`
- `test/unit/extension/panelControllerSettings.test.ts`

### Interfaces and constraints

Add validated `HomeSnapshot` and `PresentationBook` DTOs as defined by the
Spec. The Host-side adapter has this read-only boundary:

```ts
interface PresentationSnapshotProvider {
  readHome(): Promise<HomeSnapshot>;
  readBooks(): Promise<BookshelfSnapshot>;
}
```

The adapter receives existing bookshelf, progress, game, and file-stat
services. It joins by `bookId`, derives count, recent ordering, percentage,
best score, and source-missing status, and returns a safe projection. It does
not write state, copy books, or add a persistence schema.

Add `home/read` → `home/snapshot` to the existing closed protocol. Extend
`MessageClient` with `readHome()` and keep all requests correlated to the
current Webview session. `Router` accepts `home` while retaining the existing
route subscription behavior.

`HomeView` renders Continue Reading, Quick Access, Recent Books, and useful
empty states. Its callbacks report typed route or book actions to
`HomeController`; it does not call VS Code APIs directly.

### RED test

Add tests for:

- Home route registration and navigation;
- Continue Reading title, percentage, chapter label, and Continue action;
- recent book ordering and quick-access count/best score;
- no-book, no-progress, and no-game states;
- safe title rendering and no raw path/source content in the snapshot;
- Host adapter joining bookshelf/progress/game data without mutation;
- correlated `home/read` response handling.

### Expected failure

The RED run fails because `home` is not an accepted route, `createApp` falls
back to a text heading for Books, no Home view or snapshot client exists, and
the current dispatcher has no Home response.

### Implementation

Introduce the additive DTOs and validators without changing envelope shape,
session checks, or size limits. Extend `SettingsMessageDispatcher` only at its
dispatch boundary or delegate to the injected presentation provider; keep
domain and repository logic outside the Webview.

Mount `HomeController` in `createApp` and keep `app.ts` as a coordinator. Home
actions route to Books, 2048, or Reader through the existing single-panel
router. The Import action routes to Books so the existing native picker and
source-preserving workflow remains authoritative.

The adapter formats no user-facing path details and returns empty optional
fields when no durable data exists. It must not make a failed summary read
prevent the panel from opening.

### GREEN test

Run:

```powershell
npm test -- --run test/unit/webview/home.test.ts test/unit/webview/router.test.ts test/unit/extension/presentationSnapshot.test.ts test/unit/extension/panelControllerSettings.test.ts
npm run build
npm run lint
npm run format:check
```

Expected result: Home renders all specified states, the adapter is read-only,
and route/message tests pass.

### Regression

Run all current Webview tests, protocol validation/outbound tests, panel
lifecycle tests, Sidebar tests, and full unit regression. Confirm
`moyu.openBooks` still opens Books and `moyu.open` retains its existing Books
behavior.

### Commit and handoff

Commit:

```text
feat: add Moyu Home presentation
```

Update the ledger and `docs/HANDOFF.md`; the next action is Task 4 Bookshelf.

## Task 4: Bookshelf presentation and safe actions

### Files

Modify:

- `webview/books/bookCard.ts`
- `webview/books/BookshelfView.ts`
- `webview/books/BookshelfController.ts`
- `webview/books/bookshelf.css`
- `src/extension/panel/SettingsMessageDispatcher.ts`
- `src/extension/panel/PanelController.ts`
- `webview/shell/app.ts`
- `webview/shell/messageClient.ts`

Test:

- `test/unit/webview/bookshelf.test.ts`
- `test/unit/webview/components.test.ts`
- `test/unit/extension/panelControllerRecovery.test.ts`
- `test/extension/suite/bookImport.test.ts`

### Interfaces and constraints

Define a safe Bookshelf view model containing `bookId`, title, type,
percentage, last-opened timestamp, source-missing state, and optional chapter
label. Keep book identity and source URI operations in the existing Host
services.

`BookshelfView` exposes:

```ts
render(snapshot: BookshelfSnapshot): void;
setQuery(query: string): void;
setFilter(filter: 'all' | 'txt' | 'epub'): void;
```

`BookshelfController` continues to route Import, Open, Relocate, Reselect
encoding, and Remove actions through the existing validated message/client
boundary. It may use the current Extension Host picker helpers, but it must
not implement file access or confirmation policy in the DOM.

### RED test

Add or update tests for:

- compact row structure and type/progress/last-read metadata;
- local case-insensitive search and All/TXT/EPUB filters;
- source-missing Relocate action;
- overflow menu action set, including TXT-only Reselect encoding;
- exact `Remove from bookshelf` wording and absence of destructive wording;
- empty library, no-search-match, and no-filter-match states;
- title/path-looking text rendered inertly;
- picker cancellation, explicit removal confirmation, and no source unlink.

### Expected failure

The RED run fails because the current view always shows `Bookshelf`, a large
card with a displayed path, a row of exposed browser buttons, no query/filter
state, no empty-state copy, and no integrated `books/list` snapshot flow.

### Implementation

Build a compact header, search field, type filter, row/card list, and overflow
menu from shared components. Keep the source-preserving confirmation text
visible and stable. Use `sourceMissing` to make Relocate the primary recovery
action and keep the original identity.

Wire the existing `books/list`, import, relocation, encoding, removal, and
reader-open operations through the panel dispatcher. If a response is needed
for refresh, return a validated `BookshelfSnapshot`; do not create a second
bookshelf repository. Update the Home snapshot after a committed mutation at
the existing refresh boundary.

Use text-only secondary metadata and avoid displaying a full local path in
the normal row unless an existing recovery flow explicitly needs it. No source
file is deleted by a UI action.

### GREEN test

Run:

```powershell
npm test -- --run test/unit/webview/bookshelf.test.ts test/unit/webview/components.test.ts test/unit/extension/panelControllerRecovery.test.ts test/extension/suite/bookImport.test.ts
npm run build
npm run lint
npm run format:check
```

Expected result: Bookshelf unit and Host workflow tests pass with the exact
safe wording and cancellation semantics.

### Regression

Run book identity/service, TXT encoding, EPUB cache/service, progress, storage,
protocol, refresh, and all existing Bookshelf tests. Verify duplicate import,
relocation identity, tombstones, encoding confirmation, and source-file
nondeletion remain covered.

### Commit and handoff

Commit:

```text
feat: redesign Moyu Bookshelf presentation
```

Update the ledger and `docs/HANDOFF.md`; the next action is Task 5 Reader.

## Task 5: Reader shell, typography, and toolbar

### Files

Create:

- `webview/reader/readerModel.ts`
- `test/unit/webview/readerToolbar.test.ts`

Modify:

- `webview/reader/ReaderView.ts`
- `webview/reader/ReaderController.ts`
- `webview/reader/reader.css`
- `webview/shell/app.ts`
- `webview/shell/router.ts`
- `webview/shell/messageClient.ts`
- `webview/styles/base.css`

Test:

- `test/unit/webview/readerView.test.ts`
- `test/unit/webview/blockWindow.test.ts`
- `test/unit/webview/readerToolbar.test.ts`

### Interfaces and constraints

Define presentation-only models that can represent TXT and EPUB without
changing the domain locators:

```ts
interface ReaderPresentationModel {
  bookId: string;
  title: string;
  type: 'txt' | 'epub';
  percentage: number;
  chapterTitle?: string;
  paragraphs: readonly string[];
  atStart: boolean;
  atEnd: boolean;
}
```

`ReaderController` keeps its current `open`, bounded block loading, logical
anchor, pause/resume, and state-capture methods. `ReaderView` owns header,
toolbar, content column, progress, previous/next controls, and safe paragraph
rendering. It does not persist pixel scroll positions.

### RED test

Add tests for:

- Back to Books and title/chapter/percentage header;
- centered bounded content structure and paragraph spacing hooks;
- overflow trigger and low-frequency action labels;
- previous/next controls and disabled boundary states;
- dynamic paragraph text remaining inert;
- focus/progress logical anchor retention;
- toolbar quieting hooks and hover/focus restoration;
- existing viewport page movement and bounded block window.

### Expected failure

The RED run fails because the current ReaderView is only a `role="feed"` with
paragraphs, has no header or toolbar, uses generic spacing, and has no
presentation model for title, type, progress, or EPUB content.

### Implementation

Add the Reader shell around the existing block/content renderer. Use the
reader setting variables for font size, line height, and content width. Add a
main content maximum near 1100 px and a default reader width of 720 px with a
fluid fallback for narrow panels.

Use one low-key toolbar with Back, context, percentage, and overflow. Keep the
toolbar and progress in the DOM when visually quiet. Restore full opacity on
hover and `:focus-visible`. Preserve `ReaderController` logical locators and
the module lifecycle callbacks used by Boss Mode.

Do not add a TXT chapter detector, change block indexing, or alter the
`reader/saveProgress` semantics.

### GREEN test

Run:

```powershell
npm test -- --run test/unit/webview/readerView.test.ts test/unit/webview/blockWindow.test.ts test/unit/webview/readerToolbar.test.ts
npm run build
npm run lint
npm run format:check
```

Expected result: Reader shell, safe text rendering, content width, logical
focus, paging, and toolbar tests pass.

### Regression

Run TXT index/read/progress tests, Reader service tests, Settings tests,
Router/app lifecycle tests, Boss restoration tests, protocol tests, and the
current/minimum Extension Host lanes. Capture and restore a populated Reader
logical locator through a route and Boss transition.

### Commit and handoff

Commit:

```text
feat: redesign Moyu Reader presentation
```

Update the ledger and `docs/HANDOFF.md`; the next action is Task 6 EPUB
chapter navigation.

## Task 6: EPUB chapter navigation UI and Host adapter

### Files

Create:

- `webview/reader/ChapterDrawer.ts`
- `src/extension/panel/EpubPresentationAdapter.ts`
- `test/unit/webview/epubChapterView.test.ts`

Modify:

- `src/shared/protocol/messages.ts`
- `src/shared/protocol/validate.ts`
- `src/extension/panel/SettingsMessageDispatcher.ts`
- `src/extension/panel/PanelController.ts`
- `src/extension/activation.ts`
- `webview/shell/messageClient.ts`
- `webview/shell/app.ts`
- `webview/reader/ReaderController.ts`
- `webview/reader/ReaderView.ts`
- `test/unit/extension/settingsMessageDispatcher.test.ts`
- `test/unit/epub/EpubReaderService.test.ts`
- `test/extension/suite/restartRecovery.test.ts`

### Interfaces and constraints

Add the exact closed request/response families:

- `reader/listChapters` → `reader/chapters`;
- `reader/openChapter` → `reader/chapter`;
- `reader/navigateChapter` with `previous` or `next` → `reader/chapter`.

Chapter responses contain only chapter ID, title, position, content
fingerprint, and bounded paragraph text. `reader/opened` gains safe title,
type, and percentage metadata. `reader/saveProgress` routes an EPUB locator
to the existing `EpubReaderService` and a TXT locator to the existing TXT
ReaderService.

`src/extension/panel/EpubPresentationAdapter.ts` is the only new EPUB
presentation boundary. It consumes the existing `EpubReaderService` and
projects safe chapter summaries and text into the typed protocol DTOs. Task 6
must not modify `EpubReaderService.ts` or add UI-specific methods to it; EPUB
parser/security limits, cache identity, chapter identity, and progress
semantics remain untouched.

`ChapterDrawer` exposes:

```ts
open(chapters: readonly EpubChapterSummary[], currentId: string): void;
close(): void;
focusTrigger(): void;
```

It renders an accessible `aside` with chapter buttons, `aria-current`, Escape
close, `aria-expanded`, and focus return. It never creates a VS Code tab.

### RED test

Add tests for:

- ordered chapter list and current marker;
- opening/closing the drawer and focus return;
- Escape handling and keyboard chapter selection;
- exact chapter ID request and text-only chapter render;
- previous/next boundary handling;
- malformed chapter response rejection;
- no image, HTML, script, CSS, or remote resource node in the Webview.

### Expected failure

The RED run fails because the current protocol has no chapter response family,
the active Dispatcher supports only TXT Reader operations, activation does not
provide an EPUB presentation adapter to the panel, and the Reader has no drawer.

### Implementation

Instantiate the existing `EpubReaderService` in activation with the existing
`EpubParser`, `EpubCache`, progress repository, and book provider. Construct an
`EpubPresentationAdapter` around it and inject the adapter through the panel's
Host module services. Add only the adapter dispatch and runtime validators
required to expose its already safe text chapter output. Do not modify
`EpubReaderService.ts` or add UI-specific methods to the service.

Keep all EPUB numerical limits, canonical archive paths, sanitization, cache
fingerprints, and progress recovery unchanged. The drawer is view-only
navigation; chapter content remains text paragraphs through `textContent`.

When a chapter changes, update the Reader model and logical EPUB locator. The
drawer is inert while Boss Mode is active and is disposed with the Reader
view.

### GREEN test

Run:

```powershell
npm test -- --run test/unit/webview/epubChapterView.test.ts test/unit/extension/settingsMessageDispatcher.test.ts test/unit/epub/EpubReaderService.test.ts
npm run build
npm run test:extension:current
npm run test:extension:min
```

Expected result: chapter UI and adapter tests pass, ordered text-only EPUB
navigation works in both Extension Host lanes, and no parser boundary changes
are required.

### Regression

Run all EPUB security and limit tests, TXT Reader tests, protocol outbound and
validation tests, restart recovery, panel serializer, Boss restoration, and
package build checks. Confirm no raw EPUB markup crosses the 1 MiB protocol
boundary and no EPUB source bytes are copied into Webview state.

### Commit and handoff

Commit:

```text
feat: add accessible EPUB chapter navigation
```

Update the ledger and `docs/HANDOFF.md`; the next action is Task 7 2048.

## Task 7: 2048 presentation redesign

### Files

Modify:

- `webview/game2048/Game2048View.ts`
- `webview/game2048/Game2048Controller.ts`
- `webview/game2048/game2048.css`
- `webview/styles/base.css`

Test:

- `test/unit/webview/game2048View.test.ts`
- `test/unit/webview/game2048Keyboard.test.ts`
- `test/unit/webview/bossOverlay.test.ts`

### Interfaces and constraints

Keep `Game2048Controller` transport, `captureState`, `captureFocus`,
`captureAnchor`, pause/resume, dispose, and restore methods unchanged in
meaning. Keep `Game2048View`'s 16-cell semantic grid and callbacks:

```ts
type Game2048ViewCallbacks = {
  onMove(direction: Direction): void;
  onNewGame(): void;
  onContinue(): void;
};
```

The presentation adds compact Score/Best blocks, a bounded board, keyboard
help, secondary New Game action, and internal labelled modal states. Tile
styles use theme tokens and contrast steps, never rainbow or brand colors.

### RED test

Add tests for:

- score and best labels with accessible values;
- 16 cells and data-value styling hooks;
- compact control order and responsive class/state hooks;
- win and Game Over dialog labels and buttons;
- no browser alert invocation;
- board-only arrow/WASD routing and paused/Boss inert behavior;
- focus return after Continue or New Game.

### Expected failure

The RED run fails because the current view places raw spans and controls with
minimal layout, exposes no compact stat structure, has a basic dialog without
focus handling, and has no theme-derived tile presentation contract.

### Implementation

Refine DOM structure and CSS only. Keep board values in `textContent`, keep
the board focus target, and route all moves through the existing controller.
Use opacity, border, text weight, and VS Code surface variables for tile
levels. Keep Score/Best above the board in narrow panels and controls below
the board.

Use the shared Modal behavior for victory and Game Over while preserving the
existing Continue semantics. Do not change `src/domain/game2048`,
`Game2048Service`, session IDs, move sequence, or persistence.

### GREEN test

Run:

```powershell
npm test -- --run test/unit/webview/game2048View.test.ts test/unit/webview/game2048Keyboard.test.ts
npm run build
npm run lint
npm run format:check
```

Expected result: 2048 visual and keyboard tests pass without changing the
engine or transport contract.

### Regression

Run every pure game-engine, game-session, storage, Boss, Router, and
Extension Host restart test. Verify a saved board, score, best score, session
ID, and move sequence are identical before and after route/Boss presentation
changes.

### Commit and handoff

Commit:

```text
feat: refine Moyu 2048 presentation
```

Update the ledger and `docs/HANDOFF.md`; the next action is Task 8 Settings.

## Task 8: Settings form and template preview

### Files

Modify:

- `webview/settings/SettingsView.ts`
- `webview/settings/settings.css`
- `webview/shell/app.ts`
- `webview/styles/base.css`

Test:

- `test/unit/webview/settingsView.test.ts`
- `test/unit/webview/themeTokens.test.ts`
- `test/unit/reader/settings.test.ts`
- `test/unit/extension/panelControllerSettings.test.ts`

### Interfaces and constraints

Retain `SettingsView.render(settings)` and the existing
`ReaderSettingsService.read/update` versioned boundary. Extend the view with
typed optional reset and preview callbacks without moving persistence into the
DOM.

The form contains Reading and Boss Mode sections. Every field has a label,
description, current output, and native control. The range controls keep the
existing exact ranges:

- Font size: 12–32, step 1;
- Line height: 1.2–2.2, step 0.05;
- Content width: 480–1200, step 20.

Boss template options remain exactly `typescript`, `json`, and `buildLog`.

### RED test

Add tests for:

- section headings and field descriptions;
- current range value outputs and live thumb/value updates;
- keyboard-operable native ranges and select;
- template selection updating static text preview;
- reset returning only reading fields to defaults;
- persistence using the current base version;
- failed update reread and safe status;
- high-contrast focus/border hooks and no color literals.

### Expected failure

The RED run fails because the current view is a single ungrouped section,
labels have no descriptions or outputs, the select displays internal names,
there is no static preview or reset action, and range changes are only visible
through the browser thumb.

### Implementation

Create clear section headers, descriptions, output elements, and styled native
controls. Update value output on `input`; send the typed patch at the existing
safe update boundary. On update failure, keep the existing service reread and
safe status behavior.

Map internal template IDs to TypeScript, JSON, and Build Log labels. Render
`BOSS_TEMPLATES` as text in a code-style preview and never read user source
files. Implement Reset reading settings by submitting the current default
field values through the existing service; do not reset books, progress, game,
or Boss state.

### GREEN test

Run:

```powershell
npm test -- --run test/unit/webview/settingsView.test.ts test/unit/webview/themeTokens.test.ts test/unit/reader/settings.test.ts test/unit/extension/panelControllerSettings.test.ts
npm run build
npm run lint
npm run format:check
```

Expected result: settings controls, output values, preview, reset, persistence,
and safe error behavior pass.

### Regression

Run protocol, preferences repository, refresh coordinator, panel lifecycle,
Boss template, accessibility, and all Webview tests. Confirm field-level
merge and cross-window settings behavior remain unchanged.

### Commit and handoff

Commit:

```text
feat: redesign Moyu Settings presentation
```

Update the ledger and `docs/HANDOFF.md`; the next action is Task 9 Boss.

## Task 9: Boss neutral overlay presentation

### Files

Modify:

- `webview/boss/BossOverlay.ts`
- `webview/boss/boss.css`
- `webview/boss/templates.ts`
- `webview/shell/app.ts`
- `webview/shell/moduleLifecycle.ts`

Test:

- `test/unit/webview/bossOverlay.test.ts`
- `test/unit/boss/restoration.test.ts`
- `test/unit/extension/panelControllerSettings.test.ts`
- `test/extension/suite/bossMode.test.ts`

### Interfaces and constraints

Keep `BossOverlay.show(template)` and `hide()` semantics and the existing
`ModuleLifecycle.capture/resume` contract. Preserve template IDs and title
mapping exactly:

```ts
typescript → extension.ts
json       → settings.json
buildLog   → build.log
```

The active overlay's visible and accessible presentation must not contain
`Moyu`, `Boss Mode`, `Fake`, `Disguise`, `Game`, or `Novel`. Use a neutral
accessible name and local static text. The normal region remains inert and
hidden while it is active.

### RED test

Add tests for:

- neutral document structure and title mapping;
- absence of all forbidden identity words in visible and accessible output;
- static template text rendered through `textContent`;
- one persistent overlay reused across template changes;
- focus entry, focus return, inert normal region, and hidden overlay;
- Reader controller/state object identity before and after exit;
- 2048 controller/state object identity before and after exit;
- Ctrl+M acknowledgement and title/context restoration.

### Expected failure

The RED run fails because the current accessible label contains Boss Mode,
the overlay is a minimally styled full-page `pre`, and the new neutral layout,
focus-return, and forbidden-word assertions are not present.

### Implementation

Style the existing overlay as a neutral editor-like document with a compact
header line only when that line does not expose a forbidden identity. Keep the
actual content static and local. Replace any identity-bearing accessible label
with the neutral name approved by the Spec.

Do not add a second state machine, reload the Webview, reconstruct Reader or
2048 modules, alter panel title acknowledgement, or change Ctrl+M command
gating. Keep module snapshots, logical anchors, scroll, focus, and state
identity intact.

### GREEN test

Run:

```powershell
npm test -- --run test/unit/webview/bossOverlay.test.ts test/unit/boss/restoration.test.ts test/unit/extension/panelControllerSettings.test.ts
npm run test:extension:current
npm run test:extension:min
```

Expected result: neutral overlay, restoration, acknowledgement, title, focus,
and context tests pass in both Extension Host lanes.

### Regression

Run all Boss state-machine/service tests, Reader/2048 state tests, hidden and
disposed panel lifecycle tests, serializer restore tests, protocol validation,
and full unit regression. Verify Boss presentation changes do not affect the
existing panel state machine.

### Commit and handoff

Commit:

```text
feat: refine Moyu neutral Boss presentation
```

Update the ledger and `docs/HANDOFF.md`; the next action is Task 10 polish.

## Task 10: Responsive, accessibility, and theme polish

### Files

Modify:

- `webview/styles/tokens.css`
- `webview/styles/base.css`
- `webview/styles/theme.css`
- `webview/components/components.css`
- `webview/sidebar/sidebar.css`
- `webview/home/home.css`
- `webview/books/bookshelf.css`
- `webview/reader/reader.css`
- `webview/game2048/game2048.css`
- `webview/settings/settings.css`
- `webview/boss/boss.css`
- `webview/shell/app.ts`
- `webview/shell/ErrorView.ts`

Create:

- `test/unit/webview/accessibilityPresentation.test.ts`

Modify tests:

- `test/unit/webview/themeTokens.test.ts`
- `test/unit/webview/components.test.ts`
- `test/unit/webview/sidebar.test.ts`
- `test/unit/webview/home.test.ts`
- `test/unit/webview/bookshelf.test.ts`
- `test/unit/webview/readerView.test.ts`
- `test/unit/webview/epubChapterView.test.ts`
- `test/unit/webview/game2048View.test.ts`
- `test/unit/webview/settingsView.test.ts`
- `test/unit/webview/bossOverlay.test.ts`

### Interfaces and constraints

Freeze the shared layout tokens from the Spec: 4/8/12/16/24/32 px spacing,
4–6 px radii, 120/180 ms motion, approximately 1100 px main maximum, and
720 px Reader default. Every surface, control, border, focus ring, modal, and
2048 tile uses an alias to VS Code theme variables.

Responsive behavior must cover narrow Sidebar, narrow main panel, normal
panel, and wide panel. Use fluid widths and CSS media queries; do not add a
fixed 1200 px page.

### RED test

Add structural and CSS tests for:

- required token names and VS Code variable aliases;
- no known hardcoded theme colors, gradients, external fonts, or network
  sources;
- visible focus on every interactive surface;
- semantic labels and `aria-current`/`aria-expanded`/`aria-controls` states;
- forced-colors/high-contrast hooks;
- reduced-motion rules;
- narrow layout class/media hooks for Sidebar, Books, Reader, and 2048;
- ErrorView preserving safe text and bounded recovery action semantics.

### Expected failure

The RED run fails because the current CSS uses scattered `rem` values, a few
hardcoded focus fallbacks, incomplete responsive rules, and no shared
accessibility structural assertions across the redesigned surfaces.

### Implementation

Normalize styles around the token layer. Add explicit selected/hover/focus
states, wrap and stack rules, high-contrast borders, forced-colors behavior,
and reduced-motion overrides. Keep readable line lengths and avoid hiding
critical controls. Ensure narrow layouts do not produce horizontal scroll.

Use semantic headings and labels in the view modules. Do not add visual-only
focus removal. Keep ErrorView safe and independent of feature-specific
styling.

### GREEN test

Run:

```powershell
npm test -- --run test/unit/webview/accessibilityPresentation.test.ts test/unit/webview/themeTokens.test.ts test/unit/webview/components.test.ts
npm run build
npm run lint
npm run format:check
```

Expected result: structural/theme/accessibility tests pass and all Webview
styles bundle without hardcoded theme colors.

### Regression

Run the entire Webview test directory, CSP tests, full unit regression, both
TypeScript target checks, current/minimum Extension Host lanes, and the
existing package-content static checks. Confirm no CSS change alters Reader
logical progress or 2048 keyboard routing.

### Commit and handoff

Commit:

```text
feat: polish Moyu responsive accessibility and themes
```

Update the ledger and `docs/HANDOFF.md`; the next action is Task 11 integrated
regression.

## Task 11: Integrated Presentation Layer regression

### Files

Create:

- `test/unit/webview/presentationRegression.test.ts`

Modify:

- `test/unit/webview/router.test.ts`
- `test/unit/webview/messageClient.test.ts`
- `test/unit/extension/panelRegistry.test.ts`
- `test/unit/extension/panelControllerRecovery.test.ts`
- `test/unit/extension/panelControllerSettings.test.ts`
- `test/unit/packaging/packageContents.test.ts`
- `test/extension/suite/activation.test.ts`
- `test/extension/suite/sidebar.test.ts`
- `test/extension/suite/bookImport.test.ts`
- `test/extension/suite/restartRecovery.test.ts`
- `test/extension/suite/bossMode.test.ts`
- `.superpowers/sdd/2026-08-29-moyu-vscode-v1/progress.md`
- `docs/HANDOFF.md`

### Interfaces and constraints

This task adds cross-surface assertions, not new production behavior. The
integrated test must prove:

- Sidebar Home/Books/2048/Settings navigation reaches one panel;
- Home, Books, Reader, 2048, Settings, and Boss mount/dispose without stale
  listeners or duplicate roots;
- Home and Books snapshots are projections, not new stores;
- Reader and EPUB actions use validated session messages;
- 2048 moves remain scoped and Boss makes the board inert;
- Settings output/preview and persistence remain correlated;
- Boss exit restores the same Reader/2048 state objects and logical anchors;
- provider declaration/runtime registration still match exactly.

### Integrated regression matrix

Add the full route × lifecycle × state identity matrix. Include a test that
exercises every route after a panel restore and another that toggles Boss while
a drawer or menu is open. The matrix asserts ReaderController/Game2048Controller
identity, state identity, `ModuleSnapshot`, logical locator, `gameSessionId`,
`moveSequence`, panel count, and the exact Sidebar manifest/runtime View ID.

### Run and interpretation

Run the matrix against the Tasks 1–10 implementation before changing
production code. A GREEN run is a valid result: accept it and make no
production change merely to manufacture a RED phase. If it fails, record the
actual failure and root cause in the ledger, then apply only the smallest fix
required by the already-defined contracts.

### Minimal fix only when required

When the matrix fails, make only the smallest integration fix needed to satisfy
the already-defined contracts. Prefer focused route registration, disposal,
adapter, or test-fixture corrections. Do not refactor domain or persistence
code and do not introduce a synthetic transport that bypasses the real
protocol.

### GREEN verification

Run the complete local gate:

```powershell
npm test
npm run build
npm run lint
npm run format:check
npm run test:extension:current
npm run test:extension:min
```

Expected result: every existing and new unit test passes; both Extension Host
lanes pass; bundle, lint, formatting, and type checks pass.

### Regression

Run the regression gates table at the top of this plan and explicitly record:

- full unit count and focused UI count;
- current and minimum Extension Host results;
- protocol, parser, TXT, 2048, storage, Boss, and package checks;
- any pre-existing nonzero format or dependency audit note without attributing
  it to UI code unless the diff proves otherwise.

### Commit and handoff

Commit:

```text
test: add integrated Moyu UI regression gates
```

Update the ledger and `docs/HANDOFF.md`; the next action is Task 12 packaged
and manual acceptance.

## Task 12: VSIX packaging and manual visual acceptance

### Files

Modify:

- `package.json`
- `esbuild.mjs` only if the final Sidebar asset entry requires a package
  script adjustment
- `test/unit/skeleton/build-output.test.ts`
- `test/unit/packaging/packageContents.test.ts`
- `test/extension/runTests.ts` only if packaged Sidebar smoke needs a new
  asset assertion
- `test/acceptance/windows-v1-checklist.md`
- `PROJECT_CONTEXT.md`
- `docs/HANDOFF.md`
- `.superpowers/sdd/2026-08-29-moyu-vscode-v1/progress.md`

### Interfaces and constraints

This is the release-gate task after implementation. The recommended release
version is `0.2.0`, because the completed UI redesign is a product-level
presentation change. The design phase keeps `package.json` at `0.1.0`; the
version change occurs only after Tasks 1–11 are approved and green.

The package gate must include:

- format check;
- lint;
- full unit tests;
- Extension contract tests;
- production build;
- current and VS Code 1.96.0 Extension Host lanes;
- package-input secret scan;
- VSIX listing and archive allowlist verification;
- packaged current/minimum install smoke.

The archive must contain the current main Webview bundle, Sidebar bundle and
CSS, extension bundle, media, package metadata, README, license, and changelog
only within the established runtime allowlist. No tests, fixtures, maps/logs,
secrets, development dependencies, caches, or user data may enter the VSIX.

### Package contract

Update package/build tests to require:

- version `0.2.0` at release time;
- `dist/webview/main.js`, `dist/webview/main.css`, and the Sidebar assets;
- the packaged manifest's `moyu.sidebar` Webview declaration;
- isolated current and minimum provider resolution;
- the expanded manual checklist with Home and all three theme/width groups.

Run the package contract before changing the release version. It may be GREEN
when the implementation tasks already provide every required output. If it is
not GREEN, record the actual missing output, stale archive allowlist, stale
version assertion, or incomplete isolated smoke; never force a failure and
never bypass a check by deleting it or excluding the new asset.

### Implementation

Update only the package metadata and verifier expectations required to ship
the already implemented presentation. Set the version to `0.2.0` after the
focused and integrated gates pass. Extend the manual Windows checklist to
cover Dark, Light, High Contrast, narrow/normal/wide, all seven visible
surfaces, Sidebar provider resolution, EPUB drawer, and the observable Ctrl+M
flows below. Controller/state identity and protocol snapshot assertions belong
to automated tests, not manual visual inspection.

Install the newly generated VSIX only in an isolated VS Code profile. Do not
touch the user's normal profile or global storage.

### GREEN test and manual checklist

Run:

```powershell
npm run package
```

Then manually verify in an isolated profile:

1. Install the new `moyu-vscode-0.2.0.vsix`.
2. Open the Moyu Activity Bar and confirm the Sidebar has Home, Books, 2048,
   and Settings with no data-provider error.
3. Click each Sidebar entry and confirm one main WebviewPanel is reused.
4. Verify Home, Books, Reader, 2048, Settings, and Boss in Dark, Light, and
   High Contrast themes at narrow, normal, and wide sizes.
5. Verify search/filter, import cancellation, safe removal wording, Reader
   width, EPUB drawer, 2048 modal, Settings preview/reset, and neutral Boss
   document output.
6. Reader Boss flow: open a book, move to a known chapter and position, press
   Ctrl+M, observe the neutral document, press Ctrl+M again, and confirm the
   same book, chapter, logical position, single panel, and restored title.
7. 2048 Boss flow: create a non-empty board, note the score and board, press
   Ctrl+M, observe the neutral document, press Ctrl+M again, and confirm the
   same board and score/session behavior, one panel, and no real editor tab.
8. Record the exact VS Code version, extension commit, fixture root, theme,
   and result in `test/acceptance/windows-v1-checklist.md` without private
   source paths or novel content.

Expected result: package and both isolated install lanes pass, and the manual
checklist confirms the visual four-entry Sidebar and all presentation criteria.

### Regression

Repeat every regression gate in this plan from a clean worktree. Verify the
new version does not alter protocol, persistence, TXT/EPUB safety, 2048
engine, Boss semantics, or multi-window behavior. The release is blocked if
the minimum Extension Host lane or isolated Sidebar smoke fails.

### Commit and handoff

Commit:

```text
release: package Moyu UI redesign 0.2.0
```

Update `PROJECT_CONTEXT.md`, the progress ledger, and `docs/HANDOFF.md` with
the final commit, tests, VSIX path, manual theme/width matrix, known issues,
and next maintenance action. Do not push or publish.

## Plan self-review

### Spec coverage

- Visual direction, native hierarchy, Sidebar, Home, Bookshelf, Reader, EPUB
  drawer, 2048, Settings, Boss, tokens, typography, responsive behavior,
  accessibility, animation, architecture boundaries, messages, testing, and
  manual acceptance are covered by Tasks 1–10.
- Integrated route/lifecycle/state regression is covered by Task 11.
- Package contents, version recommendation, isolated install, and manual
  visual acceptance are covered by Task 12.

### Boundary review

- No task changes TXT indexing, encoding, bounded reads, or logical progress
  rules.
- No task changes EPUB parser limits, security sanitization, cache identity, or
  text-only output.
- No task changes the pure 2048 engine, game persistence, score merge, or
  session rules.
- No task changes lease locks, transactions, repositories, tombstones,
  multi-window conflict semantics, or storage layout.
- No task creates a second Boss state machine, panel, tab, or Webview app.
- Protocol changes are additive closed DTO/request/response variants with the
  existing envelope, session, size, and safe-error guards.
- React, Vue, Svelte, Tailwind, Bootstrap, Material UI, external fonts, and
  large UI dependencies are absent from every task.

### Task sizing review

Each task has one presentation responsibility and a focused test surface. The
Host adapter work is isolated to Tasks 3, 4, and 6; it does not move services
into the Webview. Shared visual behavior is centralized in Task 1 and polished
in Task 10 rather than copied into every feature stylesheet. Task 11 is an
integration safety net, and Task 12 is the only release/manual acceptance
task.

### Scope and completion review

The proposed count is 12 tasks. The current version remains `0.1.0` during
planning. Future implementation may recommend `0.2.0` only after all UI,
regression, packaging, and isolated manual acceptance gates pass. This plan
contains no production changes in the current planning pass.
