import { runActivationAcceptance } from './activation.test';
import { runMultiWindowAcceptance } from './multiWindow.test';
import {
  runBookImportReadAcceptance,
  runRestartRecoveryAcceptance,
} from './restartRecovery.test';
import { runSidebarProviderAcceptance } from './sidebar.test';

type TestCallback = (error?: unknown, failures?: number) => void;

/** Entry point consumed by VS Code's Extension Development Host test runner. */
export function run(_args: readonly string[], callback: TestCallback): void {
  void (async () => {
    await runActivationAcceptance();
    await runSidebarProviderAcceptance();
    await runBookImportReadAcceptance();
    await runRestartRecoveryAcceptance();
    await runMultiWindowAcceptance();
  })()
    .then(() => callback(undefined, 0))
    .catch((error: unknown) => callback(error, 1));
}
