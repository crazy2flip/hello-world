export type PlayerID = string;

export interface PlayerInfo {
  id: PlayerID;
  name: string;
  color: string;
  kind: 'human' | 'bot';
  difficulty?: 'easy' | 'medium' | 'hard';
}

export interface Token {
  player: PlayerID;
}

// Stacks are stored from bottom (index 0) to top (last index).
export interface GameState {
  board: Token[][];
  unplaced: Record<PlayerID, number>;
  exited: Record<PlayerID, number>;
  players: PlayerInfo[];
  currentIndex: number;
  winner: PlayerID | null;
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

export type Landing = { type: 'space'; index: number } | { type: 'exit' } | null;
