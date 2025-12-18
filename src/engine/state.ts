import { GameState, Player, Token } from './types';

export const INITIAL_TOKENS = 7;

export function createInitialState(): GameState {
  return {
    board: Array.from({ length: 8 }, () => [] as Token[]),
    unplaced: { RED: INITIAL_TOKENS, BLUE: INITIAL_TOKENS },
    exited: { RED: 0, BLUE: 0 },
    currentPlayer: 'RED',
    winner: null,
    message: undefined
  };
}

export function oppositePlayer(player: Player): Player {
  return player === 'RED' ? 'BLUE' : 'RED';
}
