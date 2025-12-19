import { applyAction, getLegalActions, predictLandingForMove } from './engine';
import { GameState, Landing, LegalAction, MoveAction, PlayerID } from './types';

function landingPriority(landing: Landing): number {
  if (!landing) return -10;
  if (landing.type === 'exit') return 5;
  return 0;
}

function evaluateState(state: GameState, player: PlayerID): number {
  const exitedScore = state.exited[player] * 5;
  const mobility = getLegalActions(state).length;
  const boardPresence = state.board.reduce((sum, stack) => sum + stack.filter((t) => t.player === player).length, 0);
  return exitedScore + mobility + boardPresence * 0.5;
}

function pickRandom<T>(arr: T[]): T | null {
  if (arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function chooseEasy(state: GameState, player: PlayerID): LegalAction | null {
  const legal = getLegalActions(state);
  const exitMoves = legal.filter((a) => a.type === 'move' && predictLandingForMove(state, a as MoveAction)?.type === 'exit');
  if (exitMoves.length > 0 && Math.random() > 0.3) return pickRandom(exitMoves);
  return pickRandom(legal);
}

function chooseMedium(state: GameState, player: PlayerID): LegalAction | null {
  const legal = getLegalActions(state);
  let best: { action: LegalAction; score: number } | null = null;
  for (const action of legal) {
    const landing = action.type === 'move' ? predictLandingForMove(state, action) : null;
    let score = landingPriority(landing);
    const next = applyAction(state, action);
    score += evaluateState(next, player);
    if (!best || score > best.score) {
      best = { action, score };
    }
  }
  return best?.action ?? null;
}

function chooseHard(state: GameState, player: PlayerID): LegalAction | null {
  const legal = getLegalActions(state);
  let best: { action: LegalAction; score: number } | null = null;
  for (const action of legal) {
    const next = applyAction(state, action);
    // Look ahead one opponent turn assuming they respond greedily for themselves
    const opponent = next.players[next.currentIndex]?.id;
    let opponentScore = 0;
    if (opponent) {
      const oppLegal = getLegalActions(next);
      if (oppLegal.length > 0) {
        const oppBest = oppLegal.reduce((acc, act) => {
          const after = applyAction(next, act);
          const score = evaluateState(after, opponent);
          return score > acc.score ? { score, act } : acc;
        }, { score: -Infinity, act: oppLegal[0] });
        opponentScore = oppBest.score;
      }
    }
    const selfScore = evaluateState(next, player);
    const combined = selfScore - opponentScore * 0.6;
    if (!best || combined > best.score) {
      best = { action, score: combined };
    }
  }
  return best?.action ?? null;
}

export function chooseBotAction(state: GameState, difficulty: 'easy' | 'medium' | 'hard'): LegalAction | null {
  const player = state.players[state.currentIndex]?.id;
  if (!player) return null;
  switch (difficulty) {
    case 'easy':
      return chooseEasy(state, player);
    case 'medium':
      return chooseMedium(state, player);
    case 'hard':
      return chooseHard(state, player);
    default:
      return null;
  }
}
