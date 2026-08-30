import { randomUUID } from 'node:crypto';

import type { ReaderSettingsService } from '../../application/reader/ReaderSettingsService';
import type {
  HostResponse,
  ProtocolError,
} from '../../shared/protocol/messages';
import { PROTOCOL_VERSION } from '../../shared/protocol/messages';
import {
  validateHostRequest,
  validateHostResponse,
} from '../../shared/protocol/validate';

const READ_ERROR: ProtocolError = {
  code: 'INVALID_MESSAGE',
  message: 'Message could not be processed.',
};
const UPDATE_ERROR: ProtocolError = {
  code: 'INVALID_PAYLOAD',
  message: 'Request payload is invalid.',
};

function validatedResponse(response: HostResponse): HostResponse {
  const validation = validateHostResponse(response);
  if (!validation.ok) {
    throw new Error('The Settings Host produced an invalid response.');
  }
  return validation.value;
}

export class SettingsMessageDispatcher {
  constructor(
    private readonly sessionId: string,
    private readonly service: ReaderSettingsService,
    private readonly nextId: () => string = randomUUID,
  ) {}

  async dispatch(value: unknown): Promise<HostResponse | undefined> {
    const request = validateHostRequest(value, this.sessionId);
    if (!request.ok) return undefined;
    if (
      request.value.type !== 'settings/read' &&
      request.value.type !== 'settings/update'
    ) {
      return undefined;
    }
    const id = this.nextId();
    try {
      const snapshot =
        request.value.type === 'settings/read'
          ? await this.service.read()
          : await this.service.update(
              request.value.payload.baseVersion,
              request.value.payload.patch,
            );
      return validatedResponse({
        protocol: PROTOCOL_VERSION,
        id,
        sessionId: this.sessionId,
        type: 'settings/snapshot',
        payload: { requestId: request.value.id, snapshot },
      });
    } catch {
      return validatedResponse({
        protocol: PROTOCOL_VERSION,
        id,
        sessionId: this.sessionId,
        type: 'response/error',
        payload: {
          requestId: request.value.id,
          error:
            request.value.type === 'settings/update'
              ? UPDATE_ERROR
              : READ_ERROR,
        },
      });
    }
  }
}
