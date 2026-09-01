import { createApp } from './app';
import { MessageClient } from './messageClient';
import {
  PROTOCOL_VERSION,
  type AppSection,
  type HostRequest,
} from '../../src/shared/protocol/messages';
import { validateHostEvent } from '../../src/shared/protocol/validate';

declare function acquireVsCodeApi(): {
  postMessage(message: HostRequest): void;
};

const SECTIONS: readonly AppSection[] = ['home', 'books', 'reader', 'settings'];

const root = document.querySelector<HTMLElement>('#app');

if (root === null) {
  throw new Error('Moyu Webview root is missing.');
}

const sessionId = root.dataset.sessionId ?? '';
const requestedSection = root.dataset.initialSection;
const initialSection = SECTIONS.includes(requestedSection as AppSection)
  ? (requestedSection as AppSection)
  : 'books';
const client = new MessageClient(acquireVsCodeApi(), sessionId);
const app = createApp(root, client, initialSection);

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (client.handleMessage(event.data)) return;
  const validation = validateHostEvent(event.data);
  if (
    validation.ok &&
    validation.value.protocol === PROTOCOL_VERSION &&
    validation.value.sessionId === sessionId &&
    validation.value.type === 'app/navigate'
  ) {
    app.navigate(validation.value.payload.section);
    return;
  }
  if (
    validation.ok &&
    validation.value.protocol === PROTOCOL_VERSION &&
    validation.value.sessionId === sessionId &&
    validation.value.type === 'boss/modeChanged'
  ) {
    app.setBossMode(
      validation.value.payload.mode,
      validation.value.payload.template,
    );
    client.acknowledgeBoss(
      validation.value.payload.requestId,
      validation.value.payload.mode,
    );
  }
});

window.addEventListener('unload', () => {
  client.dispose();
  app.dispose();
});
