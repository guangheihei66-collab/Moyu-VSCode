# Moyu VS Code V1 Presentation Layer / UI Redesign

Date: 2026-08-31
Status: Proposed for implementation review
Project: Moyu VS Code V1
Target branch: `feature/moyu-v1-implementation`

This document defines a presentation-layer redesign for the completed Moyu V1
implementation. It is intentionally limited to the Webview and Sidebar
presentation, the adapters that supply safe view models, and the tests needed
to protect those boundaries. It does not replace the V1 architecture or any
domain behavior.

## Current baseline

The current implementation already has the approved V1 boundaries:

- `D:\Moyu\Moyu-VSCode\.worktrees\moyu-v1-implementation` is the active
  implementation worktree.
- `webview/shell/app.ts` owns the main route and module lifecycle, with
  Reader, 2048, Settings, and Boss modules mounted below it.
- `webview/books`, `webview/reader`, `webview/game2048`, `webview/settings`,
  and `webview/boss` contain focused views and controllers, but their visual
  hierarchy is still minimal.
- `src/extension/sidebar/MoyuSidebarProvider.ts` currently emits a small
  inline navigation page. It is a WebviewView provider, not a TreeView
  provider.
- The current `AppSection` union contains `books`, `reader`, `game2048`, and
  `settings`. The redesign adds `home` as an additive presentation route;
  `reader` remains an internal main-panel route reached from a book action.
- `package.json` contributes `moyu.sidebar` as a Webview view and the runtime
  registers the same View ID. That integration and its regression coverage
  remain unchanged.

## 1. Goals

The redesign has these goals:

1. Make Moyu feel like a mature VS Code extension: approximately 80 percent
   VS Code-native visual language and 20 percent refined application polish.
2. Establish one consistent visual system for the Sidebar, Home, Bookshelf,
   Reader, 2048, Settings, and the static Boss presentation.
3. Replace browser-default-looking controls with compact, themed,
   keyboard-operable controls while preserving native HTML semantics.
4. Make the Reader content-first and comfortable for long sessions without
   allowing the content to become an uncontrolled full-width page.
5. Make Bookshelf management, empty states, progress, and safe source-file
   wording immediately understandable.
6. Make Home a useful high-frequency starting point rather than a dashboard
   containing unrelated information.
7. Provide Dark, Light, and High Contrast behavior through VS Code theme
   variables rather than a private color palette.
8. Keep reader, game, Boss, and settings state alive across presentation
   changes and preserve logical restoration behavior.
9. Keep the implementation Vanilla TypeScript, HTML, CSS, and esbuild with
   focused modules and reviewable tests.

## 2. Non-Goals

The redesign does not include:

- React, Vue, Svelte, Tailwind, Bootstrap, Material UI, a component library,
  an external font, or a new large UI dependency.
- A backend, account system, cloud synchronization, network content, AI
  recommendation service, telemetry system, or database service.
- A rewrite of TXT encoding detection, TXT indexing, bounded TXT reads, or
  logical TXT progress recovery.
- A rewrite of the EPUB ZIP, XML, HTML sanitization, numerical limits, cache,
  or security boundary.
- A change to book UUID identity, relocation semantics, tombstones, source
  file preservation, repository transactions, or cross-process lease locks.
- A change to the pure 2048 engine, session identity, persistence, best-score
  merge, move sequencing, or game conflict rules.
- A new Boss template, a virtual document, a real VS Code tab, or a second
  Boss state machine.
- A full Reader or 2048 implementation inside the Sidebar.
- Original EPUB HTML/CSS rendering, images, media, external links, active
  content, or complex layout.
- A version change during the design phase. The implementation release is
  recommended as `0.2.0` after the redesign is complete.

## 3. Visual Direction

Moyu should look as though it belongs in the VS Code ecosystem. The visual
base is the VS Code workbench language: quiet surfaces, compact rows, clear
selection backgrounds, visible focus, restrained borders, and familiar
editor-side spacing. Product polish comes from stronger hierarchy, reliable
empty states, carefully grouped controls, and better reading proportions,
not from decoration.

The redesign is flat and theme-led. It does not use large gradients, glass
surfaces, glow effects, saturated brand backgrounds, oversized icons, mobile
app cards, or game-site visual treatment. Panels, rows, menus, dialogs, and
forms use VS Code variables for foreground, background, border, selection,
input, button, widget, and focus colors.

The default density is compact enough for a narrow Sidebar and calm enough for
long reading. Hierarchy comes from heading scale, spacing, weight, alignment,
and small borders. A primary action is visually clear, while low-frequency
actions move into an overflow menu or a secondary control.

