import type { AppSection } from '../../src/shared/protocol/messages';

export class Router {
  private section: AppSection = 'books';
  private readonly listeners = new Set<(section: AppSection) => void>();
  private readonly routes = new Map<AppSection, () => void>();
  constructor(
    private readonly render: (section: AppSection) => void = () => undefined,
  ) {}
  get current(): AppSection {
    return this.section;
  }
  navigate(section: AppSection): this {
    this.section = section;
    const route = this.routes.get(section);
    if (route === undefined) this.render(section);
    else route();
    for (const listener of this.listeners) listener(section);
    return this;
  }

  register(section: AppSection, render: () => void): () => void {
    this.routes.set(section, render);
    return () => {
      if (this.routes.get(section) === render) this.routes.delete(section);
    };
  }

  subscribe(listener: (section: AppSection) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
