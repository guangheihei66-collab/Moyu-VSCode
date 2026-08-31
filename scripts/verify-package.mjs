import { execFileSync } from 'node:child_process';
import { Blob, Buffer } from 'node:buffer';
import { createWriteStream, existsSync } from 'node:fs';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { BlobReader, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js';
import { runTests } from '@vscode/test-electron';

export const REQUIRED_VSIX_ENTRIES = Object.freeze([
  '[Content_Types].xml',
  'extension.vsixmanifest',
  'extension/package.json',
  'extension/readme.md',
  'extension/LICENSE.txt',
  'extension/dist/extension.js',
  'extension/dist/webview/main.js',
  'extension/dist/webview/main.css',
  'extension/media/moyu.svg',
]);

const FORBIDDEN_VSIX_PATTERNS = Object.freeze([
  /(?:^|\/)node_modules(?:\/|$)/i,
  /(?:^|\/)(?:test|tests|fixtures)(?:[._-]|\/|$)/i,
  /(?:^|\/)\.env(?:\..*)?$/i,
  /(?:^|\/)\.git(?:\/|$)/i,
  /(?:^|\/)(?:credentials?|auth)(?:[._-]|\/|$)/i,
  /(?:^|\/)(?:coverage|out|\.vscode-test|\.superpowers|\.tools)(?:\/|$)/i,
  /\.(?:map|log|tmp|cache)$/i,
]);

const APPROVED_EXACT_ENTRIES = new Set([
  '[Content_Types].xml',
  'extension.vsixmanifest',
  'extension/package.json',
  'extension/readme.md',
  'extension/LICENSE.txt',
  'extension/media/moyu.svg',
]);

function canonicalEntryName(entry) {
  if (typeof entry !== 'string' || entry.length === 0) {
    throw new Error('VSIX archive contains an invalid empty entry.');
  }
  if (entry.includes('\\') || entry.includes('\0')) {
    throw new Error(`Unsafe VSIX entry: ${entry}`);
  }
  const withoutDirectoryMarker = entry.endsWith('/')
    ? entry.slice(0, -1)
    : entry;
  const parts = withoutDirectoryMarker.split('/');
  if (
    withoutDirectoryMarker.startsWith('/') ||
    /^[a-z]:/i.test(withoutDirectoryMarker) ||
    parts.some((part) => part.length === 0 || part === '.' || part === '..')
  ) {
    throw new Error(`Unsafe VSIX entry: ${entry}`);
  }
  return withoutDirectoryMarker;
}

function isApprovedEntry(entry) {
  return (
    APPROVED_EXACT_ENTRIES.has(entry) || entry.startsWith('extension/dist/')
  );
}

export function validateVsixEntries(entries) {
  const normalized = [];
  const seen = new Set();
  for (const entry of entries) {
    const name = canonicalEntryName(entry);
    if (seen.has(name)) throw new Error(`Duplicate VSIX entry: ${name}`);
    seen.add(name);
    if (FORBIDDEN_VSIX_PATTERNS.some((pattern) => pattern.test(name))) {
      throw new Error(`Forbidden VSIX entry: ${name}`);
    }
    if (!isApprovedEntry(name)) {
      throw new Error(`Unapproved VSIX entry: ${name}`);
    }
    normalized.push(name);
  }
  for (const required of REQUIRED_VSIX_ENTRIES) {
    if (!seen.has(required)) {
      throw new Error(`Missing required VSIX entry: ${required}`);
    }
  }
  return Object.freeze(normalized);
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function capture(path) {
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
      new Promise((resolvePromise, reject) => {
        file.once('error', reject);
        file.end(() => resolvePromise());
      }),
    tail: () => recent,
  };
}

async function withZip(vsixPath, operation) {
  const bytes = await readFile(vsixPath);
  const reader = new ZipReader(new BlobReader(new Blob([bytes])));
  try {
    return await operation(reader);
  } finally {
    await reader.close();
  }
}

export async function readVsixEntries(vsixPath) {
  return withZip(vsixPath, async (reader) => {
    const entries = await reader.getEntries();
    return entries.map((entry) => entry.filename);
  });
}

async function extractVsix(vsixPath, destinationRoot) {
  await mkdir(destinationRoot, { recursive: true });
  await withZip(vsixPath, async (reader) => {
    for (const entry of await reader.getEntries()) {
      const name = canonicalEntryName(entry.filename);
      if (entry.directory) continue;
      if (name === '[Content_Types].xml' || name === 'extension.vsixmanifest') {
        continue;
      }
      if (!name.startsWith('extension/')) {
        throw new Error(`VSIX entry is outside extension root: ${name}`);
      }
      const relativeName = name.slice('extension/'.length);
      const destination = resolve(destinationRoot, relativeName);
      const relativeDestination = relative(destinationRoot, destination);
      if (
        relativeDestination === '..' ||
        relativeDestination.startsWith(`..${'\\'}`) ||
        isAbsolute(relativeDestination)
      ) {
        throw new Error(`VSIX extraction escaped its temporary root: ${name}`);
      }
      await mkdir(dirname(destination), { recursive: true });
      const data = await entry.getData(new Uint8ArrayWriter());
      await writeFile(destination, data);
    }
  });
}

function currentExecutable() {
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
  ].filter((path) => path !== undefined);
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
    'Current VS Code executable was not found for packaged install smoke. Set MOYU_VSCODE_EXECUTABLE to Code.exe.',
  );
}

