import * as vscode from 'vscode';

export interface ContextKeyValues {
  isOpen: boolean;
  isVisible: boolean;
  isBossMode: boolean;
}

export class ContextKeys {
  private values: ContextKeyValues = {
    isOpen: false,
    isVisible: false,
    isBossMode: false,
  };
  constructor(
    private readonly setContext: (
      key: string,
      value: boolean,
    ) => Thenable<void> | void = (key, value) =>
      vscode.commands.executeCommand('setContext', key, value),
  ) {}
  snapshot(): ContextKeyValues {
    return { ...this.values };
  }
  set(values: Partial<ContextKeyValues>): void {
    this.values = { ...this.values, ...values };
    for (const [key, value] of Object.entries(values))
      void this.setContext(`moyu.${key}`, value);
  }
  clear(): void {
    this.set({ isOpen: false, isVisible: false, isBossMode: false });
  }
}