## 4. Design Principles

### Native semantics first

Use headings, landmarks, buttons, labels, lists, dialogs, and form controls
with their real HTML semantics. Style them to fit VS Code rather than
replacing them with clickable generic elements.

### Content before chrome

Home presents the next useful action. Bookshelf presents the local library.
Reader presents text. 2048 presents the board. Settings presents explicit
choices. Chrome is present but visually subordinate.

### State is durable; presentation is disposable

Webview views may be rebuilt, resized, hidden, restored, or themed again.
Durable progress, settings, books, and game state continue to come from the
existing Host services and repositories. UI-only state such as a drawer,
menu, focus target, or animation phase is local to the view.

### Safe data rendering

Book titles, chapter titles, paths, error text, and novel paragraphs are
untrusted data. They are inserted through DOM APIs and `textContent`; they are
never interpreted as HTML, CSS, script, URLs, or templates.

### One clear density system

All screens use the same spacing steps, control heights, border radii,
content-width rules, focus ring, and motion durations. A page may be denser
or more spacious because of its content, not because it invents a separate
visual language.

## 5. Information Architecture

The topology remains:

```text
Activity Bar
    ↓
Moyu Sidebar WebviewView
    ↓  navigation and lightweight summaries only
One Moyu WebviewPanel per VS Code window
    ├── Home
    ├── Books
    ├── Reader
    ├── 2048
    └── Settings
```

The Sidebar exposes four entries:

| Sidebar entry | Main-panel route | Responsibility |
| --- | --- | --- |
| Home | `home` | Continue reading, recent books, quick access |
| Books | `books` | Local bookshelf management and import |
| 2048 | `game2048` | The complete game in the main panel |
| Settings | `settings` | Reader settings and template preview |

`reader` is an internal route. Selecting Continue or Open from Bookshelf
reveals the existing main panel and navigates it to Reader. No Reader copy is
rendered in the Sidebar.

Existing command behavior is preserved: `moyu.open` and `moyu.openBooks`
continue to open the Books route, while `moyu.open2048`, `moyu.openSettings`,
and `moyu.toggleBossMode` keep their current command IDs and lifecycle rules.
The new Home route is available through Sidebar navigation and Home actions;
no replacement command is required.

Only one panel controller and one WebviewPanel exist for a window. Repeated
navigation reveals the existing panel, and navigation while Boss Mode is
active remains blocked by the existing state machine.

## 6. Sidebar

The Sidebar becomes a small, dedicated navigation WebviewView. It is not a
second application surface and never mounts the Reader, the 4x4 game board,
or the Settings form.

### Structure

```text
Moyu

Home                 selected / hover / focus state
  Overview
Books                3 books
2048                 Best 8192
Settings
```

The title is compact. Each entry is a semantic button with an icon-sized
decorative glyph and a text label. The glyph is `aria-hidden`; the text label
is the accessible name. Descriptions and summaries may collapse visually at
very narrow widths but remain available to assistive technology.

### View model and messages

The Sidebar view consumes a small safe model:

```ts
interface SidebarViewModel {
  active: 'home' | 'books' | 'game2048' | 'settings';
  booksCount: number;
  bestScore: number;
}

type SidebarMessage =
  | { type: 'navigate'; section: SidebarViewModel['active'] };
```

The provider validates the section against the closed union before calling
`PanelRegistry.openOrReveal`. The host may update the active entry after a
command or panel navigation. A missing or stale summary never prevents
navigation; it falls back to zero or a neutral label.

### States

Each item has explicit default, hover, selected, keyboard-focus, and disabled
states. Selected state uses the VS Code active-selection background and
foreground. Hover uses the VS Code list-hover background. Focus uses the
shared `--vscode-focusBorder` ring and is not removed when selected.

The provider owns all message-listener and Webview lifecycle disposables. The
HTML document uses the same deny-by-default resource discipline as the main
Webview, with packaged Sidebar assets and a nonce-bearing script.

## 7. Home

Home is a compact starting surface for high-frequency actions.

### Sections

1. **Continue Reading**: one prominent row for the most recently opened book
   with title, percentage, and an optional existing chapter label. The action
   is `Continue`.
2. **Quick Access**: two compact actions for Books and 2048. Books shows the
   local book count; 2048 shows the durable best score when a game exists.
3. **Recent Books**: a short list ordered by existing `lastOpenedAt`, with
   title, percentage, type, and Continue.

Home never includes weather, quotes, news, AI recommendations, advertising,
or unrelated statistics.

### Empty states

- No books: `Import your first book` with a direct route to Books and its
  native Import Book action.
