import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { TextReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js';

const FIXTURE_KIND = 'moyu-vscode-v1-test-fixtures';
const FIXTURE_VERSION = 1;
const DEFAULT_ROOT = join(
  process.env.TEMP ?? process.env.TMP ?? process.cwd(),
  'moyu-vscode-v1-fixtures',
);
const GENERATED_NAMES = [
  'workspace',
  'user-data',
  'extensions',
  'global-storage',
  'multi-window-state',
  'vscode-cache',
  'suite.cjs',
  'transaction-child.cjs',
];

function assertTempRoot(root) {
  const absoluteRoot = resolve(root);
  const temporaryRoot = resolve(
    process.env.TEMP ?? process.env.TMP ?? process.cwd(),
  );
  const pathFromTemp = relative(temporaryRoot, absoluteRoot);
  if (
    !isAbsolute(absoluteRoot) ||
    pathFromTemp === '..' ||
    pathFromTemp.startsWith(`..${'\\'}`) ||
    pathFromTemp.startsWith(`..${'/'}`)
  ) {
    throw new Error(
      'Test fixtures must stay inside the operating-system temp directory.',
    );
  }
  return absoluteRoot;
}

async function readMarker(markerPath) {
  try {
    return JSON.parse(await readFile(markerPath, 'utf8'));
  } catch {
    return undefined;
  }
}

async function prepareRoot(root) {
  if (existsSync(root)) {
    const marker = await readMarker(join(root, '.moyu-fixtures.json'));
    if (marker?.kind !== FIXTURE_KIND || marker.version !== FIXTURE_VERSION) {
      throw new Error(
        `Refusing to clear an unmarked fixture directory: ${root}`,
      );
    }
    await Promise.all(
      GENERATED_NAMES.map((name) =>
        rm(join(root, name), { recursive: true, force: true }),
      ),
    );
  } else {
    await mkdir(root, { recursive: true });
  }
}

async function buildEpub() {
  const writer = new ZipWriter(new Uint8ArrayWriter());
  await writer.add('mimetype', new TextReader('application/epub+zip'));
  await writer.add(
    'META-INF/container.xml',
    new TextReader(
      '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    ),
  );
  await writer.add(
    'OEBPS/content.opf',
    new TextReader(
      '<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">Moyu Fixture</dc:title></metadata><manifest><item id="chapter-1" href="chapter-1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter-1"/></spine></package>',
    ),
  );
  await writer.add(
    'OEBPS/chapter-1.xhtml',
    new TextReader(
      '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Fixture Chapter</h1><p>This is an isolated EPUB acceptance fixture.</p></body></html>',
    ),
  );
  return writer.close();
}

export async function createTestFixtures(requestedRoot = DEFAULT_ROOT) {
  const root = assertTempRoot(requestedRoot);
  await prepareRoot(root);

  const paths = {
    root,
    workspace: join(root, 'workspace'),
    userData: join(root, 'user-data'),
    extensions: join(root, 'extensions'),
    globalStorage: join(root, 'global-storage'),
    multiWindowState: join(root, 'multi-window-state'),
    vscodeCache: join(root, 'vscode-cache'),
    txtBook: join(root, 'workspace', 'fixture.txt'),
    epubBook: join(root, 'workspace', 'fixture.epub'),
    suiteBundle: join(root, 'suite.cjs'),
    transactionChild: join(root, 'transaction-child.cjs'),
  };
  await Promise.all([
    mkdir(paths.workspace, { recursive: true }),
    mkdir(paths.userData, { recursive: true }),
    mkdir(paths.extensions, { recursive: true }),
    mkdir(paths.globalStorage, { recursive: true }),
    mkdir(paths.multiWindowState, { recursive: true }),
    mkdir(paths.vscodeCache, { recursive: true }),
  ]);
  await writeFile(
    paths.txtBook,
    'Moyu acceptance fixture\r\n第二段文本。\r\n',
    'utf8',
  );
  await writeFile(paths.epubBook, await buildEpub());
  await writeFile(
    join(root, '.moyu-fixtures.json'),
    `${JSON.stringify(
      { kind: FIXTURE_KIND, version: FIXTURE_VERSION },
      null,
      2,
    )}\n`,
    'utf8',
  );
  return Object.freeze(paths);
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  createTestFixtures(process.argv[2] ?? DEFAULT_ROOT)
    .then((paths) => {
      process.stdout.write(`${JSON.stringify(paths)}\n`);
    })
    .catch((error) => {
      console.error(
        error instanceof Error ? error.message : 'Fixture creation failed.',
      );
      process.exitCode = 1;
    });
}
