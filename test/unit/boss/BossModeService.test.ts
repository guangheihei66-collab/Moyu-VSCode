import { describe, expect, it, vi } from 'vitest';
import {
  BossModeAcknowledgementTimeout,
  BossModeService,
} from '../../../src/application/boss/BossModeService';

const snapshot = {
  route: 'game2048',
  moduleId: 'game',
  logicalFocus: 'board',
  scrollAnchor: 'tile-2',
};

function session() {
  return {
    isVisible: true,
    captureSnapshot: vi.fn(() => snapshot),
    requestBossTransition: vi.fn(async () => undefined),
    setPanelTitle: vi.fn(),
    setBossContext: vi.fn(),
  };
}

describe('BossModeService', () => {
  it('serializes rapid toggles and returns to NORMAL after an even count', async () => {
    const panel = session();
    const service = new BossModeService({ acknowledgementTimeoutMs: 100 });
    await Promise.all(Array.from({ length: 10 }, () => service.toggle(panel)));
    expect(service.mode).toBe('NORMAL');
    expect(panel.requestBossTransition).toHaveBeenCalledTimes(10);
  });

  it('does nothing for an absent or hidden panel', async () => {
    const service = new BossModeService();
    await expect(service.toggle(undefined)).resolves.toBeUndefined();
    await expect(service.toggle({ isVisible: false })).resolves.toBeUndefined();
    expect(service.mode).toBe('NORMAL');
  });

  it('rolls back the stable mode when acknowledgement times out', async () => {
    const panel = session();
    panel.requestBossTransition.mockImplementation(
      () => new Promise<void>(() => undefined),
    );
    const service = new BossModeService({ acknowledgementTimeoutMs: 5 });
    await expect(service.toggle(panel)).rejects.toBeInstanceOf(
      BossModeAcknowledgementTimeout,
    );
    expect(service.mode).toBe('NORMAL');
    expect(panel.setBossContext).not.toHaveBeenCalled();
  });
});
