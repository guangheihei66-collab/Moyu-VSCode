import type { AppSection } from '../../src/shared/protocol/messages';
import { Router } from './router';

export function createApp(root: HTMLElement): {
  router: Router;
  dispose: () => void;
} {
  const router = new Router((section) => {
    const heading = document.createElement('h1');
    heading.textContent = `Moyu · ${section}`;
    root.replaceChildren(heading);
  });
  router.navigate('books' as AppSection);
  return { router, dispose: () => root.replaceChildren() };
}
