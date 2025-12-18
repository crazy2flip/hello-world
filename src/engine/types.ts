export type Player = 'RED' | 'BLUE';

export interface Token {
  player: Player;
}

// Stacks are stored from bottom (index 0) to top (last index).
export interface GameState {
  board: Token[][];
  unplaced: Record<Player, number>;
  exited: Record<Player, number>;
  currentPlayer: Player;
  winner: Player | null;
  message?: string;
}

export type MoveAction = {
  type: 'move';
  from: number; // 0-based space index
  dir: 'forward' | 'backward';
  count: number; // number of contiguous tokens from the top
};

export type PlaceAction = {
  type: 'place';
};

export type BubbleAction = {
  type: 'bubble';
  space: number;
  tokenIndex: number; // index inside the stack being bubbled
};

export type LegalAction = MoveAction | PlaceAction | BubbleAction;
