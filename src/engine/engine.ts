import { BubbleAction, GameState, Landing, LegalAction, MoveAction, PlayerID, Token } from './types';
import { nextPlayerIndex } from './state';

function cloneBoard(board: Token[][]): Token[][] {
  return board.map((stack) => [...stack]);
}

export function isPinned(stack: Token[], index: number): boolean {
  return index < stack.length - 1;
}

export function topContiguousCount(stack: Token[], player: PlayerID): number {
  let count = 0;
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].player === player) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

export function lowestEmptyIndex(board: Token[][]): number {
  return board.findIndex((space) => space.length === 0);
}

function spacesFilled(board: Token[][], start: number, end: number): boolean {
  for (let i = start; i <= end; i++) {
    if (board[i].length === 0) return false;
  }
  return true;
}

export function placementDestination(state: GameState): number | null {
  const { board } = state;
  const empty = lowestEmptyIndex(board);
  if (empty === -1) return null;

  const spaces2to7Filled = spacesFilled(board, 1, 6);
  if (spaces2to7Filled && board[0].length === 0) {
    return 0;
  }

  const spaces1to7Filled = spacesFilled(board, 0, 6);
  if (spaces1to7Filled && board[7].length === 0) {
    return 7;
  }

  return empty;
}

export function canPlace(state: GameState): boolean {
  const dest = placementDestination(state);
  const current = state.players[state.currentIndex].id;
  return dest !== null && state.unplaced[current] > 0 && state.board[dest].length < 5;
}

type MoveResolution = {
  board: Token[][];
  landing: Landing;
  exited: number;
};

function resolveMove(board: Token[][], action: MoveAction): MoveResolution | null {
  const delta = action.dir === 'forward' ? 1 : -1;
  const target = action.from + delta;
  if (action.dir === 'backward' && target < 0) return null;

  const working = cloneBoard(board);
  const sourceStack = working[action.from];
  if (sourceStack.length < action.count) return null;
  const moved = sourceStack.splice(sourceStack.length - action.count, action.count);

  let landing: Landing = null;
  let exited = 0;
  let placedOutsideSource = 0;

  if (action.dir === 'forward') {
    let pos = target;
    while (pos >= 0 && pos < working.length && moved.length > 0) {
      const stack = working[pos];
      const capacity = 5 - stack.length;
      if (capacity > 0) {
        const take = Math.min(capacity, moved.length);
        stack.push(...moved.splice(0, take));
        placedOutsideSource += take;
        if (!landing) landing = { type: 'space', index: pos };
      }
      pos += delta;
    }

    if (moved.length > 0) {
      exited = moved.length;
      moved.length = 0;
      if (!landing) landing = { type: 'exit' };
    }
  } else {
    let pos = target;
    while (pos >= 0 && moved.length > 0) {
      const stack = working[pos];
      const capacity = 5 - stack.length;
      if (capacity > 0) {
        const take = Math.min(capacity, moved.length);
        stack.push(...moved.splice(0, take));
        placedOutsideSource += take;
        if (!landing) landing = { type: 'space', index: pos };
      }
      pos += delta;
    }

    if (moved.length > 0) {
      working[action.from].push(...moved);
    }

    if (placedOutsideSource === 0) return null;
  }

  return { board: working, landing, exited };
}

export function predictLandingForMove(state: GameState, action: MoveAction): Landing {
  const result = resolveMove(state.board, action);
  return result?.landing ?? null;
}

export function getMoveOptions(state: GameState): MoveAction[] {
  const moves: MoveAction[] = [];
  const player = state.players[state.currentIndex].id;
  state.board.forEach((stack, idx) => {
    const maxCount = topContiguousCount(stack, player);
    if (maxCount === 0) return;
    const counts = Array.from({ length: maxCount }, (_, i) => i + 1);
    for (const dir of ['forward', 'backward'] as const) {
      for (const count of counts) {
        const result = resolveMove(state.board, { type: 'move', from: idx, dir, count });
        if (result) moves.push({ type: 'move', from: idx, dir, count });
      }
    }
  });
  return moves;
}

export function getBubbleOptions(state: GameState): { space: number; tokenIndex: number }[] {
  const options: { space: number; tokenIndex: number }[] = [];
  const player = state.players[state.currentIndex].id;
  state.board.forEach((stack, space) => {
    stack.forEach((token, idx) => {
      if (token.player === player && isPinned(stack, idx)) {
        options.push({ space, tokenIndex: idx });
      }
    });
  });
  return options;
}

export function getLegalActions(state: GameState): LegalAction[] {
  if (state.winner) return [];
  const moveOptions = getMoveOptions(state);
  const dest = placementDestination(state);
  const current = state.players[state.currentIndex].id;
  const placementLegal = dest !== null && state.unplaced[current] > 0 && state.board[dest].length < 5;

  const legal: LegalAction[] = [];
  if (moveOptions.length > 0) {
    legal.push(...moveOptions);
    if (placementLegal) {
      legal.push({ type: 'place' });
    }
    return legal;
  }

  if (placementLegal) {
    legal.push({ type: 'place' });
    return legal;
  }

  const bubbleOptions = getBubbleOptions(state);
  if (bubbleOptions.length > 0) {
    legal.push(...bubbleOptions.map((b): BubbleAction => ({ type: 'bubble', ...b })));
  }
  return legal;
}

function applyMove(state: GameState, action: MoveAction): GameState {
  const { from, dir, count } = action;
  const player = state.players[state.currentIndex].id;
  const resolution = resolveMove(state.board, action);
  if (!resolution) return state;

  const board = resolution.board;
  const newExited = { ...state.exited } as Record<PlayerID, number>;
  newExited[player] += resolution.exited;

  const winner = newExited[player] >= 5 ? player : null;
  const nextIndex = winner ? state.currentIndex : nextPlayerIndex(state);

  return {
    ...state,
    board,
    exited: newExited,
    currentIndex: nextIndex,
    winner,
    message: resolution.exited > 0 ? `${player} exited ${resolution.exited} token(s).` : state.message
  };
}

function applyPlace(state: GameState): GameState {
  const dest = placementDestination(state);
  const player = state.players[state.currentIndex].id;
  if (dest === null || state.unplaced[player] <= 0 || state.board[dest].length >= 5) {
    return state;
  }
  const board = cloneBoard(state.board);
  board[dest].push({ player });
  const unplaced = { ...state.unplaced } as Record<PlayerID, number>;
  unplaced[player] -= 1;
  return {
    ...state,
    board,
    unplaced,
    currentIndex: nextPlayerIndex(state),
    message: `Placed on space ${dest + 1}`
  };
}

function applyBubble(state: GameState, space: number, tokenIndex: number): GameState {
  const board = cloneBoard(state.board);
  const stack = board[space];
  const [token] = stack.splice(tokenIndex, 1);
  stack.push(token);
  return {
    ...state,
    board,
    currentIndex: nextPlayerIndex(state),
    message: 'Bubbled up'
  };
}

export function applyAction(state: GameState, action: LegalAction): GameState {
  if (state.winner) return state;
  switch (action.type) {
    case 'move':
      return applyMove(state, action);
    case 'place':
      return applyPlace(state);
    case 'bubble':
      return applyBubble(state, action.space, action.tokenIndex);
    default:
      return state;
  }
}
