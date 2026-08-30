import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5';
import { EPUB_LIMITS, assertWithinLimit } from './limits';

type Node = DefaultTreeAdapterTypes.Node;

const blocked = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'svg',
  'math',
  'audio',
  'video',
  'source',
  'track',
  'canvas',
  'template',
]);
const blocks = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'div',
  'figcaption',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'li',
  'main',
  'p',
  'pre',
  'section',
  'td',
  'th',
]);

export function sanitizeChapter(markup: string): string[] {
  assertWithinLimit(
    'chapter markup bytes',
    Buffer.byteLength(markup, 'utf8'),
    EPUB_LIMITS.chapterMarkupBytes,
  );
  const fragment = parseFragment(markup);
  const paragraphs: string[] = [];
  for (const child of fragment.childNodes) visit(child, 1, paragraphs, false);
  let outputBytes = 0;
  for (const paragraph of paragraphs) {
    outputBytes += Buffer.byteLength(paragraph, 'utf8');
    assertWithinLimit(
      'chapter text bytes',
      outputBytes,
      EPUB_LIMITS.chapterTextBytes,
    );
  }
  return paragraphs;
}

function visit(
  node: Node,
  depth: number,
  output: string[],
  insideBlock: boolean,
): string {
  assertWithinLimit('chapter markup depth', depth, EPUB_LIMITS.markupDepth);
  if (node.nodeName === '#text') return normalize(node.value);
  if (!('tagName' in node)) return '';
  const tag = node.tagName.toLowerCase();
  if (blocked.has(tag)) return '';
  if (tag === 'img' || tag === 'picture') {
    if (!insideBlock) output.push('[Image omitted]');
    return '[Image omitted]';
  }
  const isBlock = blocks.has(tag);
  if (isBlock && hasBlockChild(node)) {
    for (const child of node.childNodes) visit(child, depth + 1, output, false);
    return '';
  }
  const text = normalize(
    node.childNodes
      .map((child) => visit(child, depth + 1, output, insideBlock || isBlock))
      .join(' '),
  );
  if (isBlock && !insideBlock && text.length > 0) output.push(text);
  else if (!isBlock && !insideBlock && text.length > 0) output.push(text);
  return text;
}

function hasBlockChild(node: DefaultTreeAdapterTypes.Element): boolean {
  return node.childNodes.some(
    (child) => 'tagName' in child && blocks.has(child.tagName.toLowerCase()),
  );
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