const PACKAGE_SMOKE_SUITE = `
const assert = require('node:assert/strict');
const vscode = require('vscode');

exports.run = (_args, callback) => {
  void (async () => {
    await vscode.commands.executeCommand('moyu.openBooks');
    const commands = await vscode.commands.getCommands(true);
    for (const command of [
      'moyu.open',
      'moyu.openBooks',
      'moyu.open2048',
      'moyu.openSettings',
      'moyu.toggleBossMode',
    ]) {
      assert.equal(commands.includes(command), true, command + ' is missing');
    }
    const panel = await vscode.commands.executeCommand('moyu.openBooks');
    assert.equal(panel && panel.isVisible, true);
    assert.match(panel.panel.webview.html, /data-session-id=/);
    await vscode.commands.executeCommand('moyu.open2048');
    await vscode.commands.executeCommand('moyu.toggleBossMode');
    await vscode.commands.executeCommand('moyu.toggleBossMode');
  })()
    .then(() => callback(undefined, 0))
    .catch((error) => {
      console.error(error);
      callback(error, 1);
    });
};
`;

async function runPackagedLane(lane, extensionRoot, smokeRoot) {
  const laneRoot = join(smokeRoot, lane);
  const workspace = join(laneRoot, 'workspace');
  const userData = join(laneRoot, 'user-data');
  const extensions = join(laneRoot, 'extensions');
  const cache =
    process.env.MOYU_VSCODE_MIN_CACHE ?? join(laneRoot, 'vscode-cache');
  const suitePath = join(laneRoot, 'suite.cjs');
  await Promise.all([
    mkdir(workspace, { recursive: true }),
    mkdir(userData, { recursive: true }),
    mkdir(extensions, { recursive: true }),
  ]);
  await writeFile(suitePath, PACKAGE_SMOKE_SUITE, 'utf8');
  const stdout = capture(join(laneRoot, 'stdout.log'));
  const stderr = capture(join(laneRoot, 'stderr.log'));
  const options = {
    extensionDevelopmentPath: extensionRoot,
    extensionTestsPath: suitePath,
    launchArgs: [
      workspace,
      '--disable-extensions',
      `--user-data-dir=${userData}`,
      `--extensions-dir=${extensions}`,
      '--disable-telemetry',
    ],
    reuseMachineInstall: false,
    stdout: stdout.stream,
    stderr: stderr.stream,
  };
  let passed = false;
  try {
    const result =
      lane === 'current'
        ? await runTests({
            ...options,
            vscodeExecutablePath: currentExecutable(),
          })
        : await runTests({
            ...options,
            version: '1.96.0',
            cachePath: cache,
          });
    if (result !== 0) {
      throw new Error(
        `Packaged VSIX ${lane} install smoke exited with ${result}.`,
      );
    }
    passed = true;
  } finally {
    await Promise.all([stdout.close(), stderr.close()]);
    if (!passed) {
      console.error(`Packaged VSIX ${lane} stdout: ${stdout.tail()}`);
      console.error(`Packaged VSIX ${lane} stderr: ${stderr.tail()}`);
    }
  }
}

export async function runIsolatedInstallSmoke(vsixPath) {
  const smokeRoot = await mkdtemp(join(tmpdir(), 'moyu-vscode-v1-package-'));
  const extensionRoot = join(smokeRoot, 'extension');
  try {
    await extractVsix(vsixPath, extensionRoot);
    await runPackagedLane('current', extensionRoot, smokeRoot);
    await runPackagedLane('min', extensionRoot, smokeRoot);
  } finally {
    await rm(smokeRoot, {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 250,
    }).catch((error) => {
      console.warn(
        `Packaged smoke temp root remains locked; it can be removed later: ${
          smokeRoot
        } (${error instanceof Error ? error.message : String(error)})`,
      );
    });
  }
}

async function packagePath(argument) {
  if (argument !== undefined) return resolve(argument);
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  const expected = resolve(`${manifest.name}-${manifest.version}.vsix`);
  if (await fileExists(expected)) return expected;
  const candidates = (await readdir(process.cwd()))
    .filter((entry) => entry.endsWith('.vsix'))
    .map((entry) => resolve(entry));
  if (candidates.length === 1) return candidates[0];
  throw new Error(
    `Expected packaged VSIX ${expected}; pass a single archive path explicitly.`,
  );
}

export async function verifyVsixArchive(vsixPath) {
  const entries = await readVsixEntries(vsixPath);
  const normalized = validateVsixEntries(entries);
  console.log(
    `Verified ${normalized.length} VSIX entries for ${resolve(vsixPath)}.`,
  );
  return normalized;
}

async function main() {
  const argument =
    process.argv[2] === '--no-install-smoke' ? undefined : process.argv[2];
  const skipSmoke = process.argv.includes('--no-install-smoke');
  const vsixPath = await packagePath(argument);
  await verifyVsixArchive(vsixPath);
  if (!skipSmoke) {
    await runIsolatedInstallSmoke(vsixPath);
    console.log('Packaged VSIX isolated current/minimum install smoke passed.');
  }
}

if (process.argv[1] !== undefined) {
  const current = resolve(process.argv[1]);
  const modulePath = resolve(fileURLToPath(import.meta.url));
  if (current === modulePath) {
    main().catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
  }
}
