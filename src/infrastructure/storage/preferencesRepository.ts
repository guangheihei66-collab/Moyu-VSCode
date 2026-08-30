import type { PreferencesData } from '../../application/persistence/repositories';

export class PreferencesRepository {
  private readonly values: PreferencesData;
  constructor(initial: PreferencesData = {}) {
    this.values = { ...initial };
  }
  async read(): Promise<PreferencesData> {
    return { ...this.values };
  }
  async update(patch: PreferencesData): Promise<PreferencesData> {
    Object.assign(this.values, patch);
    return this.read();
  }
}
