import { describe, expect, it } from 'vitest';
import { sanitizeChapter } from '../../../src/infrastructure/epub/sanitizeChapter';

describe('sanitizeChapter', () => {
  it('extracts safe text and explicit image placeholders from hostile markup', () => {
    const markup = `
      <script>steal()</script><style>.hidden{}</style>
      <p onclick="steal()">Safe <strong>text</strong></p>
      <img src="file:///secret" onerror="steal()">
      <iframe src="https://example.com"></iframe><object>bad</object>
      <embed src="bad"><svg><text>hidden</text></svg><video>media</video>
      <a href="https://example.com">Link text</a>`;
    expect(sanitizeChapter(markup)).toEqual([
      'Safe text',
      '[Image omitted]',
      'Link text',
    ]);
  });

  it('rejects over-deep markup and bounded output overflow', () => {
    const deep = '<div>'.repeat(65) + 'text' + '</div>'.repeat(65);
    expect(() => sanitizeChapter(deep)).toThrowError(
      expect.objectContaining({ code: 'EPUB_LIMIT_EXCEEDED' }),
    );
  });

  it('preserves nested block paragraph boundaries', () => {
    expect(
      sanitizeChapter(
        '<section><p>First <em>paragraph</em></p><p>Second</p></section>',
      ),
    ).toEqual(['First paragraph', 'Second']);
  });
});
