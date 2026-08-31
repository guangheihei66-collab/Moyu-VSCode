import {
  type SidebarMessage,
  type SidebarViewModel,
} from '../../src/shared/protocol/messages';
import { isSidebarHostMessage } from '../../src/shared/protocol/validate';
import { SidebarView } from './SidebarView';

declare function acquireVsCodeApi(): {
  postMessage(message: SidebarMessage): void;
};

const root = document.querySelector<HTMLElement>('#sidebar-app');
if (root === null) throw new Error('Moyu Sidebar root is missing.');

const initialModel: SidebarViewModel = {
  active: 'home',
  booksCount: 0,
  bestScore: 0,
};
const api = acquireVsCodeApi();
const view = new SidebarView(root, (message) => api.postMessage(message));
view.render(initialModel);

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (isSidebarHostMessage(event.data)) view.render(event.data.model);
});
