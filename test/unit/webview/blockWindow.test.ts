import { describe, expect, it } from 'vitest';
import { BlockWindow } from '../../../webview/reader/blockWindow';
import type { ReaderBlock } from '../../../src/domain/reader/locator';

function block(id: string): ReaderBlock {
  return {
    id,
    paragraphs: [id],
    decodedLength: id.length,
    contentFingerprint: `fp-${id}`,
  };
}

describe('BlockWindow', () => {
  it('deduplicates and trims mounted blocks to a bounded window', () => {
    const window = new BlockWindow(3);
    window.replace([block('1'), block('2'), block('3')]);
    window.append([block('3'), block('4')]);

    expect(window.blocks.map((item) => item.id)).toEqual(['2', '3', '4']);
  });

  it('prepends older blocks while retaining document order', () => {
    const window = new BlockWindow(4);
    window.replace([block('3'), block('4')]);
    window.prepend([block('1'), block('2')]);

    expect(window.blocks.map((item) => item.id)).toEqual(['1', '2', '3', '4']);
  });
});
