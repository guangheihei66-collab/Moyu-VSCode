import { randomUUID } from 'node:crypto';

import type { ReaderSettingsService } from '../../application/reader/ReaderSettingsService';
import type { HostResponse } from '../../shared/protocol/messages';
import { PROTOCOL_VERSION } from '../../shared/protocol/messages';
import {
  validateHostRequest,
  validateHostResponse,
} from '../../shared/protocol/validate';

export class SettingsMessageDispatcher {
  constructor(
    private readonly sessionId: string,
    private readonly service: ReaderSettingsService,
    private readonly nextId: () => string = randomUUID,
  ) {}

  async dispatch(value: unknown): Promise<HostResponse | undefined> {
    const request = validateHostRequest(value, this.sessionId);
    if (!request.ok) return undefined;

    let snapshot;
    if (request.value.type === 'settings/read') {
      snapshot = await this.service.read();
    } else if (request.value.type === 'settings/update') {
      snapshot = await this.service.update(
        request.value.payload.baseVersion,
        request.value.payload.patch,
      );
    } else {
      return undefined;
    }

    const response: HostResponse = {
      protocol: PROTOCOL_VERSION,
      id: this.nextId(),
      sessionId: this.sessionId,
      type: 'settings/snapshot',
      payload: { requestId: request.value.id, snapshot },
    };
    const validation = validateHostResponse(response);
    if (!validation.ok) {
      throw new Error('The Settings Host produced an invalid response.');
    }
    return validation.value;
  }
}
