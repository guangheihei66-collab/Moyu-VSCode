import { describe, expect, it } from 'vitest';
import { Router } from '../../../webview/shell/router';

describe('Router', () => {
  it('navigates to a supported section and renders it', () => {
    const seen: string[] = [];
    const router = new Router((section) => seen.push(section));
    expect(router.navigate('reader').current).toBe('reader');
    expect(seen).toEqual(['reader']);
  });
});
