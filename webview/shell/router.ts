import type { AppSection } from '../../src/shared/protocol/messages';

export class Router {
  private section: AppSection = 'books';
  private readonly listeners = new Set<(section: AppSection) => void>();
  constructor(
    private readonly render: (section: AppSection) => void = () => undefined,
  ) {}
  get current(): AppSection {
    return this.section;
  }
  navigate(section: AppSection): this {
    this.section = section;
    this.render(section);
    for (const listener of this.listeners) listener(section);
    return this;
  }

  subscribe(listener: (section: AppSection) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
