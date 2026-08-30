import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { EpubBookIndex, EpubChapter } from '../../domain/reader/epub';
import { BoundedZip } from './BoundedZip';
import { EPUB_LIMITS, EpubSecurityError, assertWithinLimit } from './limits';
import { parseXmlWithinLimits, type SafeXmlNode } from './safeXml';
import { extractChapterTitle, sanitizeChapter } from './sanitizeChapter';

interface FileUri {
  fsPath: string;
}

export class EpubParser {
  async parse(uri: FileUri): Promise<EpubBookIndex> {
    const source = await stat(uri.fsPath);
    const zip = await BoundedZip.open(uri);
    try {
      if (zip.entries.includes('META-INF/encryption.xml')) {
        throw new EpubSecurityError(
          'EPUB_INVALID_ARCHIVE',
          'DRM-protected EPUB is unsupported',
        );
      }
      const container = parseXmlWithinLimits(
        await zip.read('META-INF/container.xml'),
        EPUB_LIMITS.containerXmlBytes,
        EPUB_LIMITS.markupDepth,
      );
      const rootfile = findNodes(container, 'rootfile')[0];
      const opfPath = attribute(rootfile, 'full-path');
      if (opfPath === undefined)
        throw invalid('EPUB container has no rootfile');
      const opfBytes = await zip.read(opfPath);
      assertWithinLimit('OPF bytes', opfBytes.byteLength, EPUB_LIMITS.opfBytes);
      const opf = parseXmlWithinLimits(
        opfBytes,
        EPUB_LIMITS.opfBytes,
        EPUB_LIMITS.markupDepth,
      );
      const manifest = new Map(
        findNodes(opf, 'item').map((item) => [
          attribute(item, 'id') ?? '',
          item,
        ]),
      );
      const spine = findNodes(opf, 'itemref');
      assertWithinLimit('EPUB chapters', spine.length, EPUB_LIMITS.chapters);
      const chapters: EpubChapter[] = [];
      for (const itemref of spine) {
        const id = attribute(itemref, 'idref');
        const item = id === undefined ? undefined : manifest.get(id);
        if (id === undefined || item === undefined || !isChapter(item))
          continue;
        const href = attribute(item, 'href');
        if (href === undefined) continue;
        const chapterPath = resolveEntry(opfPath, href);
        const bytes = await zip.read(chapterPath);
        assertWithinLimit(
          'chapter markup bytes',
          bytes.byteLength,
          EPUB_LIMITS.chapterMarkupBytes,
        );
        const markup = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        const paragraphs = sanitizeChapter(markup);
        chapters.push({
          id,
          title:
            extractChapterTitle(markup) ??
            path.posix.basename(href, path.posix.extname(href)) ??
            id,
          paragraphs,
          contentFingerprint: createHash('sha256')
            .update(paragraphs.join('\n'))
            .digest('hex'),
        });
      }
      return {
        schemaVersion: 1,
        sourceFingerprint: createHash('sha256')
          .update(`${source.size}:${source.mtimeMs}`)
          .digest('hex'),
        chapters,
      };
    } finally {
      await zip.close();
    }
  }
}

function findNodes(root: SafeXmlNode | undefined, name: string): SafeXmlNode[] {
  if (root === undefined) return [];
  const found = localName(root.name) === name ? [root] : [];
  for (const child of root.children)
    if (typeof child !== 'string') found.push(...findNodes(child, name));
  return found;
}

function localName(name: string): string {
  return name.toLowerCase().split(':').pop() ?? name;
}
function attribute(
  node: SafeXmlNode | undefined,
  name: string,
): string | undefined {
  if (node === undefined) return undefined;
  const entry = Object.entries(node.attributes).find(
    ([key]) => localName(key) === name,
  );
  return entry?.[1];
}
function isChapter(node: SafeXmlNode): boolean {
  const media = attribute(node, 'media-type');
  return media === 'application/xhtml+xml' || media === 'text/html';
}
function resolveEntry(opfPath: string, href: string): string {
  const decoded = decodeURIComponent(href.split('#')[0] ?? '');
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(opfPath), decoded),
  );
  if (resolved.startsWith('../') || path.posix.isAbsolute(resolved))
    throw new EpubSecurityError('EPUB_UNSAFE_PATH', 'Unsafe manifest path');
  return resolved;
}
function invalid(message: string): EpubSecurityError {
  return new EpubSecurityError('EPUB_INVALID_ARCHIVE', message);
}
