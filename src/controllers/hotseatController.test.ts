import { describe, expect, it } from 'vitest';
import { HotseatController } from './hotseatController';
import { PlayerInfo } from '../engine/types';

const players: PlayerInfo[] = [
  { id: 'RED', name: 'Red', color: '#f87171', kind: 'human' },
  { id: 'BLUE', name: 'Blue', color: '#60a5fa', kind: 'human' }
];

describe('HotseatController', () => {
  it('applies place and move actions locally', () => {
    const controller = new HotseatController();
    let lastState = controller.getState();

    controller.onStateChange((state) => {
      lastState = state;
    });

    controller.startGame(players);
    expect(lastState?.currentIndex).toBe(0);

    controller.submitAction({ type: 'place' });
    expect(lastState?.board[0]).toHaveLength(1);
    expect(lastState?.currentIndex).toBe(1);

    controller.submitAction({ type: 'place' });
    expect(lastState?.board[1]).toHaveLength(1);
    expect(lastState?.currentIndex).toBe(0);

    controller.submitAction({ type: 'move', from: 0, dir: 'forward', count: 1 });
    expect(lastState?.board[0]).toHaveLength(0);
    expect(lastState?.board[1].at(-1)?.player).toBe('RED');
    expect(lastState?.currentIndex).toBe(1);
  });
});
