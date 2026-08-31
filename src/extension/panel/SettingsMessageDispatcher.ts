import { randomUUID } from 'node:crypto';

import type { ReaderSettingsService } from '../../application/reader/ReaderSettingsService';
import type { ReaderService } from '../../application/reader/ReaderService';
import type { Game2048Service } from '../../application/game2048/Game2048Service';
import type { VersionedGameState } from '../../application/game2048/Game2048Service';
import type { PresentationSnapshotReader } from './PresentationSnapshotProvider';
import type {
  BookshelfSnapshot,
  Game2048SessionSnapshot,
  HomeSnapshot,
  HostRequest,
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

export interface HostModuleServices {
  reader?: ReaderService;
  game?: Game2048Service;
  presentation?: PresentationSnapshotReader;
  books?: HostBookOperations;
}

export interface HostBookOperations {
  import(uri?: string): Promise<void>;
  remove(bookId: string): Promise<void>;
  relocate(bookId: string, uri?: string): Promise<void>;
  selectEncoding(bookId: string): Promise<void>;
}

function validatedResponse(response: HostResponse): HostResponse {
  const validation = validateHostResponse(response);
  if (!validation.ok) {
    throw new Error('The Settings Host produced an invalid response.');
  }
  return validation.value;
}

export class SettingsMessageDispatcher {
  private readonly moduleServices: HostModuleServices;
  private readonly nextId: () => string;

  constructor(
    private readonly sessionId: string,
    private readonly service: ReaderSettingsService,
    moduleServicesOrNextId: HostModuleServices | (() => string) = {},
    nextId: () => string = randomUUID,
  ) {
    if (typeof moduleServicesOrNextId === 'function') {
      this.moduleServices = {};
      this.nextId = moduleServicesOrNextId;
    } else {
      this.moduleServices = moduleServicesOrNextId;
      this.nextId = nextId;
    }
  }

  async dispatch(value: unknown): Promise<HostResponse | undefined> {
    const request = validateHostRequest(value, this.sessionId);
    if (!request.ok) return undefined;
    const id = this.nextId();
    try {
      return await this.dispatchValidated(request.value, id);
    } catch {
      return this.safeCorrelatedError(request.value, id);
    }
  }

  private async dispatchValidated(
    request: HostRequest,
    id: string,
  ): Promise<HostResponse | undefined> {
    switch (request.type) {
      case 'home/read': {
        const snapshot = await this.requirePresentation().readHome();
        return validatedResponse({
          protocol: PROTOCOL_VERSION,
          id,
          sessionId: this.sessionId,
          type: 'home/snapshot',
          payload: {
            requestId: request.id,
            snapshot: snapshot as HomeSnapshot,
          },
        });
      }
      case 'books/list': {
        return this.booksSnapshotResponse(
          id,
          request.id,
          await this.requirePresentation().readBooks(),
        );
      }
      case 'books/import': {
        await this.requireBooks().import(request.payload.uri);
        return this.booksSnapshotResponse(
          id,
          request.id,
          await this.requirePresentation().readBooks(),
        );
      }
      case 'books/relocate': {
        await this.requireBooks().relocate(
          request.payload.bookId,
          request.payload.uri,
        );
        return this.booksSnapshotResponse(
          id,
          request.id,
          await this.requirePresentation().readBooks(),
        );
      }
      case 'books/selectEncoding': {
        await this.requireBooks().selectEncoding(request.payload.bookId);
        return this.booksSnapshotResponse(
          id,
          request.id,
          await this.requirePresentation().readBooks(),
        );
      }
      case 'books/remove': {
        await this.requireBooks().remove(request.payload.bookId);
        return this.booksSnapshotResponse(
          id,
          request.id,
          await this.requirePresentation().readBooks(),
        );
      }
      case 'settings/read': {
        const snapshot = await this.service.read();
        return validatedResponse({
          protocol: PROTOCOL_VERSION,
          id,
          sessionId: this.sessionId,
          type: 'settings/snapshot',
          payload: { requestId: request.id, snapshot },
        });
      }
      case 'settings/update': {
        const snapshot = await this.service.update(
          request.payload.baseVersion,
          request.payload.patch,
        );
        return validatedResponse({
          protocol: PROTOCOL_VERSION,
          id,
          sessionId: this.sessionId,
          type: 'settings/snapshot',
          payload: { requestId: request.id, snapshot },
        });
      }
      case 'reader/open': {
        const opened = await this.requireReader().open(request.payload.bookId);
        return validatedResponse({
          protocol: PROTOCOL_VERSION,
          id,
          sessionId: this.sessionId,
          type: 'reader/opened',
          payload: {
            requestId: request.id,
            snapshot: {
              bookId: request.payload.bookId,
              version: opened.version,
              anchor: opened.locator ?? null,
            },
          },
        });
      }
      case 'reader/readBlocks': {
        if (request.payload.anchor.kind !== 'txt') {
          throw new Error('The active reader supports TXT locators only.');
        }
        const batch = await this.requireReader().readBlocks(
          request.payload.bookId,
          request.payload.anchor,
          request.payload.direction,
          request.payload.limit,
        );
        return validatedResponse({
          protocol: PROTOCOL_VERSION,
          id,
          sessionId: this.sessionId,
          type: 'reader/blocks',
          payload: { requestId: request.id, batch },
        });
      }
      case 'reader/saveProgress': {
        if (request.payload.locator.kind !== 'txt') {
          throw new Error('The active reader supports TXT locators only.');
        }
        const saved = await this.requireReader().saveProgress(
          request.payload.bookId,
          request.payload.baseVersion,
          request.payload.locator,
        );
        return validatedResponse({
          protocol: PROTOCOL_VERSION,
          id,
          sessionId: this.sessionId,
          type: 'reader/progressSaved',
          payload: {
            requestId: request.id,
            snapshot: {
              version: saved.version,
              locator: request.payload.locator,
            },
          },
        });
      }
      case 'game2048/load':
        return this.gameSessionResponse(
          id,
          request.id,
          await this.requireGame().load(),
        );
      case 'game2048/newGame':
        return this.gameSessionResponse(
          id,
          request.id,
          await this.requireGame().newGame(request.payload.baseVersion),
        );
      case 'game2048/save':
        return this.gameSessionResponse(
          id,
          request.id,
          await this.requireGame().save(
            request.payload.baseVersion,
            request.payload.state,
          ),
        );
      case 'game2048/move':
        return this.gameSessionResponse(
          id,
          request.id,
          await this.requireGame().move(
            request.payload.baseVersion,
            request.payload.sessionId,
            request.payload.moveSequence,
            request.payload.direction,
          ),
        );
      default:
        return undefined;
    }
  }

  private gameSessionResponse(
    id: string,
    requestId: string,
    session: VersionedGameState | undefined,
  ): HostResponse {
    return validatedResponse({
      protocol: PROTOCOL_VERSION,
      id,
      sessionId: this.sessionId,
      type: 'game2048/session',
      payload: {
        requestId,
        session:
          session === undefined
            ? null
            : {
                version: session.version,
                state: session.data
                  .state as unknown as Game2048SessionSnapshot['state'],
              },
      },
    });
  }

  private booksSnapshotResponse(
    id: string,
    requestId: string,
    snapshot: BookshelfSnapshot,
  ): HostResponse {
    return validatedResponse({
      protocol: PROTOCOL_VERSION,
      id,
      sessionId: this.sessionId,
      type: 'books/snapshot',
      payload: { requestId, snapshot },
    });
  }

  private requireReader(): ReaderService {
    if (this.moduleServices.reader === undefined) {
      throw new Error('Reader service is unavailable.');
    }
    return this.moduleServices.reader;
  }

  private requireGame(): Game2048Service {
    if (this.moduleServices.game === undefined) {
      throw new Error('2048 service is unavailable.');
    }
    return this.moduleServices.game;
  }

  private requirePresentation(): PresentationSnapshotReader {
    if (this.moduleServices.presentation === undefined) {
      throw new Error('Presentation snapshot provider is unavailable.');
    }
    return this.moduleServices.presentation;
  }

  private requireBooks(): HostBookOperations {
    if (this.moduleServices.books === undefined) {
      throw new Error('Bookshelf operations are unavailable.');
    }
    return this.moduleServices.books;
  }

  private safeCorrelatedError(request: HostRequest, id: string): HostResponse {
    const isWrite =
      request.type === 'settings/update' ||
      request.type === 'reader/saveProgress' ||
      request.type === 'books/import' ||
      request.type === 'books/remove' ||
      request.type === 'books/relocate' ||
      request.type === 'books/selectEncoding' ||
      request.type === 'game2048/newGame' ||
      request.type === 'game2048/save' ||
      request.type === 'game2048/move';
    return validatedResponse({
      protocol: PROTOCOL_VERSION,
      id,
      sessionId: this.sessionId,
      type: 'response/error',
      payload: {
        requestId: request.id,
        error: isWrite ? UPDATE_ERROR : READ_ERROR,
      },
    });
  }
}
