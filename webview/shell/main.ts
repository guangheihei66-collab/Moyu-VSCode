import { createApp } from './app';

const root = document.querySelector<HTMLElement>('#app');

if (root === null) {
  throw new Error('Moyu Webview root is missing.');
}

createApp(root);
