import { describe, expect, it } from 'vitest';
import { Router } from '../../../webview/shell/router';

describe('Router', () => {
  it('navigates to a supported section and renders it', () => {
    const seen: string[] = [];
    const router = new Router((section) => seen.push(section));
    expect(router.navigate('reader').current).toBe('reader');
    expect(seen).toEqual(['reader']);
  });

  it('accepts the additive Home route and preserves subscriptions', () => {
    const seen: string[] = [];
    const router = new Router((section) => seen.push(section));
    const unsubscribe = router.subscribe((section) =>
      seen.push(`event:${section}`),
    );

    expect(router.navigate('home').current).toBe('home');
    expect(seen).toEqual(['home', 'event:home']);
    unsubscribe();
    router.navigate('books');
    expect(seen).toEqual(['home', 'event:home', 'books']);
  });
});