- No reading progress: `Open a book to start reading` with a Books action.
- No 2048 session: `Start a game` with a 2048 action.

An empty state explains the next action and does not leave a large blank card
without context.

### Safe snapshot

Home receives a read-only `HomeSnapshot` assembled from existing bookshelf,
progress, and game services. The adapter joins records by `bookId`; it does
not introduce a new store or duplicate progress. It exposes IDs, safe titles,
book type, progress percentage, optional chapter label, and timestamps needed
for display. It does not expose raw novel text or a filesystem path unless a
specific existing action requires an opaque book ID.

## 8. Bookshelf

Books is the mature local-library surface.

### Header and filters

```text
Books                                      + Import Book
Your local library

[ Search books... ]
All          TXT          EPUB
```

Search is local, case-insensitive title filtering over the currently loaded
snapshot. Filters are mutually exclusive and keyboard-operable. The current
filter and query are presentation state only and are reset when the Books
view is remounted unless the browser session can safely retain them.

### Book row

Each row or compact card contains:

- title as text;
- type (`TXT` or `EPUB`);
- percentage when progress exists;
- a short last-read label derived from existing metadata;
- `Continue` or `Open` as the primary action;
- a source-missing state with `Relocate` as the recovery action;
- an overflow button with `aria-haspopup="menu"`.

The overflow menu contains exactly the applicable actions:

- Open;
- Relocate file;
- Reselect encoding for TXT only;
- Remove from bookshelf.

The removal wording is fixed. It never says `Delete book` or `Delete novel`.
The confirmation explains that metadata, progress, and derived indexes are
removed while the original TXT/EPUB file stays where it is. The existing
Extension Host confirmation and source-preserving removal path remain
authoritative.

### Empty and filtered states

An empty library says:

```text
Your bookshelf is empty
Import a local TXT or EPUB file.
Your original file stays where it is.
[ Import Book ]
```

A query with no matches says that no books match the current search and
provides a clear way to clear the query. A filter with no matches explains the
selected type.

## 9. Reader

Reader is the primary content surface. It uses a scroll-first layout with a
quiet toolbar and a centered reading column.

### Layout

```text
← Books       三体 · Chapter 12                         ⋯
              47%

                 centered reading column
                 paragraph one
                 paragraph two
                 paragraph three

‹ Previous                         47%                 Next ›
```

The main content shell has a fluid width with a maximum of approximately
900–1100 px. The text column defaults to 720 px and remains readable in the
650–820 px experience range. The existing Content Width setting remains the
source of truth; CSS constrains the result to the available viewport without
rewriting the stored value.

The body uses the existing logical block window and reader controller. Blocks
remain bounded, deduplicated, safe text. Focus and progress use logical
locators, never viewport pixels as durable state. Previous and Next use the
existing viewport paging behavior.

### Toolbar

The toolbar has a Back to Books action, book/chapter context, percentage, and
one overflow control. Low-frequency actions move into the overflow menu:

- Chapter list for EPUB;
- Reading settings;
- Relocate file;
- Book information when an existing safe metadata view can supply it.

The Reader does not add a VS Code editor tab. Errors use the existing safe
ErrorView and bounded recovery actions.

### Reading comfort

Paragraphs have comfortable line height, clear paragraph separation, and a
stable maximum line length. The reader background and text use editor theme
variables. The reader does not use a custom web font or hardcoded white page
surface.

Toolbar and progress may become visually quiet after sustained reading by
moving to an opacity between 0.45 and 0.6. They remain in the DOM, remain
keyboard reachable, and return to opacity 1 on hover or focus. Reduced-motion
users receive no opacity transition.

## 10. EPUB Chapter UI

For EPUB documents, the Reader toolbar exposes a lightweight chapter drawer
or side layer inside the same WebviewPanel. It is not a VS Code tab and does
not replace the main Reader route.

The drawer is an `aside` with a labelled heading and a list of chapter
buttons. The current chapter has a selected state and an accessible current
marker. Escape closes the drawer; the trigger exposes `aria-expanded` and
returns focus when the drawer closes. A chapter selection calls the existing
EPUB reader service through a validated adapter and rerenders the text-only
chapter.

The chapter model is limited to `{ chapterId, title, position }`. Chapter
content remains `{ paragraphs: readonly string[] }`. No original EPUB HTML,
CSS, scripts, images, fonts, media, remote resources, or active links enter
the Webview.

TXT keeps its current logical block and percentage model. The redesign does
not add a new TXT chapter detector. If a TXT title is not already available,
the Reader uses the existing title or the safe filename fallback.

## 11. 2048

