import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({ window: {}, commands: {} }));

describe('book import host workflow', () => {
  it('uses TXT/EPUB filters and treats picker cancellation as a no-op', async () => {
    const { pickBookUri } = await import('../../../src/extension/commands');
    const window = {
      showOpenDialog: vi.fn(async () => undefined),
      showWarningMessage: vi.fn(),
      showQuickPick: vi.fn(),
    };
    await expect(pickBookUri(window as never)).resolves.toBeUndefined();
    expect(window.showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        canSelectMany: false,
        filters: { 'TXT and EPUB books': ['txt', 'epub'] },
      }),
    );
  });

  it('requires explicit removal confirmation and states the source is retained', async () => {
    const { confirmBookshelfRemoval } = await import(
      '../../../src/extension/commands'
    );
    const window = {
      showOpenDialog: vi.fn(),
      showWarningMessage: vi.fn(async () => undefined),
      showQuickPick: vi.fn(),
    };
    await expect(
      confirmBookshelfRemoval(window as never, 'Book'),
    ).resolves.toBe(false);
    expect(window.showWarningMessage.mock.calls[0]?.[0]).toContain(
      'original TXT/EPUB file will not be deleted',
    );
  });
});
