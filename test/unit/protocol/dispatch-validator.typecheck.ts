import { validateHostRequest } from '../../../src/shared/protocol/validate';

type Assert<T extends true> = T;
type DispatchValidatorRequiresExpectedSession = Assert<
  Parameters<typeof validateHostRequest> extends [unknown, string] ? true : false
>;

export type DispatchValidatorTypeContract = DispatchValidatorRequiresExpectedSession;
