import { GameState, PlayerInfo, PlayerID, Token } from './types';

export const INITIAL_TOKENS = 7;

export function createInitialState(players: PlayerInfo[]): GameState {
  const unplaced: Record<PlayerID, number> = {};
  const exited: Record<PlayerID, number> = {};
  players.forEach((p) => {
    unplaced[p.id] = INITIAL_TOKENS;
    exited[p.id] = 0;
  });

  return {
    board: Array.from({ length: 8 }, () => [] as Token[]),
    unplaced,
    exited,
    players,
    currentIndex: 0,
    winner: null,
    message: undefined
  };
}

export function nextPlayerIndex(state: GameState): number {
  return (state.currentIndex + 1) % state.players.length;
}
