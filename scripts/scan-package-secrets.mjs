import { access, readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const SECRET_PATTERNS = Object.freeze([
  {
    name: 'private key',
    pattern: /-----BEGIN (?:RSA|OPENSSH|EC|DSA) PRIVATE KEY-----/i,
  },
  {
    name: 'secret assignment',
    pattern:
      /\b(?:OPENAI_API_KEY|API_KEY|PASSWORD|SECRET|TOKEN)\s*[:=]\s*["']?[^\s#"']{8,}/i,
  },
  {
    name: 'provider token',
    pattern:
      /\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/,
  },
]);

export function findSecretPatterns(text) {
  return SECRET_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
    ({ name }) => name,
  );
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(root) {
  const result = [];
  if (!(await fileExists(root))) return result;
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...(await walkFiles(path)));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

async function packageInputs(root) {
  const files = [
    join(root, 'package.json'),
    join(root, 'README.md'),
    join(root, 'LICENSE'),
  ];
  for (const directory of ['dist', 'media']) {
    files.push(...(await walkFiles(join(root, directory))));
  }
  return [...new Set(files)].filter(
    (path) => !path.toLowerCase().endsWith('.map'),
  );
}

export async function scanPackageInputs(root = process.cwd()) {
  const findings = [];
  const files = await packageInputs(resolve(root));
  for (const path of files) {
    try {
      const fileStat = await stat(path);
      if (!fileStat.isFile()) continue;
      const content = await readFile(path);
      if (content.includes(0)) continue;
      const matches = findSecretPatterns(content.toString('utf8'));
      if (matches.length > 0) findings.push({ path, matches });
    } catch (error) {
      throw new Error(
        `Unable to scan package input ${path}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  if (findings.length > 0) {
    throw new Error(
      findings
        .map(({ path, matches }) => `${path}: ${matches.join(', ')}`)
        .join('\n'),
    );
  }
  return Object.freeze({ filesScanned: files.length, findings });
}

if (process.argv[1] !== undefined) {
  const current = resolve(process.argv[1]);
  const modulePath = resolve(new URL('.', import.meta.url).pathname);
  if (current.endsWith('scan-package-secrets.mjs') && modulePath) {
    scanPackageInputs()
      .then(({ filesScanned }) => {
        console.log(
          `No package secret patterns found in ${filesScanned} files.`,
        );
      })
      .catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
      });
  }
}