2048 remains a compact, quiet VS Code-themed module.

### Layout

```text
2048

Score 4312                         Best 8192

[  2 ][  4 ][    ][    ]
[  8 ][ 16 ][ 32 ][    ]
[    ][ 64 ][128 ][    ]
[    ][    ][256 ][    ]

Arrow Keys / WASD                              New Game
```

The board remains a semantic 4x4 grid with 16 cells. Tile differentiation
uses theme-derived backgrounds, borders, weight, and contrast steps; it does
not use rainbow colors or hardcoded brand colors. Score and Best are compact
stat blocks. New Game is a secondary action.

Victory and Game Over use the existing internal modal pattern. The modal is a
real labelled dialog with Continue and New Game actions; browser `alert()` is
never used. Keyboard routing remains scoped to the focused board and is
disabled while the module is paused or Boss Mode is active.

The pure move engine, session identity, persistence, and conflict behavior
are unchanged. Resize changes the board presentation only.

## 12. Settings

Settings becomes a labelled, grouped form instead of a bare control list.

### Reading section

Each field has a visible label, one-sentence description, current value, and
styled native range control:

- Font size — `Reader text size.` — value in px;
- Line height — `Space between lines.` — numeric value;
- Content width — `Maximum reader width.` — value in px.

The value output updates immediately on range input. Persistence is sent
through the existing Settings service at the existing safe update boundary;
the UI may preview the current thumb position before the durable update
resolves. A failed update rereads the durable snapshot and shows the existing
safe status path.

### Boss Mode section

The section contains the existing three template choices only:

- TypeScript;
- JSON;
- Build Log.

The selector is a styled native `select`. A static local preview updates with
the selection and is rendered as text. It never reads the user's real code.
The preview uses the existing `BOSS_TEMPLATES` values and title mapping.

The bottom action is `Reset reading settings`. It resets only the existing
reading settings fields through the Settings service; it does not reset books,
progress, the game, or Boss state.

## 13. Boss Mode

Boss Mode keeps its existing state machine and overlay lifecycle. This redesign
changes only the presentation of the overlay and the neutral editor-like
layout around its static content.

When active, the main panel shows only the selected static local document:

- TypeScript → `extension.ts`;
- JSON → `settings.json`;
- Build Log → `build.log`.

The visible document, accessible names, headings, status text, and navigation
must not expose `Moyu`, `Boss Mode`, `Fake`, `Disguise`, `Game`, or `Novel`.
The overlay may use a neutral accessible name such as `Work document preview`.
Its text is inserted with `textContent` into a code-style preformatted region.

The normal Reader or 2048 region becomes inert and hidden without being
destroyed. The active controller, state object, logical reader anchor, game
session, focus token, and scroll anchor remain the same objects or logical
values after exit. The overlay does not reload the Webview. Ctrl+M continues to
be handled by the existing command and acknowledgement path; no DOM-level
global shortcut is introduced.

## 14. Theme Tokens

The redesign adds a small token layer in `webview/styles/tokens.css`. Tokens
define spacing and layout constants and alias all theme-sensitive colors to
VS Code variables.

### Layout tokens

| Token | Value |
| --- | --- |
| `--moyu-space-1` through `--moyu-space-6` | 4, 8, 12, 16, 24, 32 px |
| `--moyu-radius-small` | 4 px |
| `--moyu-radius-control` | 6 px |
| `--moyu-control-height` | 28–32 px presentation range |
| `--moyu-content-max-width` | 1100 px |
| `--moyu-reader-width` | 720 px default |
| `--moyu-motion-fast` | 120 ms |
| `--moyu-motion-normal` | 180 ms |

The reader setting continues to drive `--moyu-font-size`,
`--moyu-line-height`, and `--moyu-content-width`.

### Theme aliases

The token layer may alias only VS Code variables, including:

- `--vscode-editor-background` and `--vscode-editor-foreground`;
- `--vscode-sideBar-background` and `--vscode-sideBar-foreground`;
- `--vscode-descriptionForeground`;
- `--vscode-input-background`, `--vscode-input-foreground`, and
  `--vscode-input-border`;
- `--vscode-button-background`, `--vscode-button-foreground`, and
  `--vscode-button-hoverBackground`;
- `--vscode-list-hoverBackground`,
  `--vscode-list-activeSelectionBackground`, and
  `--vscode-list-activeSelectionForeground`;
- `--vscode-panel-border`, `--vscode-contrastBorder`,
  `--vscode-focusBorder`, and `--vscode-editorWidget-background`.

