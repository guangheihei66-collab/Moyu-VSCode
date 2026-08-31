import { build } from 'esbuild';
import { access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Writable } from 'node:stream';
import { runTests } from '@vscode/test-electron';
import { createTestFixtures } from '../../scripts/create-test-fixtures.mjs';

type Lane = 'current' | 'min';

interface FixturePaths {
  root: string;
  workspace: string;
  userData: string;
  extensions: string;
  suiteBundle: string;
  transactionChild: string;
}

interface CapturedStream {
  stream: Writable;
  close(): Promise<void>;
  tail(): string;
}

function parseLane(args: readonly string[]): Lane {
  const index = args.indexOf('--lane');
  const lane = index < 0 ? undefined : args[index + 1];
  if (lane !== 'current' && lane !== 'min') {
    throw new Error('Use --lane current or --lane min.');
  }
  return lane;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function capture(path: string): CapturedStream {
  const file = createWriteStream(path, { encoding: 'utf8' });
  let recent = '';
  const stream = new Writable({
    write(chunk, encoding, callback) {
      const text =
        chunk instanceof Buffer ? chunk.toString('utf8') : String(chunk);
      recent = `${recent}${text}`.slice(-12_000);
      void encoding;
      file.write(text, callback);
    },
  });
  return {
    stream,
    close: () =>
      new Promise<void>((resolvePromise, reject) => {
        file.once('error', reject);
        file.end(() => resolvePromise());
      }),
    tail: () => recent,
  };
}

async function buildTestBundles(
  extensionRoot: string,
  fixtures: FixturePaths,
): Promise<void> {
  await Promise.all([
    build({
      entryPoints: [resolve(extensionRoot, 'test/extension/suite/index.ts')],
      outfile: fixtures.suiteBundle,
      bundle: true,
      external: ['vscode'],
      format: 'cjs',
      logLevel: 'silent',
      platform: 'node',
      target: 'node20.18',
    }),
    build({
      entryPoints: [
        resolve(extensionRoot, 'test/fixtures/storage/transactionChild.ts'),
      ],
      outfile: fixtures.transactionChild,
      bundle: true,
      format: 'cjs',
      logLevel: 'silent',
      platform: 'node',
      target: 'node20.18',
    }),
  ]);
}

function currentExecutable(): string {
  const candidates = [
    process.env.MOYU_VSCODE_EXECUTABLE,
    process.env.LOCALAPPDATA === undefined
      ? undefined
      : join(
          process.env.LOCALAPPDATA,
          'Programs',
          'Microsoft VS Code',
          'Code.exe',
        ),
    process.env.ProgramFiles === undefined
      ? undefined
      : join(process.env.ProgramFiles, 'Microsoft VS Code', 'Code.exe'),
  ].filter((path): path is string => path !== undefined);
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }

  try {
    const commands = execFileSync('where.exe', ['code'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    })
      .split(/\r?\n/)
      .map((path) => path.trim())
      .filter((path) => path.length > 0);
    for (const command of commands) {
      const normalized = command.toLowerCase().replaceAll('/', '\\');
      const candidate =
        normalized.endsWith('\\code') || normalized.endsWith('\\code.cmd')
          ? resolve(dirname(command), '..', 'Code.exe')
          : command;
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    // Fall through to the actionable error below.
  }
  throw new Error(
    'Current VS Code executable was not found. Set MOYU_VSCODE_EXECUTABLE to Code.exe.',
  );
}

async function main(): Promise<void> {
  const extensionRoot = resolve(
    dirname(process.argv[1] ?? process.cwd()),
    '../..',
  );
  if (!(await fileExists(resolve(extensionRoot, 'dist/extension.js')))) {
    throw new Error('Run npm run build before starting Extension Host tests.');
  }
  const lane = parseLane(process.argv.slice(2));
  const fixtures = (await createTestFixtures()) as FixturePaths;
  await buildTestBundles(extensionRoot, fixtures);

  const stdout = capture(join(fixtures.root, `extension-${lane}.stdout.log`));
  const stderr = capture(join(fixtures.root, `extension-${lane}.stderr.log`));
  const minimumCache =
    process.env.MOYU_VSCODE_MIN_CACHE ?? join(fixtures.root, 'vscode-cache');
  let passed = false;
  try {
    const options = {
      extensionDevelopmentPath: extensionRoot,
      extensionTestsPath: fixtures.suiteBundle,
      extensionTestsEnv: {
        MOYU_TEST_FIXTURE_ROOT: fixtures.root,
        MOYU_TEST_TRANSACTION_CHILD: fixtures.transactionChild,
        MOYU_TEST_NODE_EXECUTABLE: process.execPath,
        MOYU_TEST_TXT_BOOK: join(fixtures.root, 'workspace', 'fixture.txt'),
        MOYU_TEST_EPUB_BOOK: join(fixtures.root, 'workspace', 'fixture.epub'),
      },
      launchArgs: [
        fixtures.workspace,
        '--disable-extensions',
        `--user-data-dir=${fixtures.userData}`,
        `--extensions-dir=${fixtures.extensions}`,
        '--disable-telemetry',
      ],
      reuseMachineInstall: false,
      stdout: stdout.stream,
      stderr: stderr.stream,
    };
    const code =
      lane === 'current'
        ? await runTests({
            ...options,
            vscodeExecutablePath: currentExecutable(),
          })
        : await runTests({
            ...options,
            version: '1.96.0',
            cachePath: minimumCache,
          });
    if (code !== 0)
      throw new Error(`Extension Host test lane exited with ${code}.`);
    passed = true;
    console.log(`Extension Host ${lane} lane passed.`);
  } finally {
    await Promise.all([stdout.close(), stderr.close()]);
    if (!passed) {
      console.error(
        `stdout log: ${join(fixtures.root, `extension-${lane}.stdout.log`)}`,
      );
      console.error(stdout.tail());
      console.error(
        `stderr log: ${join(fixtures.root, `extension-${lane}.stderr.log`)}`,
      );
      console.error(stderr.tail());
    }
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Extension tests failed.',
  );
  process.exitCode = 1;
});
