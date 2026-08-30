import { SaxesParser, type SaxesTagPlain } from 'saxes';
import { EpubSecurityError, assertWithinLimit } from './limits';

export interface SafeXmlNode {
  name: string;
  attributes: Readonly<Record<string, string>>;
  children: Array<SafeXmlNode | string>;
}

export function parseXmlWithinLimits(
  bytes: Uint8Array,
  maxBytes: number,
  maxDepth: number,
): SafeXmlNode {
  assertWithinLimit('XML bytes', bytes.byteLength, maxBytes);
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new EpubSecurityError('EPUB_UNSAFE_XML', 'XML is not valid UTF-8');
  }
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source)) {
    throw new EpubSecurityError(
      'EPUB_UNSAFE_XML',
      'XML document types and entity declarations are forbidden',
    );
  }

  const parser = new SaxesParser({ xmlns: false });
  const stack: SafeXmlNode[] = [];
  let root: SafeXmlNode | undefined;
  let failure: Error | undefined;
  parser.on('opentag', (tag: SaxesTagPlain) => {
    assertWithinLimit('XML depth', stack.length + 1, maxDepth);
    const node: SafeXmlNode = {
      name: tag.name,
      attributes: Object.fromEntries(
        Object.entries(tag.attributes).map(([name, value]) => [
          name,
          String(value),
        ]),
      ),
      children: [],
    };
    const parent = stack[stack.length - 1];
    if (parent === undefined) root = node;
    else parent.children.push(node);
    stack.push(node);
  });
  parser.on('text', (text) => {
    if (text.length > 0) stack[stack.length - 1]?.children.push(text);
  });
  parser.on('closetag', () => {
    stack.pop();
  });
  parser.on('doctype', () => {
    failure = new EpubSecurityError('EPUB_UNSAFE_XML', 'DOCTYPE is forbidden');
  });
  parser.on('error', (error) => {
    failure = error;
  });
  parser.write(source).close();
  if (failure !== undefined) {
    if (failure instanceof EpubSecurityError) throw failure;
    throw new EpubSecurityError('EPUB_UNSAFE_XML', 'XML is malformed');
  }
  if (root === undefined) {
    throw new EpubSecurityError('EPUB_UNSAFE_XML', 'XML has no root element');
  }
  return root;
}