No CSS color literal is permitted for a theme-sensitive surface, border,
foreground, focus ring, tile, modal, or control. Dark, Light, High Contrast,
forced-colors, and missing-variable fallbacks must remain legible through
other VS Code variables rather than a private palette.

## 15. Typography

UI text inherits `--vscode-font-family` and the normal VS Code UI weight and
size rhythm. Descriptions use `--vscode-descriptionForeground` and never
compete with headings or primary actions.

Reader text continues to use the existing reader/editor font family and the
persisted font-size and line-height settings. The Reader does not load external
fonts. Boss document content uses `--vscode-editor-font-family` with a normal
monospace fallback and the existing editor font size variable.

Titles are allowed to wrap in narrow layouts. Technical metadata is muted and
breakable. Long book and chapter titles cannot force a horizontal scrollbar.

## 16. Components

The shared presentation layer is split into small DOM-oriented components:

- `dom.ts`: safe element and text helpers that do not accept arbitrary HTML;
- `Icon.ts`: a small local glyph map with decorative, labelled usage;
- `Button.ts`: primary, secondary, icon-only, and danger-intent styling while
  retaining native button behavior;
- `SectionHeader.ts`: heading, description, and optional action alignment;
- `EmptyState.ts`: message, explanation, and one bounded action;
- `ProgressBar.ts`: labelled percentage display with text fallback;
- `ActionMenu.ts`: keyboard-operable overflow menu with Escape handling;
- `Modal.ts`: labelled dialog shell with focus return and a reduced-motion
  path;
- `components.css`: shared control, menu, dialog, focus, and state styles.

Each feature directory owns its view model mapping and rendering composition:

```text
webview/
├── sidebar/
├── shell/
├── home/
├── books/
├── reader/
├── game2048/
├── settings/
├── boss/
├── components/
└── styles/
```

`webview/shell/app.ts` remains a coordinator. It does not become a single
file containing every feature's markup, styles, or data transformation.

## 17. Responsive Behavior

The layout is fluid and uses max-width constraints rather than a fixed
1200 px canvas.

### Narrow Sidebar

- The title remains visible.
- Navigation labels remain visible whenever the host width permits; summary
  text may collapse before the labels do.
- Hit targets remain at least the shared control height.
- The active and focus states remain visible without relying on color alone.

### Narrow main panel

- Page padding decreases to the smaller spacing steps.
- Header metadata wraps below the title instead of clipping.
- Bookshelf secondary metadata stacks under the primary title.
- Reader text fills the available width while respecting the configured
  content width.
- 2048 presents Score/Best above the board and controls below it.
- Dialogs and chapter drawers fit inside the viewport with no horizontal
  scrolling.

### Normal and wide main panel

- Home and Books use a content maximum of approximately 900–1100 px.
- Reader stays centered at the configured width and does not stretch to fill a
  wide monitor.
- Bookshelf rows use a single compact line where space permits and stack
  metadata when it does not.
- The board remains visually compact rather than growing without limit.

## 18. Accessibility

The implementation must preserve:

- one meaningful `h1` per route and ordered subordinate headings;
- semantic `nav`, `main`, `section`, `aside`, `ul`/`li`, `form`, and `dialog`
  structures where they describe the content;
- explicit labels for every input, select, range, menu trigger, and modal
  action;
- visible `:focus-visible` rings based on `--vscode-focusBorder`;
- keyboard navigation for Sidebar, menus, drawers, forms, Reader toolbar,
  modal actions, and the 2048 board;
- `aria-current`, `aria-expanded`, `aria-haspopup`, `aria-controls`,
  `aria-live`, `aria-busy`, and `aria-disabled` only where their states are
  real;
- focus return after a menu, drawer, or dialog closes;
- forced-colors and VS Code High Contrast borders and selected states;
- reduced-motion behavior that removes nonessential transitions and smooth
  scrolling.

Native controls remain native controls. Styling must not remove keyboard
operation, screen-reader names, focus outlines, or high-contrast affordances.

## 19. Animation

Motion is functional and restrained:

- control, selection, menu, drawer, and modal transitions use 120–180 ms;
- Reader toolbar quieting uses an opacity transition only when motion is
  allowed;
- 2048 tile movement may use the existing presentation hook but cannot change
  engine timing, move ordering, or persistence;
- no animation is required to understand a value, action, error, or selected
  state;
- `@media (prefers-reduced-motion: reduce)` disables transitions, smooth
  scrolling, and nonessential movement.

## 20. Existing Architecture Boundaries

The following boundaries are fixed:

| Existing boundary | Redesign rule |
| --- | --- |
| `src/domain/books` | Preserve UUID identity, URI comparison, type, tombstones, and source safety. |
| `src/domain/reader` and `src/infrastructure/txt` | Preserve encoding, streaming index, bounded reads, block IDs, fingerprints, and TXT logical locators. |
| `src/infrastructure/epub` and `EpubReaderService` | Preserve ZIP/XML/HTML limits, text-only output, cache binding, chapter identity, and EPUB locators. |
| `src/domain/game2048` and `Game2048Service` | Preserve pure moves, sessions, score, best score, sequence, and persistence. |
| Storage repositories and transactions | Preserve leases, merge rules, tombstones, versioning, crash recovery, and multi-window behavior. |
| `BossModeMachine` and `BossModeService` | Preserve NORMAL/BOSS_MODE semantics, acknowledgement, no-op rules, and restoration identity. |
| `PanelRegistry`, `PanelController`, serializer | Preserve one panel per window, reveal behavior, disposal, visibility, serializer NORMAL state, and context keys. |
| Typed protocol | Retain the envelope, protocol version, session validation, size limit, runtime guards, and safe error mapping. Add only closed presentation DTOs and route/action variants required by the views. |
| Build and VSIX | Keep separate Node Extension Host and browser Webview targets. A small packaged Sidebar asset may be added; the extension architecture and resource boundary do not change. |

Allowed changes are limited to view models, route registration, Host adapters
that join already persisted data, and message wiring needed to expose existing
operations to the redesigned views. No new domain aggregate or persistence
schema is introduced.

## 21. Message / State Constraints

### Additive presentation DTOs

The shared protocol will define validated, path-free presentation DTOs:

```ts
interface PresentationBook {
  bookId: string;
  title: string;
  type: 'txt' | 'epub';
  percentage: number;
  lastOpenedAt?: number;
  sourceMissing: boolean;
  chapterLabel?: string;
}

interface HomeSnapshot {
  continueReading?: PresentationBook;
  recentBooks: readonly PresentationBook[];
  booksCount: number;
  bestScore: number;
  hasGameSession: boolean;
}

interface BookshelfSnapshot {
  version: number;
  books: readonly PresentationBook[];
}

interface EpubChapterSummary {
  chapterId: string;
  title: string;
  position: number;
}
```

Percentages are clamped to 0–100 at the presentation boundary. IDs are used
for actions. Raw book paths and raw source content are not part of Home or
Sidebar snapshots.

### Exact protocol additions

The existing envelope and validation rules remain mandatory. The additive
request/response families are:

- `home/read` → `home/snapshot`;
- `books/list` → `books/snapshot`;
- `reader/listChapters` → `reader/chapters`;
- `reader/openChapter` → `reader/chapter`;
- `reader/navigateChapter` with `direction: 'previous' | 'next'` →
  `reader/chapter`.

`reader/opened` is extended only with safe document metadata (`title`, type,
and percentage). `reader/readBlocks` remains the bounded TXT block path.
`reader/saveProgress` accepts the existing TXT or EPUB logical locator union
and dispatches to the already existing service for that locator kind.

Mutation requests continue to use the existing Host workflows, validation,
correlated responses, safe errors, refresh boundaries, and source-preserving
confirmation. The Webview never receives a Node object, file handle, raw
stack trace, raw EPUB markup, or arbitrary command string.

### State preservation

- Route changes do not create a second panel or reconstruct the durable game
  or Reader controller unnecessarily.
- Home and Books snapshots are read-only projections. They do not become a
  second source of truth.
- Reader progress is still saved by logical locator and percentage through
  the existing progress repository.
- 2048 controls continue to send the existing session ID, move sequence, and
  base version. A visual re-render cannot reset the session.
- Settings changes continue through field-level versioned updates. Preview
  changes are never treated as durable until the existing update resolves.
- Boss Mode captures and restores the existing `ModuleSnapshot`; changing CSS
  or adding a drawer cannot alter module identity or destroy state.

## 22. Testing

The redesign follows RED → implementation → focused GREEN → full regression.
No existing functional test is removed because the DOM becomes more polished.
Tests may change selectors when structure changes, but they must continue to
assert behavior and safety.

### Shared and shell tests

- shared components render semantic buttons, labels, menus, dialogs, progress,
  focus, and safe text without `innerHTML` for dynamic values;
- Router accepts `home` and retains the existing four routes and route
  subscription behavior;
- the main app mounts and disposes Home, Books, Reader, 2048, Settings, and
  Boss without changing lifecycle identity;
- the Sidebar validates navigation, selected state, click navigation, and
  keyboard interaction;
- protocol tests validate every new DTO, request, response, stale session,
  invalid route, and message-size boundary.

