# Moyu VS Code V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline Windows 10/11 VS Code extension containing a safe local TXT/EPUB reader, recoverable 2048, and instantaneous reversible in-Webview boss mode.

**Architecture:** An Activity Bar Sidebar is the native entry and light navigation surface; one WebviewPanel per VS Code window hosts all main content. The Extension Host exclusively owns files, parsing, persistence, commands, context keys, and lifecycle, while a Vanilla TypeScript Webview owns safe rendering and interaction through a runtime-validated typed protocol. Conflict-sensitive global data uses per-module locked file transactions under `globalStorageUri`; window and boss state remain process-local.

**Tech Stack:** Node.js 22 LTS as development tooling only; production Extension Host compatibility targets Node 20.18 in VS Code 1.96.x. TypeScript 5.9.2, VS Code API with `engines.vscode: ^1.96.0`, `@types/vscode@1.96.0`, and `@types/node@20.18.0`, Vanilla TypeScript/HTML/CSS, esbuild 0.28.1, Vitest 4.0.0, ESLint 9.34.0 with typescript-eslint 8.68.0, Prettier 3.6.2, `iconv-lite@0.7.3`, `@zip.js/zip.js@2.8.60`, `saxes@6.0.0`, `parse5@8.0.1`, `@vscode/test-electron@3.1.0`, and `@vscode/vsce@3.9.2`.

**Spec:** `docs/superpowers/specs/2026-08-29-moyu-vscode-v1-design.md`

## Global Constraints

- Windows 10 and Windows 11 are the only V1 acceptance platforms; core modules must remain free of Windows-only path, Registry, shell, or keyboard APIs.
- Use `vscode.Uri` and Node `path`; never permanently identify a book by path hash and never lowercase all platform URIs.
- Use no backend, account, cloud, network content, telemetry, database service, AI, crawler, advertisement, or future game in V1.
- Use Vanilla TypeScript, HTML, and CSS with separate Extension Host and Webview esbuild entry points; do not add React, Vue, Svelte, or the deprecated `vscode` npm package.
- Never copy user novels into the extension store and never delete a source novel. Only derived indexes/caches may live under `globalStorageUri`.
- Webview content is offline, uses nonce CSP with default deny, and renders untrusted text only through `textContent`/DOM APIs.
- Host/Webview JSON messages are capped at 1 MiB serialized UTF-8 and must pass runtime guards.
- EPUB hard limits are exactly those in the spec: 256 MiB source, 4,096 entries, 16 MiB per expanded entry, 512 MiB expanded total, 100:1 ratio, 256 KiB container XML, 4 MiB OPF, 2,048 chapters, 8 MiB chapter markup, 4 MiB sanitized chapter text, depth 64, and 1 MiB message.
- Critical bookshelf, reading-progress, and 2048 writes must use per-module exclusive lease locks with a 5-second acquisition timeout, 2-second heartbeat, 30-second stale threshold, evidence-gated single-winner quarantine, token-checked release, crash-safe replacement, validation, and recovery. A timeout returns `STATE_LOCK_TIMEOUT` and never itself authorizes takeover.
- Node.js 22 LTS is limited to npm/build/test/lint/package. Extension production code must remain Node 20.18 compatible; Webview code targets Chromium 128, and neither bundle may be generalized to `esnext`.
- Every production task follows RED → minimal GREEN → focused regression → commit. Do not combine unrelated cleanup.
- Do not push, publish, or alter the old `D:\Moyu\Thief-Book-VSCode` repository.

## Planned File Responsibility Map

- `src/extension/*`: activation, commands, VS Code context keys, Sidebar, panel lifecycle, notifications.
- `src/shared/protocol/*`: environment-neutral request/response/event unions and runtime guards.
- `src/domain/*`: pure book, locator, boss, and 2048 types/rules.
- `src/application/*`: use cases coordinating repositories and domain rules.
- `src/infrastructure/storage/*`: per-module file transactions, migrations, and VS Code preference adapter.
- `src/infrastructure/txt/*`: encoding previews, byte/block indexing, and bounded reads.
- `src/infrastructure/epub/*`: bounded ZIP access, safe XML/markup parsing, sanitized chapter cache.
- `webview/*`: shell/router plus focused bookshelf, reader, 2048, boss, and settings views.
- `test/unit/*`: pure and adapter unit tests; `test/extension/*`: Extension Host integration tests.

---

### Task 1: Reproducible Extension Skeleton and Toolchain

**Files:**
- Create: `package.json`, `package-lock.json`, `tsconfig.base.json`, `tsconfig.extension.json`, `tsconfig.webview.json`
- Create: `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `esbuild.mjs`, `vitest.config.ts`
- Create: `.vscode/launch.json`, `.vscode/tasks.json`, `src/extension/activation.ts`, `webview/shell/main.ts`, `webview/shell/index.html`, `webview/styles/base.css`
- Test: `test/unit/skeleton/manifest.test.ts`, `test/unit/skeleton/build-output.test.ts`

**Interfaces:**
- Produces: `activate(context: vscode.ExtensionContext): void`, production outputs `dist/extension.js`, `dist/webview/main.js`, `dist/webview/main.css`.
- Produces scripts: `build`, `watch`, `test`, `test:extension`, `lint`, `format`, `format:check`, `package`.

- [ ] **Step 1: Write failing manifest and build-contract tests**

```ts
import manifest from '../../../package.json';

it('uses the approved VS Code engine and entry point', () => {
  expect(manifest.engines.vscode).toBe('^1.96.0');
  expect(manifest.main).toBe('./dist/extension.js');
  expect(manifest.activationEvents).not.toContain('*');
});

