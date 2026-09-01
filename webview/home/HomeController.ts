import type { HomeSnapshot } from '../../src/shared/protocol/messages';
import { HomeView, type HomeAction } from './HomeView';

export interface HomeClient {
  readHome(): Promise<HomeSnapshot>;
}

export type { HomeAction } from './HomeView';

export class HomeController {
  private view: HomeView | undefined;
  private generation = 0;

  constructor(
    private readonly client: HomeClient,
    private readonly onAction: (action: HomeAction) => void,
  ) {}

  mount(root: HTMLElement): void {
    const generation = ++this.generation;
    this.view = new HomeView(root, this.onAction);
    void this.refresh(generation);
  }

  render(snapshot: HomeSnapshot): void {
    this.view?.render(snapshot);
  }

  dispose(): void {
    this.generation += 1;
    this.view = undefined;
  }

  private async refresh(generation: number): Promise<void> {
    try {
      const snapshot = await this.client.readHome();
      if (generation === this.generation) this.view?.render(snapshot);
    } catch {
      if (generation !== this.generation) return;
      this.view?.render({
        recentBooks: [],
        booksCount: 0,
      });
    }
  }
}