### Home and Books tests

- Continue Reading renders the correct book and percentage;
- no-book, no-progress, and no-game states render the exact useful actions;
- recent books and quick access summaries render from a safe snapshot;
- Books filters and search are local and deterministic;
- book rows render untrusted titles as text;
- action menus expose Open, Relocate, TXT-only encoding, and exact
  `Remove from bookshelf` wording;
- cancellation and removal confirmation remain no-op or source-preserving;
- original TXT/EPUB paths are never deleted by a presentation action.

### Reader and EPUB tests

- content is rendered as text blocks with the existing bounded window;
- title, type, percentage, toolbar, overflow, and paging render correctly;
- TXT locators and restored logical focus survive route and Boss transitions;
- EPUB chapter list opens and closes with focus restoration;
- selecting a chapter requests the exact chapter ID and renders text-only
  paragraphs;
- previous/next chapter actions preserve logical progress semantics;
- no raw markup, images, scripts, styles, or remote content enter the DOM;
- toolbar quieting restores opacity on hover/focus and respects reduced motion.

### 2048, Settings, and Boss tests

- 2048 renders 16 cells, scores, best score, board focus, and scoped keyboard
  events;
- victory and Game Over use an internal accessible dialog, not `alert()`;
- New Game and Continue use the existing controller and do not alter engine
  rules;
- Settings show current range values, descriptions, labels, preview updates,
  and reset behavior through the existing service;
- all three existing Boss templates render as static local text;
- Boss-visible output contains none of the forbidden identity words;
- Boss enter/exit preserves Reader and 2048 controller/state identity, route,
  logical anchor, focus, scroll, panel title, and context semantics.

### Theme and structural tests

- all presentation CSS uses the token layer and VS Code theme variables;
- no known forbidden hardcoded theme color literals occur in the redesigned
  CSS;
- Dark, Light, High Contrast, forced-colors, and reduced-motion hooks exist;
- no external font, frontend framework import, large UI dependency, or
  network source is introduced;
- production build contains the current main and Sidebar assets and the
  packaged manifest still declares `moyu.sidebar` as a Webview view;
- current/minimum Extension Host lanes, message validation, persistence,
  multi-window, parser, indexing, and packaging tests remain green.

## 23. Manual Visual Acceptance

Implementation acceptance uses an isolated VS Code profile and the packaged
build under review. The normal user profile and user global storage are not
used for test data.

For each of Dark, Light, and High Contrast themes, inspect Sidebar, Home,
Books, Reader, 2048, Settings, and Boss Mode at narrow, normal, and wide
window sizes.

Record PASS/FAIL for:

1. Activity Bar opens the Sidebar without a provider error.
2. Sidebar shows four compact entries with selected, hover, and keyboard
   focus states; no browser-default white buttons are visible.
3. Home shows Continue Reading, Quick Access, Recent Books, and useful empty
   states without unrelated content.
4. Books search, All/TXT/EPUB filters, import, overflow actions, and safe
   removal wording are clear; the source-file safety sentence is visible at
   confirmation.
5. Reader remains centered and readable, does not stretch across a wide
   panel, and keeps toolbar/progress subordinate.
6. EPUB chapter drawer opens inside the panel, closes with Escape, restores
   focus, and changes chapters without opening a VS Code tab.
7. TXT remains text-only and uses the existing logical progress.
8. 2048 board, Score/Best, controls, modal, and narrow layout remain usable;
   no rainbow palette or browser alert appears.
9. Settings have grouped labels, descriptions, current values, range output,
   styled controls, template preview, and reset action.
10. Boss Mode shows only the selected neutral document, hides/inerts the
    normal module, and does not expose the forbidden identity words.
11. Ctrl+M enters and exits without changing the Reader or 2048 state,
    controller identity, panel count, or real editor tabs.
12. Keyboard-only navigation, screen-reader names, visible focus, High
    Contrast borders, and reduced-motion behavior are usable.

## 24. Files Expected to Change

These are the exact planned implementation surfaces. They are not modified by
this design phase.

### Presentation and adapters

