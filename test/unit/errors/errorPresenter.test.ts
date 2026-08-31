import { describe, expect, it } from 'vitest';

import { MoyuError } from '../../../src/domain/shared/errors';
import { present } from '../../../src/extension/errorPresenter';

describe('error presenter', () => {
  it('redacts raw messages and local paths for unknown failures', () => {
    const result = present(new Error('Cannot read C:\\private\\book.txt'));

    expect(result.code).toBe('UNKNOWN_ERROR');
    expect(result.message).not.toContain('C:\\private');
    expect(result.message).not.toContain('book.txt');
    expect(result.actions).toEqual(['retry']);
  });

  it.each([
    ['BOOK_NOT_FOUND', ['relocate', 'removeFromBookshelf']],
    ['ENCODING_AMBIGUOUS', ['selectEncoding']],
    ['TXT_INDEX_INVALID', ['rebuildIndex']],
    ['GAME_SESSION_STALE', ['reloadGame']],
  ] as const)('maps %s to bounded recovery actions', (code, actions) => {
    const result = present(new MoyuError(code, 'C:\\private\\secret.txt'));

    expect(result.code).toBe(code);
    expect(result.actions).toEqual(actions);
    expect(result.message).not.toContain('C:\\private');
  });
});