it('keeps production bundles on the minimum VS Code runtime boundary', () => {
  expect(build.extension).toMatchObject({ platform: 'node', target: 'node20.18' });
  expect(build.webview).toMatchObject({ platform: 'browser', target: 'chrome128' });
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --run test/unit/skeleton/manifest.test.ts`
Expected: FAIL because the manifest and test toolchain do not exist.

- [ ] **Step 3: Create the minimal pinned toolchain and empty entry points**

Create a private extension manifest with `engines.vscode: ^1.96.0`, `main: ./dist/extension.js`, `type: module`, explicit commands/views activation, and a contributor-tooling Node engine of `>=22 <23`. This npm engine documents development tooling only and must not be treated as the Extension Host runtime. Pin direct production dependency `iconv-lite@0.7.3`; pin development dependencies `typescript@5.9.2`, `esbuild@0.28.1`, `vitest@4.0.0`, `eslint@9.34.0`, `typescript-eslint@8.68.0`, `prettier@3.6.2`, `@types/node@20.18.0`, `@types/vscode@1.96.0`, `@vscode/test-electron@3.1.0`, and `@vscode/vsce@3.9.2`. Use `npm install --package-lock-only` followed by `npm ci` to lock and verify; do not install globally.

Configure the Extension Host bundle with esbuild `platform: 'node'`, `target: 'node20.18'`, and TypeScript `target: 'ES2022'`, `lib: ['ES2022']`, Node 20.18/VS Code 1.96 types. Configure the Webview bundle with esbuild `platform: 'browser'`, `target: 'chrome128'`, and TypeScript `target: 'ES2022'`, `lib: ['ES2022', 'DOM', 'DOM.Iterable']`, without Node types. Type checking must reject Node 22-only production APIs.

```ts
// src/extension/activation.ts
import type { ExtensionContext } from 'vscode';
export function activate(_context: ExtensionContext): void {}
export function deactivate(): void {}
```

- [ ] **Step 4: Run GREEN and build checks**

Run: `npm test -- --run test/unit/skeleton/manifest.test.ts test/unit/skeleton/build-output.test.ts && npm run build && npm run lint && npm run format:check`
Expected: PASS; only the three approved `dist` outputs and source maps are emitted.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json tsconfig*.json eslint.config.js .prettierrc.json .prettierignore esbuild.mjs vitest.config.ts .vscode src/extension/activation.ts webview test/unit/skeleton
git commit -m "build: add modern VS Code extension skeleton"
```

### Task 2: Typed Message Protocol and Runtime Validation

**Files:**
- Create: `src/shared/protocol/messages.ts`, `src/shared/protocol/limits.ts`, `src/shared/protocol/validate.ts`, `src/shared/protocol/result.ts`
- Test: `test/unit/protocol/validate.test.ts`, `test/unit/protocol/size-limit.test.ts`

**Interfaces:**
- Produces: `HostRequest`, `HostResponse`, `HostEvent`, `ProtocolError`, `validateHostRequest(value: unknown): Result<HostRequest, ProtocolError>`, `serializedUtf8Size(value: unknown): number`.
- Produces constant: `MAX_MESSAGE_BYTES = 1_048_576`.

- [ ] **Step 1: Write failing discriminant, malformed-payload, stale-session, and exact-size tests**

```ts
expect(validateHostRequest({ protocol: 1, id: '1', sessionId: 's', type: 'books/list', payload: {} }).ok).toBe(true);
expect(validateHostRequest({ protocol: 2, type: 'books/list' }).ok).toBe(false);
expect(assertMessageSize(exactlyOneMiBJson)).toEqual({ ok: true, value: undefined });
expect(assertMessageSize(overOneMiBJson).ok).toBe(false);
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --run test/unit/protocol`
Expected: FAIL with missing protocol modules.

- [ ] **Step 3: Implement closed unions and exhaustive runtime guards**

```ts
export type HostRequest =
  | Envelope<'app/ready', Record<string, never>>
  | Envelope<'app/navigate', { section: AppSection }>
  | Envelope<'books/list', Record<string, never>>
  | Envelope<'reader/readBlocks', { bookId: string; anchor: LogicalLocator; direction: 'before' | 'after'; limit: number }>
  | Envelope<'game2048/save', { baseVersion: number; state: Game2048State }>;
```

Validate protocol/version/session/id, dispatch by exact type, reject extra-dangerous numeric ranges, and calculate the UTF-8 JSON size before handler dispatch.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- --run test/unit/protocol && npm run lint`
Expected: PASS for valid messages, unknown types, malformed payloads, exactly 1 MiB, and 1 MiB + 1 byte.

- [ ] **Step 5: Commit**

```powershell
git add src/shared/protocol test/unit/protocol
git commit -m "feat: define validated Webview message protocol"
```

### Task 3: Cross-Process File Transaction Primitive

**Files:**
- Create: `src/infrastructure/storage/fileLock.ts`, `src/infrastructure/storage/fileTransaction.ts`, `src/infrastructure/storage/recovery.ts`, `src/infrastructure/storage/nodeFileOps.ts`
- Test: `test/unit/storage/fileLock.test.ts`, `test/unit/storage/fileTransaction.test.ts`, `test/fixtures/storage/`

**Interfaces:**
- Produces: `acquireFileLock(lockUri, options): Promise<LockHandle>`, `LockHandle.release(): Promise<void>`.
- Produces: `transactJson<T>(paths, validate, mutate): Promise<T>`, `recoverJsonState<T>(paths, validate): Promise<T | undefined>`.
- Uses exact options: `{ acquireTimeoutMs: 5000, heartbeatMs: 2000, staleAfterMs: 30000, retryMinMs: 20, retryMaxMs: 100 }`.
- Lock metadata is `{ ownerToken: UUID; pid; acquiredAt; renewedAt }`; `ownerToken` is the authoritative identity.

- [ ] **Step 1: Write failing concurrency and crash-window tests**

```ts
const results = await Promise.all(Array.from({ length: 20 }, () => incrementInTransaction()));
expect(results.sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
expect(await readGenerationAfterCrash('after-backup-rotation')).toBe(7);
expect(await releaseWithWrongToken()).toBe(false);
await expect(acquireWhileOwnerDeathIsUncertain()).rejects.toMatchObject({ code: 'STATE_LOCK_TIMEOUT' });
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --run test/unit/storage/fileLock.test.ts test/unit/storage/fileTransaction.test.ts`
Expected: FAIL because locking and recovery are absent.

- [ ] **Step 3: Implement exclusive lease, stale quarantine, durable replacement, and recovery**

```ts
export async function transactJson<T>(args: TransactionArgs<T>): Promise<T> {
  const lock = await acquireFileLock(args.paths.lock, LOCK_OPTIONS);
  try {
    const current = await recoverJsonState(args.paths, args.validate);
    const next = await args.mutate(current);
    await writeFlushClose(args.paths.tempFor(lock.token), JSON.stringify(next));
    await rotateAndPromote(args.paths, lock.token);
    return await readAndValidate(args.paths.current, args.validate);
  } finally {
    await lock.release();
  }
}
```

Acquire with exclusive creation and heartbeat every 2 seconds. Waiting stops after 5 seconds with `STATE_LOCK_TIMEOUT`; waiting expiry never permits stealing. An unrenewed lease becomes stale after 30 seconds, but PID/liveness is only auxiliary: recover only when the lease is expired and the owner is clearly absent. If death is uncertain, time out without takeover. Quarantine by atomic rename from `module.lock` to `module.lock.stale.<uuid>`; only the rename winner recovers and then retries normal acquisition. Re-read metadata before release and remove only an exact `ownerToken` match.

All file paths are below one injected `globalStorageUri`; readers use the same lock. The locked mutation is strictly acquire, recover/read latest, validate `baseVersion`, merge/reject, unique temp write, flush/close, backup rotation, same-directory rename, committed-generation re-read/validation, and release. TXT indexing, EPUB parsing, large-file scanning, UI waits, and user-input waits are forbidden inside this critical section.

- [ ] **Step 4: Run GREEN including real child-process contention on Windows**

Run: `npm test -- --run test/unit/storage && npm run build`
Expected: PASS for heartbeat preventing false stale takeover, crashed-owner recovery, no theft from a live slow owner, `STATE_LOCK_TIMEOUT`, one-winner stale quarantine, wrong-token release refusal, competing child-process serialization, temp failure, each commit crash window, invalid JSON, and highest-valid-generation recovery.

- [ ] **Step 5: Commit**

```powershell
git add src/infrastructure/storage test/unit/storage test/fixtures/storage
git commit -m "feat: add crash-safe cross-process state transactions"
```

### Task 4: Versioned Module Repositories and Migrations

**Files:**
- Create: `src/domain/persistence/envelope.ts`, `src/application/persistence/repositories.ts`, `src/infrastructure/storage/bookshelfRepository.ts`, `src/infrastructure/storage/progressRepository.ts`, `src/infrastructure/storage/gameRepository.ts`, `src/infrastructure/storage/preferencesRepository.ts`, `src/infrastructure/storage/migrations.ts`
- Test: `test/unit/storage/repositories.test.ts`, `test/unit/storage/migrations.test.ts`

**Interfaces:**
- Produces: `BookshelfRepository.mutate(baseVersion, operation)`, `ProgressRepository.save(bookId, baseVersion, checkpoint)`, `GameRepository.save(baseVersion, state)`, `PreferencesRepository.read/update`.
- Produces: `VersionedEnvelope<T> = { schemaVersion; version; generation; updatedAt; data }` and typed `StateConflict`.

- [ ] **Step 1: Write failing merge and migration tests**

```ts
expect(await concurrentAdds(['a', 'b'])).toContainAllBookIds(['a', 'b']);
expect(await removeThenStaleAdd('a')).toHaveTombstone('a');
expect(await mergeBestScores(128, 512)).toBe(512);
await expect(saveOldGameSession()).rejects.toMatchObject({ code: 'GAME_SESSION_STALE' });
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --run test/unit/storage/repositories.test.ts test/unit/storage/migrations.test.ts`
Expected: FAIL with missing repositories.

- [ ] **Step 3: Implement repositories on `transactJson`**

```ts
return transactJson(paths, validateGameEnvelope, current => {
  const bestScore = Math.max(current.data.bestScore, input.state.bestScore);
  if (input.state.gameSessionId !== current.data.activeSessionId) throw new GameSessionStale();
  if (input.state.moveSequence <= current.data.moveSequence) throw new StateConflict();
  return nextEnvelope(current, { ...input.state, bestScore });
});
```

Keep reader settings and schema pointers in the VS Code preference adapter; critical repositories use files. Compute expensive TXT/EPUB/index inputs before acquisition, then perform only the short read/validate/merge/commit transaction under the module lock. Migrate one module at a time under its lock and retain a validated backup.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- --run test/unit/storage && npm run lint`
Expected: PASS for tombstones, per-book progress, settings last-write-wins, best-score max, game sessions, corrupt module fallback, and migrations.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/persistence src/application/persistence src/infrastructure/storage test/unit/storage
git commit -m "feat: add versioned module repositories"
```

### Task 5: Secure Webview Shell, Router, and Message Client

**Files:**
- Create: `src/extension/panel/webviewHtml.ts`, `src/extension/panel/PanelController.ts`, `webview/shell/router.ts`, `webview/shell/messageClient.ts`, `webview/shell/app.ts`, `webview/styles/theme.css`
- Modify: `webview/shell/main.ts`, `webview/shell/index.html`
- Test: `test/unit/webview/csp.test.ts`, `test/unit/webview/router.test.ts`, `test/unit/webview/messageClient.test.ts`

**Interfaces:**
- Produces: `createWebviewHtml(webview, extensionUri, nonce): string`, `PanelController.open(section)`, `Router.navigate(section)`, `MessageClient.request(request): Promise<response>`.
- Consumes: Task 2 protocol and 1 MiB limit.

- [ ] **Step 1: Write failing CSP, route, and correlation tests**

```ts
expect(html).toContain("default-src 'none'");
expect(html).not.toMatch(/img-src|font-src|https:|unsafe-inline|unsafe-eval/);
expect(router.navigate('reader').current).toBe('reader');
await expect(client.request(request)).resolves.toMatchObject({ requestId: request.id });
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --run test/unit/webview`
Expected: FAIL with missing shell modules.

- [ ] **Step 3: Implement minimal secure shell**

```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src {{cspSource}}; script-src 'nonce-{{nonce}}'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none';">
<main id="app" tabindex="-1"></main>
```

Generate only trusted shell HTML in the host, load packaged assets with `asWebviewUri`, and route dynamic content with `replaceChildren` and `textContent`.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- --run test/unit/webview && npm run build`
Expected: PASS; production HTML opens no image/font/network source and protocol requests correlate or time out safely.

- [ ] **Step 5: Commit**

```powershell
git add src/extension/panel webview/shell webview/styles test/unit/webview
git commit -m "feat: add secure Webview shell and router"
```

### Task 6: Native Sidebar, Commands, Context Keys, and Single-Panel Lifecycle

**Files:**
- Create: `src/extension/commands.ts`, `src/extension/contextKeys.ts`, `src/extension/sidebar/MoyuSidebarProvider.ts`, `src/extension/panel/PanelRegistry.ts`, `src/extension/panel/PanelSerializer.ts`
- Modify: `src/extension/activation.ts`, `package.json`
- Test: `test/unit/extension/panelRegistry.test.ts`, `test/extension/suite/navigation.test.ts`

**Interfaces:**
- Produces commands: `moyu.open`, `moyu.openBooks`, `moyu.open2048`, `moyu.openSettings`, `moyu.toggleBossMode`.
- Produces context keys: `moyu.isOpen`, `moyu.isVisible`, `moyu.isBossMode`.
- Produces: `PanelRegistry.openOrReveal(windowId, section): Promise<PanelController>`.

- [ ] **Step 1: Write failing one-panel and no-wildcard activation tests**

```ts
await registry.openOrReveal('window-a', 'books');
await registry.openOrReveal('window-a', 'game2048');
expect(factory.create).toHaveBeenCalledTimes(1);
expect(contextKeys.snapshot()).toEqual({ isOpen: true, isVisible: true, isBossMode: false });
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --run test/unit/extension/panelRegistry.test.ts`
Expected: FAIL because lifecycle modules do not exist.

- [ ] **Step 3: Register contributions and implement window-local lifecycle**

```ts
context.subscriptions.push(
  commands.registerCommand('moyu.openBooks', () => registry.openOrReveal('books')),
  window.registerWebviewViewProvider('moyu.sidebar', sidebarProvider),
  window.registerWebviewPanelSerializer('moyu.main', serializer),
);
```

The Sidebar sends navigation commands only. Disposal clears all three context keys; hiding updates visibility; serializer restores durable state in `NORMAL` mode.

- [ ] **Step 4: Run GREEN and Extension Host smoke**

Run: `npm test -- --run test/unit/extension/panelRegistry.test.ts && npm run test:extension -- --grep "navigation"`
Expected: PASS; repeated navigation reveals one panel and absent-panel boss command is a no-op.

- [ ] **Step 5: Commit**

```powershell
git add package.json src/extension test/unit/extension test/extension/suite/navigation.test.ts
git commit -m "feat: add Moyu Sidebar and panel lifecycle"
```

### Task 7: Boss Mode State Machine

**Files:**
- Create: `src/domain/boss/BossModeMachine.ts`, `src/domain/boss/types.ts`, `src/application/boss/BossModeService.ts`
- Test: `test/unit/boss/BossModeMachine.test.ts`, `test/unit/boss/BossModeService.test.ts`

**Interfaces:**
- Produces: `BossMode = 'NORMAL' | 'BOSS_MODE'`, `BossSnapshot`, `BossModeMachine.toggle(snapshotProvider): BossTransition`.
- Produces: `BossModeService.toggle(panelSession): Promise<void>`.

- [ ] **Step 1: Write failing idempotence and rapid-toggle tests**

```ts
expect(machine.enter(snapshot).mode).toBe('BOSS_MODE');
expect(machine.exit().restoredSnapshot).toEqual(snapshot);
expect(await toggleNTimes(service, 10)).toBe('NORMAL');
await expect(service.toggle(absentPanel)).resolves.toBeUndefined();
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --run test/unit/boss`
Expected: FAIL with missing boss modules.

- [ ] **Step 3: Implement serialized state transitions**

```ts
toggle(): Promise<void> {
  this.queue = this.queue.then(() => this.mode === 'NORMAL' ? this.enter() : this.exit());
  return this.queue;
}
```

Store the snapshot in process memory only; synchronize title and context key after Webview acknowledgement; roll back to the prior stable mode if acknowledgement times out.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- --run test/unit/boss && npm run lint`
Expected: PASS for enter, exit, rapid toggles, absent/hidden no-op, acknowledgement timeout, and rollback.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/boss src/application/boss test/unit/boss
git commit -m "feat: add reversible boss mode state machine"
```

### Task 8: Pure 2048 Game Engine

**Files:**
- Create: `src/domain/game2048/types.ts`, `src/domain/game2048/board.ts`, `src/domain/game2048/move.ts`, `src/domain/game2048/spawn.ts`, `src/domain/game2048/status.ts`, `src/domain/game2048/newGame.ts`
- Test: `test/unit/game2048/move.test.ts`, `test/unit/game2048/spawn.test.ts`, `test/unit/game2048/status.test.ts`

**Interfaces:**
- Produces: `move(state, direction, rng): MoveResult`, `spawn(board, rng): Board`, `getStatus(board): { won; gameOver }`, `createNewGame(rng, clock, uuid): Game2048State`.
- No imports from DOM, VS Code, filesystem, or storage.

- [ ] **Step 1: Write the complete failing rule table**

```ts
it.each([
  [[2, 2, 2, 2], [4, 4, 0, 0], 8],
  [[4, 4, 8, 0], [8, 8, 0, 0], 16],
  [[2, 2, 4, 0], [4, 4, 0, 0], 4],
])('merges left once per source tile', (input, output, score) => {
  expect(moveRowLeft(input)).toEqual({ row: output, score });
});
```

Add equivalent board tests for right/up/down, no-op, spawn position/value, win, game over, and continue-after-win.

- [ ] **Step 2: Run RED**

Run: `npm test -- --run test/unit/game2048`
Expected: FAIL with missing game engine.

- [ ] **Step 3: Implement immutable transforms and injected RNG**

```ts
export function move(state: Game2048State, direction: Direction, rng: Rng): MoveResult {
  const transformed = orient(state.board, direction);
  const merged = transformed.map(mergeRowLeft);
  const board = restoreOrientation(merged.map(x => x.row), direction);
  if (boardsEqual(board, state.board)) return { state, moved: false, events: [] };
  return finishMove(state, spawn(board, rng), merged);
}
```

- [ ] **Step 4: Run GREEN with coverage**

Run: `npm test -- --run test/unit/game2048 --coverage`
Expected: PASS with all branch cases for merging, spawning, victory, and game-over covered.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/game2048 test/unit/game2048
git commit -m "feat: add deterministic 2048 engine"
```

### Task 9: 2048 Session Persistence and Conflict Rules

**Files:**
- Create: `src/application/game2048/Game2048Service.ts`, `src/application/game2048/gameCommands.ts`
- Modify: `src/infrastructure/storage/gameRepository.ts`, `src/shared/protocol/messages.ts`
- Test: `test/unit/game2048/Game2048Service.test.ts`, `test/unit/storage/gameSessionConcurrency.test.ts`

**Interfaces:**
- Produces: `Game2048Service.load()`, `newGame(baseVersion)`, `move(baseVersion, sessionId, moveSequence, direction)`.
- Consumes: Task 4 `GameRepository` and Task 8 pure engine.

- [ ] **Step 1: Write failing restart, sequence, and best-score tests**

```ts
const first = await service.newGame(0);
const second = await otherWindow.newGame(first.version);
await expect(service.move(first.version, first.gameSessionId, 1, 'left'))
  .rejects.toMatchObject({ code: 'GAME_SESSION_STALE' });
expect((await repository.read()).bestScore).toBe(Math.max(first.score, second.score));
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --run test/unit/game2048/Game2048Service.test.ts test/unit/storage/gameSessionConcurrency.test.ts`
Expected: FAIL because the service is absent.

- [ ] **Step 3: Implement explicit session creation and ordered moves**

```ts
async move(command: MoveCommand): Promise<VersionedGameState> {
  return this.repository.mutate(command.baseVersion, current => {
    assertActiveSession(current, command.gameSessionId);
    assertNextSequence(current, command.moveSequence);
    return applyMoveAndMaxScore(current, command.direction, this.rng);
  });
}
```

- [ ] **Step 4: Run GREEN**

Run: `npm test -- --run test/unit/game2048 test/unit/storage/gameSessionConcurrency.test.ts`
Expected: PASS for reload, exact session ownership, sequence rejection, explicit new game, victory continuation, and max-score merge.

- [ ] **Step 5: Commit**

```powershell
git add src/application/game2048 src/infrastructure/storage/gameRepository.ts src/shared/protocol/messages.ts test/unit/game2048 test/unit/storage/gameSessionConcurrency.test.ts
git commit -m "feat: persist 2048 sessions safely"
```

### Task 10: 2048 Webview UI and Keyboard Scope

**Files:**
- Create: `webview/game2048/Game2048View.ts`, `webview/game2048/Game2048Controller.ts`, `webview/game2048/keyboard.ts`, `webview/game2048/game2048.css`
- Modify: `webview/shell/router.ts`, `webview/styles/base.css`
- Test: `test/unit/webview/game2048View.test.ts`, `test/unit/webview/game2048Keyboard.test.ts`

**Interfaces:**
- Produces: `Game2048Controller.mount(root)`, `dispose()`, `pause()`, `resume()`, `restoreFocus(token)`.
- Consumes protocol messages `game2048/load`, `game2048/save`, and `game2048/newGame`.

- [ ] **Step 1: Write failing DOM and keyboard tests**

```ts
dispatchKey(board, 'ArrowLeft');
expect(client.lastRequest.type).toBe('game2048/save');
dispatchKey(textButton, 'a');
expect(client.requestCount).toBe(0);
expect(root.querySelectorAll('[data-cell]')).toHaveLength(16);
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --run test/unit/webview/game2048`
Expected: FAIL with missing UI modules.

- [ ] **Step 3: Build accessible DOM without HTML injection**

```ts
const cell = document.createElement('div');
cell.dataset.cell = String(index);
cell.textContent = value === 0 ? '' : String(value);
cell.setAttribute('aria-label', value === 0 ? 'Empty' : String(value));
```

Map arrows/WASD only when the board owns focus and normal mode is active. Render score, best score, New Game, Game Over, and Win dialog with Continue/New Game actions.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- --run test/unit/webview/game2048 && npm run build`
Expected: PASS for rendering, input scope, no-op moves, modal focus, pause/resume, and restore.

- [ ] **Step 5: Commit**

```powershell
git add webview/game2048 webview/shell/router.ts webview/styles test/unit/webview/game2048*
git commit -m "feat: add accessible 2048 Webview"
```

### Task 11: Book Metadata, URI Identity, Tombstones, and Relocation

**Files:**
- Create: `src/domain/books/types.ts`, `src/domain/books/bookIdentity.ts`, `src/application/books/BookshelfService.ts`, `src/infrastructure/filesystem/fileIdentity.ts`
- Modify: `src/infrastructure/storage/bookshelfRepository.ts`, `src/shared/protocol/messages.ts`
- Test: `test/unit/books/bookIdentity.test.ts`, `test/unit/books/BookshelfService.test.ts`

**Interfaces:**
- Produces: `BookMetadata`, `BookTombstone`, `normalizeBookUri(uri, platform)`, `BookshelfService.import(uri)`, `remove(bookId)`, `relocate(bookId, uri)`.
- Uses injected `uuid`, `clock`, `FileStatProvider`, and file picker adapter.

- [ ] **Step 1: Write failing Windows URI and removal tests**

```ts
expect(sameBookUri(Uri.file('C:\\Books\\A.txt'), Uri.file('c:\\books\\a.txt'), 'win32')).toBe(true);
expect(sameBookUri(Uri.file('/Books/A.txt'), Uri.file('/books/a.txt'), 'linux')).toBe(false);
await service.remove(book.id);
expect(fileOps.unlink).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --run test/unit/books/bookIdentity.test.ts test/unit/books/BookshelfService.test.ts`
Expected: FAIL with missing book domain.

- [ ] **Step 3: Implement UUID identity, duplicate reuse, tombstones, and relocation**

```ts
const existing = state.books.find(book => sameBookUri(book.uri, candidateUri, platform));
if (existing) return touchLastOpened(existing);
return createBookMetadata({ id: uuid(), uri: candidateUri.toString(true), stat, type });
```

Relocation preserves `bookId`, validates extension/readability, updates fingerprint, and emits an index-invalidated event without deleting progress.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- --run test/unit/books && npm run lint`
Expected: PASS for case behavior, duplicates, missing files, tombstones, stale adds, relocation, and source-file nondeletion.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/books src/application/books src/infrastructure/filesystem src/infrastructure/storage/bookshelfRepository.ts src/shared/protocol/messages.ts test/unit/books
git commit -m "feat: add safe bookshelf identity and relocation"
```

### Task 12: TXT Encoding Detection, Preview, and Confirmation

**Files:**
- Create: `src/infrastructure/txt/encoding.ts`, `src/infrastructure/txt/strictUtf8.ts`, `src/application/reader/EncodingSelectionService.ts`
- Modify: `src/domain/books/types.ts`, `src/shared/protocol/messages.ts`
- Test: `test/unit/txt/encoding.test.ts`, `test/fixtures/txt/encoding-fixtures.ts`

**Interfaces:**
- Produces: `inspectEncoding(prefix): BomEncoding | StrictUtf8 | GbCandidate`, `previewEncoding(uri, encoding, maxChars): Promise<string>`, `confirmEncoding(bookId, encoding, baseVersion)`.
- Supported encoding union: `'utf8' | 'utf16le' | 'utf16be' | 'gb18030' | 'gbk'`.

- [ ] **Step 1: Write failing BOM, strict UTF-8, and mandatory-confirmation tests**

```ts
expect(inspectEncoding(utf8Bom)).toEqual({ kind: 'confirmed', encoding: 'utf8', bomBytes: 3 });
expect(inspectEncoding(validUtf8)).toEqual({ kind: 'confirmed', encoding: 'utf8', bomBytes: 0 });
expect(inspectEncoding(invalidUtf8)).toEqual({ kind: 'candidate', encoding: 'gb18030', requiresConfirmation: true });
await expect(service.commitCandidateWithoutConfirmation()).rejects.toMatchObject({ code: 'ENCODING_AMBIGUOUS' });
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --run test/unit/txt/encoding.test.ts`
Expected: FAIL with missing encoding modules.

- [ ] **Step 3: Implement deterministic detection and bounded previews**

```ts
export function inspectEncoding(bytes: Uint8Array): EncodingInspection {
  const bom = detectBom(bytes);
  if (bom) return { kind: 'confirmed', ...bom };
  if (isStrictUtf8(bytes)) return { kind: 'confirmed', encoding: 'utf8', bomBytes: 0 };
  return { kind: 'candidate', encoding: 'gb18030', requiresConfirmation: true };
}
```

Decode previews through `iconv-lite`, cap at 4,000 Unicode characters, replace no metadata until confirmation, and preserve prior encoding/progress if preview or rebuild fails.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- --run test/unit/txt/encoding.test.ts`
Expected: PASS for every supported encoding, split multi-byte sequences, invalid UTF-8, GB preview, manual choices, persistence, and reselect rollback.

- [ ] **Step 5: Commit**

```powershell
git add src/infrastructure/txt/encoding.ts src/infrastructure/txt/strictUtf8.ts src/application/reader/EncodingSelectionService.ts src/domain/books/types.ts src/shared/protocol/messages.ts test/unit/txt test/fixtures/txt
git commit -m "feat: add confirmed Chinese TXT encoding flow"
```

### Task 13: Streaming TXT Block Index

**Files:**
- Create: `src/domain/reader/txtIndex.ts`, `src/infrastructure/txt/TxtIndexer.ts`, `src/infrastructure/txt/indexManifest.ts`, `src/infrastructure/txt/indexStore.ts`
- Test: `test/unit/txt/TxtIndexer.test.ts`, `test/unit/txt/indexInvalidation.test.ts`

**Interfaces:**
- Produces: `TxtIndexer.build(book, signal, onProgress): Promise<TxtIndexManifest>`, `IndexStore.loadValid(book): Promise<TxtIndexManifest | undefined>`.
- Index entry: `{ blockId; byteStart; byteEnd; decodedLength; paragraphCount; contentFingerprint }`.

- [ ] **Step 1: Write failing boundary, reuse, and cancellation tests**

```ts
const index = await indexer.build(gb18030Fixture, signal, noop);
expect(index.blocks.flatMap(x => x.paragraphCount).reduce(sum)).toBe(expectedParagraphs);
expect(await store.loadValid(unchangedBook)).toEqual(index);
expect(await store.loadValid({ ...unchangedBook, modifiedTime: changed })).toBeUndefined();
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --run test/unit/txt/TxtIndexer.test.ts test/unit/txt/indexInvalidation.test.ts`
Expected: FAIL with missing indexer.

- [ ] **Step 3: Implement streaming byte accounting and atomic derived-index publication**

```ts
for await (const bytes of fileStream) {
  signal.throwIfAborted();
  const text = decoder.write(bytes);
  scanner.push(text, absoluteByteOffset, block => entries.push(block));
  absoluteByteOffset += bytes.byteLength;
}
```

Bind manifest to book ID, URI, size, modified time, fingerprint, schema, and encoding. Publish under a book-specific cache directory with same-directory temp write and rename; cancellation removes only its own temp file.

- [ ] **Step 4: Run GREEN and large-file memory assertion**

Run: `npm test -- --run test/unit/txt/TxtIndexer.test.ts test/unit/txt/indexInvalidation.test.ts`
Expected: PASS; a generated 100 MiB fixture is indexed with bounded working memory and without `readFileSync`.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/reader/txtIndex.ts src/infrastructure/txt test/unit/txt
git commit -m "feat: add reusable streaming TXT index"
```

### Task 14: Bounded TXT Reads and Logical Progress

**Files:**
- Create: `src/domain/reader/locator.ts`, `src/infrastructure/txt/TxtBlockReader.ts`, `src/application/reader/ReaderService.ts`, `src/application/reader/progressRecovery.ts`
- Modify: `src/infrastructure/storage/progressRepository.ts`, `src/shared/protocol/messages.ts`
- Test: `test/unit/txt/TxtBlockReader.test.ts`, `test/unit/reader/progressRecovery.test.ts`, `test/unit/reader/ReaderService.test.ts`

**Interfaces:**
- Produces: `readBlocks(bookId, anchor, direction, limit): Promise<ReaderBlockBatch>`, `saveProgress(bookId, baseVersion, locator)`, `recoverLocator(old, newIndex)`.
- Locator: `{ kind: 'txt'; blockId; characterOffset; contentFingerprint }`.

- [ ] **Step 1: Write failing chunk, boundary, and resize-independent progress tests**

```ts
expect((await reader.readBlocks(book.id, start, 'after', 20)).blocks).toHaveLength(20);
expect(await reader.readBlocks(book.id, first, 'before', 20)).toMatchObject({ blocks: [], atStart: true });
expect(recoverLocator(saved, rebuiltIndex)).toMatchObject({ contentFingerprint: saved.contentFingerprint });
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --run test/unit/txt/TxtBlockReader.test.ts test/unit/reader`
Expected: FAIL with missing block reader and locators.

- [ ] **Step 3: Implement indexed range reads and logical recovery**

```ts
const entry = manifest.blocks[index];
const bytes = await file.read(entry.byteStart, entry.byteEnd - entry.byteStart);
return decodeAndSplit(bytes, book.encoding, entry, MAX_BLOCK_MESSAGE_BYTES);
```

Cap each batch below the 1 MiB protocol limit, cache only bounded decoded blocks, and recover changed files by nearby content fingerprint before falling back to clamped percentage.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- --run test/unit/txt test/unit/reader`
Expected: PASS for start/end, empty file, missing path, changed source, invalid index, logical restore, and per-book conflict merges.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/reader src/infrastructure/txt/TxtBlockReader.ts src/application/reader src/infrastructure/storage/progressRepository.ts src/shared/protocol/messages.ts test/unit/txt test/unit/reader
git commit -m "feat: add bounded TXT reading and logical progress"
```

### Task 15: Continuous Reader Webview

**Files:**
- Create: `webview/reader/ReaderView.ts`, `webview/reader/ReaderController.ts`, `webview/reader/blockWindow.ts`, `webview/reader/focusAnchor.ts`, `webview/reader/reader.css`
- Modify: `webview/shell/router.ts`
- Test: `test/unit/webview/readerView.test.ts`, `test/unit/webview/blockWindow.test.ts`

**Interfaces:**
- Produces: `ReaderController.open(bookId)`, `loadBefore/After`, `saveAnchor`, `pageUp/pageDown`, `pause/resume`, `capture/restoreFocus`.
- Consumes structured `ReaderBlock[]`; never consumes raw HTML.

- [ ] **Step 1: Write failing text safety and logical-anchor tests**

```ts
view.renderBlocks([{ id: '1', paragraphs: ['<img src=x onerror=alert(1)>'] }]);
expect(root.querySelector('img')).toBeNull();
expect(root.textContent).toContain('<img src=x onerror=alert(1)>');
expect(controller.captureAnchor()).toEqual({ blockId: '1', characterOffset: 0 });
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --run test/unit/webview/readerView.test.ts test/unit/webview/blockWindow.test.ts`
Expected: FAIL with missing reader UI.

- [ ] **Step 3: Implement windowed DOM and viewport page movement**

```ts
const paragraph = document.createElement('p');
paragraph.textContent = text;
paragraph.dataset.blockId = block.id;
fragment.append(paragraph);
```

Use IntersectionObserver only to derive logical anchors, not as persisted pixels. Previous/Next Page scroll by viewport height while checkpoints store block/paragraph/offset. Apply VS Code theme variables for font, line height, width, foreground, background, focus, and contrast.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- --run test/unit/webview/reader* && npm run build`
Expected: PASS for safe text, incremental mounting, page movement, chapter controls placeholder state, resize restoration, and pause/resume.

- [ ] **Step 5: Commit**

```powershell
git add webview/reader webview/shell/router.ts test/unit/webview/reader*
git commit -m "feat: add safe continuous reader Webview"
```

### Task 16: Bounded EPUB Container and Parser Security Boundary

**Files:**
- Create: `src/infrastructure/epub/limits.ts`, `src/infrastructure/epub/BoundedZip.ts`, `src/infrastructure/epub/safeXml.ts`, `src/infrastructure/epub/sanitizeChapter.ts`
- Modify: `package.json`, `package-lock.json`
- Test: `test/unit/epub/limits.test.ts`, `test/unit/epub/BoundedZip.test.ts`, `test/unit/epub/sanitizeChapter.test.ts`, `test/fixtures/epub/buildFixture.ts`

**Interfaces:**
- Produces: `EPUB_LIMITS` with all twelve spec values, `BoundedZip.open(uri)`, `parseXmlWithinLimits(bytes, maxBytes, maxDepth)`, `sanitizeChapter(markup): string[]`.
- Uses exact production dependencies `@zip.js/zip.js@2.8.60` (BSD-3-Clause, zero dependencies, streaming ZIP access), `saxes@6.0.0` (ISC, strict XML event parser), and `parse5@8.0.1` (MIT, inert HTML syntax tree). Reject `DOCTYPE` before feeding XML to `saxes`; traverse `parse5` output only to extract safe text.

- [ ] **Step 1: Write failing `N-1/N/N+1` tests for every limit and hostile markup**

```ts
it.each(limitCases)('$name accepts N and rejects N+1', async ({ fixtureAt, fixtureOver }) => {
  await expect(parse(fixtureAt)).resolves.toBeDefined();
  await expect(parse(fixtureOver)).rejects.toMatchObject({ code: 'EPUB_LIMIT_EXCEEDED' });
});
expect(sanitizeChapter(hostileMarkup)).toEqual(['Safe text', '[Image omitted]']);
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --run test/unit/epub/limits.test.ts test/unit/epub/BoundedZip.test.ts test/unit/epub/sanitizeChapter.test.ts`
Expected: FAIL because the bounded parser boundary is absent.

- [ ] **Step 3: Audit, pin, and wrap dependencies behind hard limits**

Before installation, verify registry metadata and lock exactly `@zip.js/zip.js@2.8.60`, `saxes@6.0.0`, and `parse5@8.0.1`; record their sources, BSD-3-Clause/ISC/MIT licenses, transitive dependency counts, and audit result in the commit body. Install only these project-local exact versions. Enforce source stat before ZIP open, entry metadata before expansion, counters during expansion, canonical in-container paths, reject any XML `DOCTYPE` or entity declaration, depth 64, and text-only `parse5` traversal.

```ts
export const EPUB_LIMITS = Object.freeze({
  sourceBytes: 256 * MiB, entries: 4096, entryBytes: 16 * MiB,
  expandedBytes: 512 * MiB, compressionRatio: 100,
  containerXmlBytes: 256 * KiB, opfBytes: 4 * MiB, chapters: 2048,
  chapterMarkupBytes: 8 * MiB, chapterTextBytes: 4 * MiB,
  markupDepth: 64, messageBytes: 1 * MiB,
});
```

- [ ] **Step 4: Run GREEN and dependency audit**

Run: `npm test -- --run test/unit/epub && npm audit --omit=dev && npm run build`
Expected: PASS for all boundaries, traversal, external entities, script/style/iframe/object/embed/events/SVG/media/link/image removal, malformed containers, and compression bombs; production audit reports no unresolved high/critical issue.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json src/infrastructure/epub test/unit/epub test/fixtures/epub
git commit -m "feat: add bounded EPUB security parser"
```

### Task 17: EPUB Spine, Chapters, Cache, and Progress

**Files:**
- Create: `src/domain/reader/epub.ts`, `src/infrastructure/epub/EpubParser.ts`, `src/infrastructure/epub/EpubCache.ts`, `src/application/reader/EpubReaderService.ts`
- Modify: `src/domain/reader/locator.ts`, `src/shared/protocol/messages.ts`, `src/infrastructure/storage/progressRepository.ts`
- Test: `test/unit/epub/EpubParser.test.ts`, `test/unit/epub/EpubReaderService.test.ts`, `test/unit/epub/EpubCache.test.ts`

**Interfaces:**
- Produces: `EpubParser.parse(uri): Promise<EpubBookIndex>`, `EpubReaderService.openChapter(bookId, chapterId)`, `nextChapter`, `previousChapter`, `saveProgress`.
- Chapter output: `{ chapterId: string; title: string; paragraphs: string[] }`; locator: `{ kind: 'epub'; chapterId; paragraphIndex; characterOffset; contentFingerprint }`.

- [ ] **Step 1: Write failing OPF/spine/title/progress tests**

```ts
const index = await parser.parse(fixture('ordered-spine.epub'));
expect(index.chapters.map(x => x.id)).toEqual(['chapter-2', 'chapter-1']);
expect((await service.nextChapter(book.id, 'chapter-2')).chapterId).toBe('chapter-1');
expect(await service.restore(book.id)).toMatchObject({ chapterId: 'chapter-1', paragraphIndex: 3 });
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --run test/unit/epub/EpubParser.test.ts test/unit/epub/EpubReaderService.test.ts`
Expected: FAIL with missing EPUB reader.

- [ ] **Step 3: Implement ordered text chapters and derived cache**

```ts
const spine = opf.spine
  .map(idref => manifest.get(idref))
  .filter((item): item is ManifestItem => item?.isReadableChapter === true);
return Promise.all(spine.map(item => this.readSanitizedChapter(zip, item)));
```

Cache only validated text structures under `globalStorageUri`, bind cache to source fingerprint/parser schema, ignore omitted images without failing text, and preserve progress on recoverable cache rebuild.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- --run test/unit/epub test/unit/reader && npm run lint`
Expected: PASS for container/OPF/spine, fallback titles, missing chapters, previous/next/jump, progress, cache invalidation, image omission, and DRM error.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/reader src/infrastructure/epub src/application/reader/EpubReaderService.ts src/shared/protocol/messages.ts src/infrastructure/storage/progressRepository.ts test/unit/epub test/unit/reader
git commit -m "feat: add text-only EPUB chapter reader"
```

### Task 18: Bookshelf Webview and Import Workflows

**Files:**
- Create: `webview/books/BookshelfView.ts`, `webview/books/BookshelfController.ts`, `webview/books/bookCard.ts`, `webview/books/bookshelf.css`
- Modify: `webview/shell/router.ts`, `src/extension/commands.ts`
- Test: `test/unit/webview/bookshelf.test.ts`, `test/extension/suite/bookImport.test.ts`

**Interfaces:**
- Produces UI actions: Import TXT/EPUB, Continue, Relocate, Reselect Encoding, Remove from Bookshelf.
- Consumes: `books/list`, `books/import`, `books/remove`, `books/relocate`, `books/selectEncoding`, `reader/open`.

- [ ] **Step 1: Write failing UI wording and cancellation tests**

```ts
expect(renderedActions()).toContain('Remove from bookshelf');
expect(renderedActions()).not.toContain('Delete novel');
await controller.importBook();
expect(client.requestCount).toBe(0); // picker cancelled
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --run test/unit/webview/bookshelf.test.ts`
Expected: FAIL with missing bookshelf UI.

- [ ] **Step 3: Implement safe cards and Extension Host picker flows**

```ts
title.textContent = book.title;
pathLabel.textContent = displayPath(book.uri);
removeButton.addEventListener('click', () => controller.confirmRemove(book.id));
```

Use `showOpenDialog` with TXT/EPUB filters, require explicit removal confirmation, show encoding previews in text-only controls, and expose typed Relocate action for missing sources.

- [ ] **Step 4: Run GREEN and Extension Host import smoke**

Run: `npm test -- --run test/unit/webview/bookshelf.test.ts && npm run test:extension -- --grep "book import"`
Expected: PASS for multi-book list, duplicate URI, cancellation, missing file, encoding confirmation, relocation, removal, and no source unlink.

- [ ] **Step 5: Commit**

```powershell
git add webview/books webview/shell/router.ts src/extension/commands.ts test/unit/webview/bookshelf.test.ts test/extension/suite/bookImport.test.ts
git commit -m "feat: add local bookshelf workflows"
```

### Task 19: Reader Settings and Theme Accessibility

**Files:**
- Create: `src/domain/reader/settings.ts`, `src/application/reader/ReaderSettingsService.ts`, `webview/settings/SettingsView.ts`, `webview/settings/settings.css`
- Modify: `src/infrastructure/storage/preferencesRepository.ts`, `webview/reader/reader.css`, `src/shared/protocol/messages.ts`
- Test: `test/unit/reader/settings.test.ts`, `test/unit/webview/settingsView.test.ts`, `test/unit/webview/themeTokens.test.ts`

**Interfaces:**
- Produces settings: `fontSize` 12–32 px, `lineHeight` 1.2–2.2, `contentWidth` 480–1200 px, `bossTemplate` `'typescript' | 'json' | 'buildLog'`.
- Produces: `ReaderSettingsService.read/update(baseVersion, patch)` with field-level last-write-wins.

- [ ] **Step 1: Write failing range, persistence, and theme-token tests**

```ts
expect(validateSettings({ fontSize: 11 }).ok).toBe(false);
expect(mergeSettings(a, b).fontSize).toBe(b.fontSize);
expect(readerCss).toContain('var(--vscode-editor-foreground)');
expect(readerCss).not.toMatch(/#[0-9a-f]{6}/i);
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --run test/unit/reader/settings.test.ts test/unit/webview/settingsView.test.ts test/unit/webview/themeTokens.test.ts`
Expected: FAIL with missing settings modules.

- [ ] **Step 3: Implement validated controls and CSS custom properties**

```ts
document.documentElement.style.setProperty('--moyu-font-size', `${settings.fontSize}px`);
document.documentElement.style.setProperty('--moyu-line-height', String(settings.lineHeight));
document.documentElement.style.setProperty('--moyu-content-width', `${settings.contentWidth}px`);
```

Use labels, native range/select controls, keyboard operation, high-contrast borders, visible focus, and `prefers-reduced-motion`.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- --run test/unit/reader/settings.test.ts test/unit/webview/settingsView.test.ts test/unit/webview/themeTokens.test.ts && npm run build`
Expected: PASS for validation, persistence, field merge, theme tokens, keyboard labels, contrast hooks, and reduced motion.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/reader/settings.ts src/application/reader/ReaderSettingsService.ts src/infrastructure/storage/preferencesRepository.ts src/shared/protocol/messages.ts webview/settings webview/reader/reader.css test/unit/reader/settings.test.ts test/unit/webview/settingsView.test.ts test/unit/webview/themeTokens.test.ts
git commit -m "feat: add reader settings and theme adaptation"
```

### Task 20: Boss Overlay and Full Module Restoration

**Files:**
- Create: `webview/boss/templates.ts`, `webview/boss/BossOverlay.ts`, `webview/boss/boss.css`, `webview/shell/moduleLifecycle.ts`
- Modify: `webview/shell/app.ts`, `src/application/boss/BossModeService.ts`, `src/extension/commands.ts`, `package.json`
- Test: `test/unit/webview/bossOverlay.test.ts`, `test/unit/boss/restoration.test.ts`, `test/extension/suite/bossMode.test.ts`

**Interfaces:**
- Produces: `ModuleLifecycle.capture(): ModuleSnapshot`, `pause()`, `resume(snapshot)`, `BossOverlay.show(template)`, `hide()`.
- Keybinding: Windows `ctrl+m`, command `moyu.toggleBossMode`, when `moyu.isOpen && moyu.isVisible`.

- [ ] **Step 1: Write failing overlay, title, focus, and state-identity tests**

```ts
const before = app.captureIdentity();
await boss.enter('typescript');
expect(normalRegion.inert).toBe(true);
await boss.exit();
expect(app.captureIdentity()).toEqual(before);
expect(panel.title).toBe(originalTitle);
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --run test/unit/webview/bossOverlay.test.ts test/unit/boss/restoration.test.ts`
Expected: FAIL with missing overlay/lifecycle.

- [ ] **Step 3: Implement static templates and reversible overlay**

```ts
const pre = document.createElement('pre');
pre.textContent = BOSS_TEMPLATES[template];
this.overlay.replaceChildren(pre);
this.normalRegion.inert = true;
this.overlay.hidden = false;
```

Keep existing reader/game controllers mounted, pause nonessential animations, store logical focus/scroll anchor, acknowledge transition to host, change title only, and always start restored/new panels in `NORMAL`.

- [ ] **Step 4: Run GREEN and real keybinding integration test**

Run: `npm test -- --run test/unit/webview/bossOverlay.test.ts test/unit/boss && npm run test:extension -- --grep "boss mode"`
Expected: PASS for all three templates, enter/exit, rapid toggles, hidden/absent no-op, reader locator identity, exact 2048 board identity, title, focus, timer, and context keys.

- [ ] **Step 5: Commit**

```powershell
git add webview/boss webview/shell src/application/boss src/extension/commands.ts package.json test/unit/webview/bossOverlay.test.ts test/unit/boss test/extension/suite/bossMode.test.ts
git commit -m "feat: add instant reversible boss overlay"
```

### Task 21: Error Mapping, Refresh Strategy, and Recovery UX

**Files:**
- Create: `src/domain/shared/errors.ts`, `src/extension/errorPresenter.ts`, `src/application/sessions/WebviewSessionRegistry.ts`, `src/application/sessions/RefreshCoordinator.ts`, `webview/shell/ErrorView.ts`
- Modify: `src/extension/panel/PanelController.ts`, `src/shared/protocol/result.ts`
- Test: `test/unit/errors/errorPresenter.test.ts`, `test/unit/sessions/RefreshCoordinator.test.ts`, `test/unit/webview/errorView.test.ts`

**Interfaces:**
- Produces stable error codes and actions from the spec.
- Produces: `sessionRegistry.broadcast(event)`, `refreshCoordinator.onCreated/onRevealed/onNavigated/beforeMutation`.

- [ ] **Step 1: Write failing safe-message and refresh-point tests**

```ts
expect(present(new Error('C:\\private\\book.txt'))).not.toContain('C:\\private');
await coordinator.beforeMutation('bookshelf');
expect(repository.readLatest).toHaveBeenCalledOnce();
expect(sessions.forOtherProcess).toBeUndefined();
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --run test/unit/errors test/unit/sessions test/unit/webview/errorView.test.ts`
Expected: FAIL with missing mapping and coordinator.

- [ ] **Step 3: Implement bounded actions and honest synchronization**

```ts
const actions: Record<ErrorCode, readonly RecoveryAction[]> = {
  BOOK_NOT_FOUND: ['relocate', 'removeFromBookshelf'],
  ENCODING_AMBIGUOUS: ['selectEncoding'],
  TXT_INDEX_INVALID: ['rebuildIndex'],
  GAME_SESSION_STALE: ['reloadGame'],
};
```

Broadcast within one Extension Host only. Across windows, refresh from locked repository at create, restore, reveal, navigation, and before mutation; label temporary staleness as a documented limitation rather than simulated realtime sync.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- --run test/unit/errors test/unit/sessions test/unit/webview/errorView.test.ts`
Expected: PASS for redaction, action mapping, cancellation, same-host broadcast, cross-window refresh points, and stale conflict UI.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/shared src/extension/errorPresenter.ts src/application/sessions src/extension/panel/PanelController.ts src/shared/protocol/result.ts webview/shell/ErrorView.ts test/unit/errors test/unit/sessions test/unit/webview/errorView.test.ts
git commit -m "feat: add recovery UX and multi-window refresh"
```

### Task 22: Extension Integration and Windows Acceptance Harness

**Files:**
- Create: `test/extension/runTests.ts`, `test/extension/suite/index.ts`, `test/extension/suite/activation.test.ts`, `test/extension/suite/restartRecovery.test.ts`, `test/extension/suite/multiWindow.test.ts`
- Create: `test/acceptance/windows-v1-checklist.md`, `scripts/create-test-fixtures.mjs`
- Modify: `package.json`, `.vscode/tasks.json`

**Interfaces:**
- Produces `npm run test:extension:current` for the current development VS Code and `npm run test:extension:min` using an isolated downloaded VS Code `1.96.0` through `@vscode/test-electron`.
- Produces deterministic isolated user-data, extension, global-storage, TXT, and EPUB fixture directories.

- [ ] **Step 1: Write failing activation/restart/multi-process tests**

```ts
await vscode.commands.executeCommand('moyu.openBooks');
assert.equal(await vscode.commands.getCommands(true).then(x => x.includes('moyu.toggleBossMode')), true);
await closeAndRestorePanel();
assert.deepEqual(await readRestoredGame(), savedGame);
```

- [ ] **Step 2: Run RED**

Run: `npm run test:extension`
Expected: FAIL because the runner and full lifecycle suite are absent.

- [ ] **Step 3: Add isolated Extension Host and child-process transaction harnesses**

```ts
await runTests({
  version: '1.96.0',
  extensionDevelopmentPath,
  extensionTestsPath,
  launchArgs: [fixtureWorkspace, '--disable-extensions'],
});
```

Generate fixtures under test temp storage, never user folders. The current-version lane covers daily F5/integration. The minimum lane pins `version: '1.96.0'` and must smoke activation, Webview creation/message flow, TXT import/read, 2048 move/restore, and Boss Mode enter/exit. Exercise Sidebar navigation, panel serializer, picker cancellation, restart recovery, boss contexts, and competing Node child processes against one state directory. The lock suite includes heartbeat, crashed owner, live-slow owner, timeout, one-winner quarantine, wrong-token release, process serialization, and crash recovery of the highest valid generation.

- [ ] **Step 4: Run GREEN on Windows**

Run: `npm run build && npm test && npm run test:extension:current && npm run test:extension:min`
Expected: PASS with zero failed unit/integration tests in both runtime lanes; the VS Code 1.96.0 lane passes activation, Webview, TXT, 2048, and Boss Mode smoke. Only this PASS permits retaining `engines.vscode: ^1.96.0`. The manual checklist records Windows version, VS Code version, theme, high contrast, keybinding reassignment, and two-window conflict observations.

- [ ] **Step 5: Commit**

```powershell
git add test/extension test/acceptance scripts/create-test-fixtures.mjs package.json .vscode/tasks.json
git commit -m "test: add Windows extension acceptance harness"
```

### Task 23: README, Packaging, and Final Regression

**Files:**
- Create: `README.md`, `CHANGELOG.md`, `LICENSE`, `.vscodeignore`, `docs/architecture.md`, `docs/decisions.md`, `docs/changelog.md`, `docs/todo.md`
- Create: `scripts/verify-package.mjs`, `scripts/scan-package-secrets.mjs`
- Modify: `package.json`, `PROJECT_CONTEXT.md`
- Test: `test/unit/packaging/packageContents.test.ts`, `test/unit/docs/readmeCommands.test.ts`

**Interfaces:**
- Produces: `npm run package` and a VSIX containing only approved runtime assets.
- Documents installation, development, F5, build/test/package, import, encoding confirmation, reader, 2048, boss key conflict/rebinding, local data placement, multi-window limitations, and source-file safety.

- [ ] **Step 1: Write failing documentation and package allowlist tests**

```ts
expect(readme).toContain('Ctrl+M');
expect(readme).toContain('Remove from bookshelf never deletes the source file');
expect(vsixEntries).not.toContainEqual(expect.stringMatching(/node_modules|test\/fixtures|\.env|\.git/));
expect(vsixEntries).toContain('extension/dist/extension.js');
```

- [ ] **Step 2: Run RED**

Run: `npm test -- --run test/unit/packaging/packageContents.test.ts test/unit/docs/readmeCommands.test.ts`
Expected: FAIL because release documentation and package gate are absent.

- [ ] **Step 3: Write release docs and strict VSIX verification**

```js
const forbidden = [/\.env/i, /credentials?/i, /auth/i, /test\/fixtures/i, /\.git\//];
for (const entry of vsixEntries) {
  if (forbidden.some(pattern => pattern.test(entry))) throw new Error(`Forbidden VSIX entry: ${entry}`);
}
```

Set `.vscodeignore` to exclude sources not required at runtime, tests, caches, logs, maps if not shipped, secrets, and docs not intended for users. `npm run package` must run format check, lint, unit tests, both current and minimum-version extension lanes, build, secret scan, `vsce ls`, package, inspect archive, and isolated install smoke without publishing.

- [ ] **Step 4: Run full clean-checkout regression**

Run in a fresh worktree: `npm ci && npm run format:check && npm run lint && npm test && npm run build && npm run test:extension:current && npm run test:extension:min && npm run package`
Expected: every command exits 0; one VSIX is produced; archive inspection finds no forbidden file; isolated current and VS Code 1.96.0 installs open Moyu, and the minimum install completes activation, Webview, TXT, 2048, and Boss Mode smoke. Failure of that minimum lane blocks the `^1.96.0` compatibility claim.

- [ ] **Step 5: Commit**

```powershell
git add README.md CHANGELOG.md LICENSE .vscodeignore docs scripts package.json PROJECT_CONTEXT.md test/unit/packaging test/unit/docs
git commit -m "docs: complete V1 packaging and user guide"
```

## Plan Self-Review

### Spec coverage

- Product entry, Sidebar/Panel topology, Webview lifecycle, typed protocol, CSP, commands, keybindings, and debug flow: Tasks 1, 2, 5, 6, 20, and 22.
- Cross-process lease persistence, heartbeat/liveness rules, evidence-gated quarantine, short locked mutations, module merges, refresh limitations, migrations, and crash recovery: Tasks 3, 4, 9, 11, 14, 21, and 22.
- TXT encoding confirmation, large-file streaming, logical progress, and continuous safe UI: Tasks 12–15 and 18–19.
- EPUB numerical security boundary, text-only capability, chapters, cache, and progress: Tasks 16–18.
- Pure/testable 2048, persistence, keyboard UI, victory/game-over, and restore: Tasks 8–10 and 22.
- Boss state machine, Overlay, focus/title/context restoration, absent no-op, and state identity: Tasks 7 and 20.
- Runtime separation (Node 22 tools, Node 20.18 Extension Host, Chromium 128 Webview), Windows acceptance, current/minimum VS Code lanes, F5, clean build/test, documentation, VSIX contents, and isolated install: Tasks 1, 22, and 23.
- Cross-platform-friendly paths and future readiness are enforced globally and verified through platform-injected Task 11 tests; macOS/Linux are not V1 acceptance targets.

### Type and interface consistency

- Task 2 owns protocol unions; later tasks extend only the named request/event families and retain the same envelope/1 MiB guard.
- Task 3 owns `transactJson`; all critical repositories in Task 4 and later consume it instead of direct `globalState` writes.
- Task 8 owns the immutable 2048 engine; Tasks 9–10 consume it without duplicating rules.
- Task 11 owns `BookMetadata` identity; TXT, EPUB, bookshelf, progress, and relocation tasks reuse the UUID.
- Task 14 owns logical locators; Webview Tasks 15 and 20 capture/restore those locators, not pixel offsets.
- Task 7 owns the NORMAL/BOSS_MODE transition; Task 20 supplies the DOM lifecycle adapter and never creates a second state machine.

### Placeholder and scope check

The plan contains no unspecified implementation task, future feature, backend, account, network feature, image rendering, hard disguise implementation, or whole-system task. Task 16 pins a concrete, license-compatible ZIP/XML/HTML stack behind the numerical security boundary. Each task produces a reviewable vertical or foundational capability, includes a failing test, exact focused verification, and one local commit.
