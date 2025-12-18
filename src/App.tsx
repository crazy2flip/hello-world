import { useMemo, useState } from 'react';
import {
  applyAction,
  canPlace,
  getBubbleOptions,
  getLegalActions,
  getMoveOptions,
  placementDestination,
  topContiguousCount,
  isPinned
} from './engine/engine';
import { createInitialState } from './engine/state';
import { BubbleAction, GameState, MoveAction, Player } from './engine/types';

function tokenClass(player: Player) {
  return player === 'RED' ? 'token red' : 'token blue';
}

function formatPlayer(player: Player) {
  return player === 'RED' ? 'Red' : 'Blue';
}

function useGameState() {
  const [state, setState] = useState<GameState>(createInitialState());
  const reset = () => setState(createInitialState());
  const dispatch = (action: BubbleAction | MoveAction | { type: 'place' }) => {
    setState((prev) => applyAction(prev, action));
  };
  return { state, reset, dispatch };
}

export default function App() {
  const { state, reset, dispatch } = useGameState();
  const [selectedSpace, setSelectedSpace] = useState<number | null>(null);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [segmentSize, setSegmentSize] = useState(1);
  const [bubbleMode, setBubbleMode] = useState(false);
  const legalActions = useMemo(() => getLegalActions(state), [state]);
  const moveOptions = useMemo(() => getMoveOptions(state), [state]);
  const bubbleOptions = useMemo(() => getBubbleOptions(state), [state]);
  const placeLegal = canPlace(state);
  const bubbleAllowed = bubbleOptions.length > 0 && moveOptions.length === 0 && !placeLegal;
  const placementTarget = placementDestination(state);
  const placementLabel = placementTarget === null ? '—' : placementTarget + 1;

  const topCount = selectedSpace !== null ? topContiguousCount(state.board[selectedSpace], state.currentPlayer) : 0;

  const attemptMove = () => {
    if (selectedSpace === null) return;
    const action: MoveAction = { type: 'move', from: selectedSpace, dir: direction, count: segmentSize };
    const isLegal = legalActions.some(
      (a) => a.type === 'move' && a.from === action.from && a.dir === action.dir && a.count === action.count
    );
    if (!isLegal) return;
    dispatch(action);
    setSelectedSpace(null);
  };

  const attemptPlace = () => {
    const isLegal = legalActions.some((a) => a.type === 'place');
    if (isLegal) {
      dispatch({ type: 'place' });
      setSelectedSpace(null);
    }
  };

  const attemptBubble = (space: number, tokenIndex: number) => {
    const action: BubbleAction = { type: 'bubble', space, tokenIndex };
    const isLegal = legalActions.some(
      (a) => a.type === 'bubble' && a.space === action.space && a.tokenIndex === action.tokenIndex
    );
    if (!isLegal) return;
    dispatch(action);
    setBubbleMode(false);
    setSelectedSpace(null);
  };

  const handleSpaceClick = (spaceIndex: number) => {
    if (bubbleMode) return;
    const count = topContiguousCount(state.board[spaceIndex], state.currentPlayer);
    if (count === 0) return;
    setSelectedSpace(spaceIndex);
    setSegmentSize(Math.min(segmentSize, count) || 1);
  };

  const currentLegalMoveDirections = useMemo(() => {
    if (selectedSpace === null) return [] as ('forward' | 'backward')[];
    return moveOptions
      .filter((m) => m.from === selectedSpace)
      .map((m) => m.dir);
  }, [selectedSpace, moveOptions]);

  const info = state.winner ? `${formatPlayer(state.winner)} wins!` : `${formatPlayer(state.currentPlayer)} to act`;

  return (
    <div className="app">
      <div className="header">
        <div>
          <h1>STACKERS: Five & Slide</h1>
          <div className="legend">Stacks are bottom → top in reading order.</div>
        </div>
        <button onClick={reset}>Reset</button>
      </div>
      <div className="message">{info}</div>
      <div className="message">
        Unplaced – Red: {state.unplaced.RED}, Blue: {state.unplaced.BLUE} | Exited – Red: {state.exited.RED}, Blue:{' '}
        {state.exited.BLUE}
      </div>
      <div className="board">
        {state.board.map((stack, idx) => (
          <div key={idx} className="space">
            <div className="space-label">{idx + 1}</div>
            <div className="stack" onClick={() => handleSpaceClick(idx)}>
              {stack.map((token, tIdx) => {
                const isTop = tIdx === stack.length - 1;
                const isCurrentPlayer = token.player === state.currentPlayer;
                const selectable = isCurrentPlayer && isTop && !bubbleMode;
                const pinnedSelectable = bubbleMode && isCurrentPlayer && isPinned(stack, tIdx) && bubbleAllowed;
                return (
                  <div
                    key={tIdx}
                    className={tokenClass(token.player)}
                    style={{ opacity: selectable || pinnedSelectable ? 1 : 0.7, borderColor: selectable ? '#fb7185' : undefined }}
                    onClick={() => {
                      if (pinnedSelectable) attemptBubble(idx, tIdx);
                      else if (selectable) handleSpaceClick(idx);
                    }}
                  >
                    {token.player === 'RED' ? 'R' : 'B'}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="controls">
        <div className="control-card">
          <h3>Move</h3>
          <div>Direction:</div>
          <div style={{ display: 'flex', gap: '0.5rem', margin: '0.25rem 0' }}>
            <button
              onClick={() => setDirection('forward')}
              disabled={!currentLegalMoveDirections.includes('forward')}
              style={{ background: direction === 'forward' ? '#c7d2fe' : undefined }}
            >
              Forward
            </button>
            <button
              onClick={() => setDirection('backward')}
              disabled={!currentLegalMoveDirections.includes('backward')}
              style={{ background: direction === 'backward' ? '#c7d2fe' : undefined }}
            >
              Backward
            </button>
          </div>
          <div>
            Segment size:{' '}
            <select value={segmentSize} onChange={(e) => setSegmentSize(Number(e.target.value))}>
              {Array.from({ length: topCount }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="selection-info">
            Selected space: {selectedSpace !== null ? selectedSpace + 1 : 'none'}
          </div>
          <button onClick={attemptMove} disabled={!legalActions.some((a) => a.type === 'move')}>
            Move
          </button>
        </div>

        <div className="control-card">
          <h3>Place</h3>
          <div>Lowest empty slot: {placementLabel}</div>
          <button onClick={attemptPlace} disabled={!legalActions.some((a) => a.type === 'place')}>
            Place token
          </button>
        </div>

        <div className="control-card">
          <h3>Bubble Up</h3>
          <button onClick={() => setBubbleMode(true)} disabled={!bubbleAllowed}>
            Start bubble
          </button>
          {bubbleMode && <div>Click a pinned token you own.</div>}
        </div>
      </div>

      {state.message && <div className="message">{state.message}</div>}
      <div className="message">
        Tip: if you cannot move and have unplaced tokens with an empty space, you must place. Bubble Up is only for when
        you are fully stuck.
      </div>
      <div className="message">Turn order: Red starts. Current player: {formatPlayer(state.currentPlayer)}</div>
    </div>
  );
}
