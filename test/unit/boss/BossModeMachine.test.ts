import { describe, expect, it } from 'vitest';
import { BossModeMachine } from '../../../src/domain/boss/BossModeMachine';

const snapshot = {
  route: 'reader',
  moduleId: 'book-1',
  logicalFocus: 'paragraph-4',
  scrollAnchor: 'block-4',
};

describe('BossModeMachine', () => {
  it('enters and exits with the exact logical snapshot', () => {
    const machine = new BossModeMachine();
    expect(machine.enter(snapshot)).toMatchObject({
      mode: 'BOSS_MODE',
      snapshot,
    });
    expect(machine.exit()).toMatchObject({
      mode: 'NORMAL',
      restoredSnapshot: snapshot,
    });
    expect(machine.mode).toBe('NORMAL');
  });

  it('is idempotent when enter or exit is repeated', () => {
    const machine = new BossModeMachine();
    machine.enter(snapshot);
    expect(machine.enter({ ...snapshot, route: 'settings' }).snapshot).toEqual(
      snapshot,
    );
    machine.exit();
    expect(machine.exit().mode).toBe('NORMAL');
  });
});