- `webview/components/dom.ts`
- `webview/components/Icon.ts`
- `webview/components/Button.ts`
- `webview/components/SectionHeader.ts`
- `webview/components/EmptyState.ts`
- `webview/components/ProgressBar.ts`
- `webview/components/ActionMenu.ts`
- `webview/components/Modal.ts`
- `webview/components/components.css`
- `webview/sidebar/main.ts`
- `webview/sidebar/SidebarView.ts`
- `webview/sidebar/sidebar.css`
- `webview/home/HomeView.ts`
- `webview/home/HomeController.ts`
- `webview/home/home.css`
- `webview/books/bookCard.ts`
- `webview/books/BookshelfView.ts`
- `webview/books/BookshelfController.ts`
- `webview/books/bookshelf.css`
- `webview/reader/ReaderView.ts`
- `webview/reader/ReaderController.ts`
- `webview/reader/ChapterDrawer.ts`
- `webview/reader/readerModel.ts`
- `webview/reader/reader.css`
- `webview/game2048/Game2048View.ts`
- `webview/game2048/Game2048Controller.ts`
- `webview/game2048/game2048.css`
- `webview/settings/SettingsView.ts`
- `webview/settings/settings.css`
- `webview/boss/BossOverlay.ts`
- `webview/boss/boss.css`
- `webview/boss/templates.ts`
- `webview/shell/app.ts`
- `webview/shell/main.ts`
- `webview/shell/router.ts`
- `webview/shell/messageClient.ts`
- `webview/shell/ErrorView.ts`
- `webview/styles/base.css`
- `webview/styles/theme.css`
- `webview/styles/tokens.css`

### Host, protocol, and build wiring

- `src/extension/sidebar/MoyuSidebarProvider.ts`
- `src/extension/sidebar/sidebarHtml.ts`
- `src/extension/panel/PanelController.ts`
- `src/extension/panel/SettingsMessageDispatcher.ts`
- `src/extension/panel/PresentationSnapshotProvider.ts`
- `src/extension/activation.ts`
- `src/shared/protocol/messages.ts`
- `src/shared/protocol/validate.ts`
- `esbuild.mjs`
- `package.json` only when the implementation release updates the version or
  package-output checks.

### Tests and acceptance records

- `test/unit/webview/components.test.ts`
- `test/unit/webview/sidebar.test.ts`
- `test/unit/webview/home.test.ts`
- `test/unit/webview/bookshelf.test.ts`
- `test/unit/webview/readerView.test.ts`
- `test/unit/webview/epubChapterView.test.ts`
- `test/unit/webview/game2048View.test.ts`
- `test/unit/webview/settingsView.test.ts`
- `test/unit/webview/bossOverlay.test.ts`
- `test/unit/webview/themeTokens.test.ts`
- `test/unit/webview/router.test.ts`
- `test/unit/extension/presentationSnapshot.test.ts`
- `test/unit/extension/panelControllerSettings.test.ts`
- `test/unit/extension/panelControllerRecovery.test.ts`
- `test/extension/suite/sidebar.test.ts`
- `test/extension/suite/activation.test.ts`
- `test/extension/suite/bookImport.test.ts`
- `test/extension/suite/restartRecovery.test.ts`
- `test/unit/packaging/packageContents.test.ts`
- `test/acceptance/windows-v1-checklist.md`

Existing domain, application, infrastructure, lock, repository, parser,
indexing, and engine files are regression surfaces, not redesign targets.

## 25. Acceptance Criteria

The redesign is ready for implementation completion review when:

1. Sidebar, Home, Books, Reader, 2048, Settings, and Boss present one coherent
   VS Code-native visual system in Dark, Light, and High Contrast themes.
2. Sidebar contains only lightweight navigation and summaries, and every
   destination opens or reveals the one existing main WebviewPanel.
3. Home has useful Continue Reading, Quick Access, Recent Books, and empty
   states without unrelated dashboard content.
4. Bookshelf supports search, type filters, compact rows, safe overflow
   actions, import, relocation, TXT encoding selection, and explicit
   source-preserving removal wording.
5. Reader is centered, content-first, scroll-first, bounded, responsive, and
   driven by the existing font, line-height, width, block, and logical
   progress settings.
6. EPUB chapter navigation is an accessible in-panel drawer using existing
   text-only chapter services; TXT has no new chapter algorithm.
7. 2048 presentation is compact, themed, keyboard-safe, responsive, and uses
   internal accessible dialogs without changing the pure engine or session
   persistence.
8. Settings provide grouped labelled controls, live value output, three
   static template previews, and reset through the existing settings service.
9. Boss Mode exposes only the selected neutral document, keeps forbidden
   identity words out of its presentation, and restores the exact underlying
   module semantics.
10. All dynamic content is safely rendered, all focus and keyboard behavior is
    preserved, and High Contrast and reduced-motion behavior are covered by
    tests and manual inspection.
11. No React/Vue/Svelte or large UI dependency is added, and no backend or
    domain architecture changes are made.
12. Full existing unit, Extension Host, minimum-version, message, persistence,
    multi-window, parser, security, build, lint, format, and packaging gates
    remain green.
