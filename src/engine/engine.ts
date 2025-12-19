import { GameState, Landing, LegalAction, MoveAction, PlayerID, Token } from './types';
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

export function computeLanding(board: Token[][], from: number, dir: 'forward' | 'backward'): Landing {
  const delta = dir === 'forward' ? 1 : -1;
  const target = from + delta;
  if (dir === 'backward' && target < 0) return null;
  if (dir === 'forward' && target >= 8) return { type: 'exit' };
  let pos = target;
  while (pos >= 0 && pos < 8 && board[pos].length >= 5) {
    pos += delta;
  }
  if (pos < 0) return null;
  if (pos >= 8) return { type: 'exit' };
  return { type: 'space', index: pos };
}

export function predictLandingForMove(state: GameState, action: MoveAction): Landing {
  const preview = cloneBoard(state.board);
  const source = preview[action.from];
  preview[action.from] = source.slice(0, source.length - action.count);
  return computeLanding(preview, action.from, action.dir);
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
        const previewBoard = cloneBoard(state.board);
        previewBoard[idx] = previewBoard[idx].slice(0, previewBoard[idx].length - count);
        const landing = computeLanding(previewBoard, idx, dir);
        if (!landing) continue;
        if (landing.type === 'space') {
          const destSize = previewBoard[landing.index].length;
          if (destSize + count > 5) continue;
        }
        moves.push({ type: 'move', from: idx, dir, count });
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
    legal.push(...bubbleOptions.map((b) => ({ type: 'bubble', ...b })));
  }
  return legal;
}

function applyMove(state: GameState, action: MoveAction): GameState {
  const { from, dir, count } = action;
  const player = state.players[state.currentIndex].id;
  const board = cloneBoard(state.board);
  const sourceStack = board[from];
  const moved = sourceStack.splice(sourceStack.length - count, count);

  const landing = computeLanding(board, from, dir);
  if (!landing) return state;

  let message: string | undefined;
  const newExited = { ...state.exited } as Record<PlayerID, number>;
  if (landing.type === 'exit') {
    newExited[player] += moved.length;
    message = `${player} exited ${moved.length} token(s).`;
  } else {
    board[landing.index].push(...moved);
  }

  const winner = newExited[player] >= 5 ? player : null;
  const nextIndex = winner ? state.currentIndex : nextPlayerIndex(state);

  return {
    ...state,
    board,
    exited: newExited,
    currentIndex: nextIndex,
    winner,
    message
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
