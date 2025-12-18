import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions, getMoveOptions, placementDestination, topContiguousCount } from './engine';
import { createInitialState } from './state';
import { GameState, Player } from './types';

function withState(partial: Partial<GameState>): GameState {
  const base = createInitialState();
  return {
    ...base,
    ...partial,
    board: partial.board ?? base.board,
    unplaced: partial.unplaced ?? base.unplaced,
    exited: partial.exited ?? base.exited,
    currentPlayer: partial.currentPlayer ?? base.currentPlayer,
    winner: partial.winner ?? base.winner
  };
}

function token(player: Player) {
  return { player };
}

describe('movement restrictions', () => {
  it('only allows moving from top of mixed stacks', () => {
    const state = withState({
      board: [
        [token('RED'), token('BLUE'), token('RED')],
        [],
        [],
        [],
        [],
        [],
        [],
        []
      ],
      currentPlayer: 'RED'
    });
    const moves = getMoveOptions(state).filter((m) => m.from === 0);
    expect(moves.every((m) => m.count === 1)).toBe(true);
  });

  it('counts contiguous tokens for segment selection', () => {
    const state = withState({
      board: [
        [token('BLUE'), token('RED'), token('RED')],
        [],
        [],
        [],
        [],
        [],
        [],
        []
      ],
      currentPlayer: 'RED'
    });
    const count = topContiguousCount(state.board[0], 'RED');
    expect(count).toBe(2);
  });
});

describe('pinning and exiting', () => {
  it('pins when moving forward and backward', () => {
    const base = withState({
      board: [
        [token('BLUE')],
        [token('BLUE')],
        [],
        [],
        [],
        [],
        [],
        []
      ],
      currentPlayer: 'RED'
    });
    const forward = applyAction(base, { type: 'move', from: 2, dir: 'forward', count: 1 });
    expect(forward.board[3][forward.board[3].length - 1].player).toBe('RED');
    const backward = applyAction(base, { type: 'move', from: 2, dir: 'backward', count: 1 });
    expect(backward.board[1][backward.board[1].length - 1].player).toBe('RED');
  });

  it('exits from space 8 and wins at five', () => {
    const state = withState({
      board: [[], [], [], [], [], [], [], [token('RED'), token('RED')]],
      currentPlayer: 'RED',
      exited: { RED: 4, BLUE: 0 }
    });
    const after = applyAction(state, { type: 'move', from: 7, dir: 'forward', count: 2 });
    expect(after.exited.RED).toBe(6);
    expect(after.winner).toBe('RED');
  });
});

describe('five and slide', () => {
  it('slides past single full stack', () => {
    const state = withState({
      board: [
        [token('RED')],
        Array(5).fill(token('BLUE')),
        [],
        [],
        [],
        [],
        [],
        []
      ],
      currentPlayer: 'RED'
    });
    const after = applyAction(state, { type: 'move', from: 0, dir: 'forward', count: 1 });
    expect(after.board[2].at(-1)?.player).toBe('RED');
  });

  it('slides past multiple full stacks', () => {
    const state = withState({
      board: [
        [token('RED')],
        Array(5).fill(token('BLUE')),
        Array(5).fill(token('BLUE')),
        [],
        [],
        [],
        [],
        []
      ],
      currentPlayer: 'RED'
    });
    const after = applyAction(state, { type: 'move', from: 0, dir: 'forward', count: 1 });
    expect(after.board[3].at(-1)?.player).toBe('RED');
  });

  it('slides forward even on backward move', () => {
    const state = withState({
      board: [
        [],
        [],
        Array(5).fill(token('BLUE')),
        [token('RED')],
        [],
        [],
        [],
        []
      ],
      currentPlayer: 'RED'
    });
    const after = applyAction(state, { type: 'move', from: 2, dir: 'backward', count: 1 });
    expect(after.board[1].length).toBe(5);
    expect(after.board[2][after.board[2].length - 1].player).toBe('RED');
  });
});

describe('placement rules', () => {
  it('forces placement into space 1 when 2-7 are filled', () => {
    const state = withState({
      board: [[], [token('BLUE')], [token('BLUE')], [token('BLUE')], [token('BLUE')], [token('BLUE')], [token('BLUE')], []],
      currentPlayer: 'RED'
    });
    expect(placementDestination(state)).toBe(0);
  });

  it('allows placement into space 8 when 1-7 filled', () => {
    const state = withState({
      board: [
        [token('BLUE')],
        [token('BLUE')],
        [token('BLUE')],
        [token('BLUE')],
        [token('BLUE')],
        [token('BLUE')],
        [token('BLUE')],
        []
      ],
      currentPlayer: 'RED'
    });
    expect(placementDestination(state)).toBe(7);
  });

  it('enforces forced placement when no moves but empty exists', () => {
    const state = withState({
      board: [[token('RED')], [token('BLUE')], [], [], [], [], [], []],
      currentPlayer: 'RED',
      unplaced: { RED: 7, BLUE: 7 }
    });
    const legal = getLegalActions(state);
    expect(legal).toEqual([{ type: 'place' }]);
  });
});

describe('bubble up', () => {
  it('only available when no moves and no placement and moves token to top', () => {
    const state = withState({
      board: [
        [token('BLUE'), token('RED')],
        [],
        [],
        [],
        [],
        [],
        [],
        []
      ],
      currentPlayer: 'RED',
      unplaced: { RED: 0, BLUE: 7 }
    });
    const legal = getLegalActions(state);
    expect(legal).toContainEqual({ type: 'bubble', space: 0, tokenIndex: 0 });
    const after = applyAction(state, { type: 'bubble', space: 0, tokenIndex: 0 });
    expect(after.board[0].at(-1)?.player).toBe('RED');
  });
});
