export interface TestFixturePaths {
  root: string;
  workspace: string;
  userData: string;
  extensions: string;
  globalStorage: string;
  multiWindowState: string;
  vscodeCache: string;
  txtBook: string;
  epubBook: string;
  suiteBundle: string;
  transactionChild: string;
}

export function createTestFixtures(
  requestedRoot?: string,
): Promise<Readonly<TestFixturePaths>>;
