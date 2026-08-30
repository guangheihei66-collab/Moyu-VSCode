import type { AppSection } from '../../src/shared/protocol/messages';

export class Router {
  private section: AppSection = 'books';
  constructor(
    private readonly render: (section: AppSection) => void = () => undefined,
  ) {}
  get current(): AppSection {
    return this.section;
  }
  navigate(section: AppSection): this {
    this.section = section;
    this.render(section);
    return this;
  }
}
