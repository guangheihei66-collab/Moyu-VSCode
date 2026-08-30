import type { ReaderSettingsSnapshot } from '../../../src/domain/reader/settings';
import type { HostResponse } from '../../../src/shared/protocol/messages';
import { validateHostRequest } from '../../../src/shared/protocol/validate';

type Assert<T extends true> = T;
type DispatchValidatorRequiresExpectedSession = Assert<
  Parameters<typeof validateHostRequest> extends [unknown, string]
    ? true
    : false
>;

export type DispatchValidatorTypeContract =
  DispatchValidatorRequiresExpectedSession;

type SettingsSnapshotResponse = Extract<
  HostResponse,
  { type: 'settings/snapshot' }
>;
type SettingsSnapshotResponseIsTyped = Assert<
  SettingsSnapshotResponse['payload']['snapshot'] extends ReaderSettingsSnapshot
    ? true
    : false
>;

export type SettingsResponseTypeContract = SettingsSnapshotResponseIsTyped;
