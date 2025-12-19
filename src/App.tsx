import React, { useEffect, useMemo, useState } from 'react';
import {
  applyAction,
  getBubbleOptions,
  getLegalActions,
  getMoveOptions,
  placementDestination,
  predictLandingForMove,
  topContiguousCount,
  isPinned
} from './engine/engine';
import { chooseBotAction } from './engine/bots';
import { createInitialState } from './engine/state';
import { BubbleAction, GameState, LegalAction, MoveAction, PlayerInfo } from './engine/types';

const palette = ['#ef4444', '#3b82f6', '#10b981', '#f97316', '#a855f7', '#14b8a6', '#e11d48', '#0ea5e9'];

function defaultPlayers(count = 2): PlayerInfo[] {
  return Array.from({ length: count }).map((_, idx) => ({
    id: idx === 0 ? 'RED' : idx === 1 ? 'BLUE' : `P${idx + 1}`,
    name: idx === 0 ? 'Red' : idx === 1 ? 'Blue' : `Player ${idx + 1}`,
    color: palette[idx % palette.length],
    kind: 'human'
  }));
}

function useGame(players: PlayerInfo[]) {
  const [state, setState] = useState<GameState>(() => createInitialState(players));
  useEffect(() => {
    setState(createInitialState(players));
  }, [players]);
  const reset = () => setState(createInitialState(players));
  const dispatch = (action: LegalAction) => setState((prev) => applyAction(prev, action));
  return { state, dispatch, reset };
}

interface Selection {
  space: number;
  count: number;
}

interface DragPayload {
  kind: 'move' | 'place' | 'bubble';
  from?: number;
  count?: number;
  space?: number;
  tokenIndex?: number;
}

function tokenClasses(selected: boolean, hover: boolean) {
  const classes = ['token'];
  if (selected) classes.push('selected');
  if (hover) classes.push('hovered');
  return classes.join(' ');
}

export default function App() {
  const [setupPlayers, setSetupPlayers] = useState<PlayerInfo[]>(defaultPlayers());
  const [activePlayers, setActivePlayers] = useState<PlayerInfo[]>(defaultPlayers());
  const [setupMode, setSetupMode] = useState(true);
  const { state, dispatch, reset } = useGame(activePlayers);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [hoverSelection, setHoverSelection] = useState<Selection | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const started = !setupMode;
  const currentPlayer = state.players[state.currentIndex];
  const moveOptions = useMemo(() => getMoveOptions(state), [state]);
  const bubbleOptions = useMemo(() => getBubbleOptions(state), [state]);
  const legalActions = useMemo(() => getLegalActions(state), [state]);
  const placementTarget = placementDestination(state);
  const canPlaceToken = started && legalActions.some((a) => a.type === 'place');
  const bubbleAllowed = started && bubbleOptions.length > 0 && moveOptions.length === 0 && !canPlaceToken;

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 1400);
      return () => clearTimeout(t);
    }
  }, [toast]);

  useEffect(() => {
    setSelection(null);
    setHoverSelection(null);
  }, [state.currentIndex]);

  useEffect(() => {
    if (setupMode) {
      setSelection(null);
      setHoverSelection(null);
    }
  }, [setupMode]);

  useEffect(() => {
    const player = currentPlayer;
    if (!started || !player || player.kind !== 'bot' || state.winner) return;
    const action = chooseBotAction(state, player.difficulty || 'medium');
    if (!action) return;
    const timer = setTimeout(() => dispatch(action), 650);
    return () => clearTimeout(timer);
  }, [state, currentPlayer, dispatch, started]);

  const destinationOptions = useMemo(() => {
    if (!selection) return [] as { landing: ReturnType<typeof predictLandingForMove>; action: MoveAction }[];
    return moveOptions
      .filter((m) => m.from === selection.space && m.count === selection.count)
      .map((action) => ({ action, landing: predictLandingForMove(state, action) }))
      .filter((item) => item.landing !== null);
  }, [selection, moveOptions, state]);

  const setPlayerKind = (idx: number, kind: PlayerInfo['kind']) => {
    setSetupPlayers((prev) => prev.map((p, i) => (i === idx ? { ...p, kind } : p)));
  };

  const setDifficulty = (idx: number, difficulty: NonNullable<PlayerInfo['difficulty']>) => {
    setSetupPlayers((prev) => prev.map((p, i) => (i === idx ? { ...p, difficulty } : p)));
  };

  const setPlayerName = (idx: number, name: string) => {
    setSetupPlayers((prev) => prev.map((p, i) => (i === idx ? { ...p, name } : p)));
  };

  const addPlayer = () => {
    setSetupPlayers((prev) => {
      if (prev.length >= 8) return prev;
      const nextIdx = prev.length;
      return [
        ...prev,
        {
          id: `P${nextIdx + 1}`,
          name: `Player ${nextIdx + 1}`,
          color: palette[nextIdx % palette.length],
          kind: 'human'
        }
      ];
    });
  };

  const removePlayer = (idx: number) => {
    setSetupPlayers((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const startGame = () => {
    const sanitized = setupPlayers.map((p, idx) => ({ ...p, name: p.name.trim() || `Player ${idx + 1}` }));
    setActivePlayers(sanitized);
    setSelection(null);
    setToast(null);
    setSetupMode(false);
  };

  const restartWithActive = () => {
    setSelection(null);
    setToast(null);
    reset();
  };

  const backToSetup = () => {
    setSetupPlayers(activePlayers);
    setSelection(null);
    setToast(null);
    setSetupMode(true);
  };

  const info = !started
    ? 'Use the start menu to configure players, then begin.'
    : state.winner
      ? `${state.players.find((p) => p.id === state.winner)?.name ?? state.winner} wins!`
      : `${currentPlayer?.name ?? '—'} to act`;

  const parseDrag = (e: React.DragEvent<HTMLElement>): DragPayload | null => {
    try {
      const data = e.dataTransfer.getData('application/json');
      return data ? (JSON.parse(data) as DragPayload) : null;
    } catch {
      return null;
    }
  };

  const beginMoveSelection = (space: number, tokenIndex: number) => {
    const stack = state.board[space];
    const playerId = currentPlayer.id;
    const topCount = topContiguousCount(stack, playerId);
    const topStart = stack.length - topCount;
    if (tokenIndex < topStart) return null;
    if (stack[tokenIndex].player !== playerId) return null;
    const count = stack.length - tokenIndex;
    const hasMove = moveOptions.some((m) => m.from === space && m.count === count);
    if (!hasMove) return null;
    setSelection({ space, count });
    return { space, count };
  };

  const handleTokenClick = (space: number, tokenIndex: number) => {
    if (!started || state.winner) return;
    if (bubbleAllowed && isPinned(state.board[space], tokenIndex) && state.board[space][tokenIndex].player === currentPlayer.id) {
      const isLegal = legalActions.some((a) => a.type === 'bubble' && a.space === space && a.tokenIndex === tokenIndex);
      if (isLegal) dispatch({ type: 'bubble', space, tokenIndex });
      return;
    }
    const res = beginMoveSelection(space, tokenIndex);
    if (!res) {
      setToast('Illegal selection');
    }
  };

  const handleDestinationClick = (target: number | 'exit') => {
    if (!selection || !started) return;
    const match = destinationOptions.find((opt) =>
      opt.landing && (opt.landing.type === 'exit' ? target === 'exit' : opt.landing.index === target)
    );
    if (!match) {
      setToast('Illegal move');
      return;
    }
    dispatch(match.action);
    setSelection(null);
  };

  const handleDragStartToken = (e: React.DragEvent<HTMLDivElement>, space: number, tokenIndex: number) => {
    if (!started || state.winner) {
      e.preventDefault();
      return;
    }
    const stack = state.board[space];
    const token = stack[tokenIndex];
    if (bubbleAllowed && isPinned(stack, tokenIndex) && token.player === currentPlayer.id) {
      const payload: DragPayload = { kind: 'bubble', space, tokenIndex };
      e.dataTransfer.setData('application/json', JSON.stringify(payload));
      e.dataTransfer.effectAllowed = 'move';
      return;
    }
    const res = beginMoveSelection(space, tokenIndex);
    if (!res) {
      e.preventDefault();
      return;
    }
    const payload: DragPayload = { kind: 'move', from: space, count: res.count };
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragStartReserve = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canPlaceToken) {
      e.preventDefault();
      return;
    }
    const payload: DragPayload = { kind: 'place' };
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleReserveClick = () => {
    if (!canPlaceToken) {
      setToast('Placement not available');
      return;
    }
    dispatch({ type: 'place' });
  };

  const tryBubbleDrop = (space: number, payload: DragPayload) => {
    if (!bubbleAllowed || payload.kind !== 'bubble' || payload.space === undefined || payload.tokenIndex === undefined)
      return false;
    if (payload.space !== space) return false;
    const isLegal = legalActions.some((a) => a.type === 'bubble' && a.space === payload.space && a.tokenIndex === payload.tokenIndex);
    if (isLegal) {
      dispatch({ type: 'bubble', space: payload.space, tokenIndex: payload.tokenIndex });
      return true;
    }
    return false;
  };

  const tryPlaceDrop = (space: number, payload: DragPayload) => {
    if (payload.kind !== 'place') return false;
    if (placementTarget === space && canPlaceToken) {
      dispatch({ type: 'place' });
      return true;
    }
    setToast('Place at highlighted slot');
    return false;
  };

  const tryMoveDrop = (space: number | 'exit', payload: DragPayload) => {
    if (payload.kind !== 'move' || payload.from === undefined || payload.count === undefined) return false;
    const dir = space === 'exit' ? 'forward' : space > payload.from ? 'forward' : 'backward';
    const action = moveOptions.find((m) => m.from === payload.from && m.count === payload.count && m.dir === dir);
    if (!action) return false;
    const landing = predictLandingForMove(state, action);
    if (space === 'exit' && landing?.type !== 'exit') return false;
    if (typeof space === 'number' && (!landing || landing.type !== 'space' || landing.index !== space)) return false;
    dispatch(action);
    setSelection(null);
    return true;
  };

  const handleSpaceDrop = (space: number | 'exit', e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const payload = parseDrag(e);
    if (!payload) return;
    if (payload.kind === 'bubble') {
      tryBubbleDrop(space as number, payload);
      return;
    }
    if (payload.kind === 'place' && typeof space === 'number') {
      tryPlaceDrop(space, payload);
      return;
    }
    tryMoveDrop(space, payload);
  };

  const selectionInfo = selection ? `${selection.count} token(s) from space ${selection.space + 1}` : 'None';
  const placementInfo = canPlaceToken && placementTarget !== null ? `Drag to space ${placementTarget + 1}` : 'Placement locked';

  return (
    <div className="app">
      <div className="header">
        <div>
          <h1>STACKERS: Five & Slide</h1>
          <div className="legend">Stacks render bottom → top; topmost tokens are the movers.</div>
        </div>
        <div className="header-actions">
          {started ? (
            <>
              <button onClick={restartWithActive}>Restart</button>
              <button onClick={backToSetup}>Change lineup</button>
            </>
          ) : null}
        </div>
      </div>

      <section className="setup">
        <h3>Local Players & Bots (2–8)</h3>
        {setupMode ? (
          <>
            <div className="player-grid">
              {setupPlayers.map((p, idx) => (
                <div key={p.id} className="player-card" style={{ borderColor: p.color }}>
                  <div className="player-row">
                    <span className="swatch" style={{ background: p.color }} />
                    <input
                      className="name-input"
                      value={p.name}
                      onChange={(e) => setPlayerName(idx, e.target.value)}
                      placeholder={`Player ${idx + 1}`}
                    />
                    <button onClick={() => removePlayer(idx)} disabled={setupPlayers.length <= 2}>
                      Remove
                    </button>
                  </div>
                  <div className="player-row">
                    <label>
                      Type:
                      <select value={p.kind} onChange={(e) => setPlayerKind(idx, e.target.value as PlayerInfo['kind'])}>
                        <option value="human">Human</option>
                        <option value="bot">Bot</option>
                      </select>
                    </label>
                    {p.kind === 'bot' && (
                      <label>
                        Difficulty:
                        <select
                          value={p.difficulty ?? 'medium'}
                          onChange={(e) => setDifficulty(idx, e.target.value as NonNullable<PlayerInfo['difficulty']>)}
                        >
                          <option value="easy">Easy</option>
                          <option value="medium">Medium</option>
                          <option value="hard">Hard</option>
                        </select>
                      </label>
                    )}
                  </div>
                </div>
              ))}
              {setupPlayers.length < 8 && (
                <button className="add-player" onClick={addPlayer}>
                  + Add player
                </button>
              )}
            </div>
            <div className="setup-actions">
              <div>Names are editable. Starting a game locks the lineup until you return here.</div>
              <button onClick={startGame} disabled={setupPlayers.length < 2}>Start game</button>
            </div>
          </>
        ) : (
          <div className="player-grid read-only">
            {activePlayers.map((p) => (
              <div key={p.id} className="player-card" style={{ borderColor: p.color }}>
                <div className="player-row">
                  <span className="swatch" style={{ background: p.color }} />
                  <strong>{p.name}</strong>
                  <span className="pill">{p.kind === 'bot' ? `${p.difficulty ?? 'medium'} bot` : 'Human'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="message">{info}</div>
      {state.message && <div className="message subtle">{state.message}</div>}
      {toast && <div className="message warning">{toast}</div>}

      <div className={`play-area ${!started ? 'disabled' : ''}`}>
        <div className="track">
          <div className="space start-space">
            <div className="space-label">Start</div>
            <div className="start-info">Drag or tap your reserve to the glowing slot.</div>
            <div className="reserve-list">
              {state.players.map((p) => (
                <div key={p.id} className="reserve-row">
                  <span className="swatch" style={{ background: p.color }} />
                  <span className="reserve-name">{p.name}</span>
                  <div className="reserve-chips">
                    {Array.from({ length: state.unplaced[p.id] }).map((_, i) => (
                      <div
                        key={i}
                        className={`token reserve ${p.id === currentPlayer.id && canPlaceToken ? 'draggable' : ''}`}
                        style={{ background: p.color }}
                        draggable={started && p.id === currentPlayer.id && canPlaceToken}
                        onDragStart={p.id === currentPlayer.id ? handleDragStartReserve : undefined}
                        onClick={p.id === currentPlayer.id ? handleReserveClick : undefined}
                        role="button"
                        aria-label="Place token"
                        tabIndex={0}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="placement-callout">{placementInfo}</div>
          </div>

          {state.board.map((stack, idx) => {
            const topCount = topContiguousCount(stack, currentPlayer.id);
            const topStart = stack.length - topCount;
            const highlight = destinationOptions.some((opt) => opt.landing?.type === 'space' && opt.landing.index === idx);
            return (
              <div
                key={idx}
                className={`space ${highlight ? 'highlight' : ''} ${placementTarget === idx && canPlaceToken ? 'placement' : ''}`}
                onClick={() => {
                  if (!started) return;
                  const exitOption = destinationOptions.find((opt) => opt.landing?.type === 'exit');
                  const spaceOption = destinationOptions.find((opt) => opt.landing?.type === 'space' && opt.landing.index === idx);
                  if (spaceOption) {
                    handleDestinationClick(idx);
                  } else if (!exitOption) {
                    setSelection(null);
                  }
                }}
                onDragOver={(e) => {
                  const payload = parseDrag(e);
                  if (
                    payload?.kind === 'place'
                      ? placementTarget === idx && canPlaceToken
                      : payload?.kind === 'move' || (payload?.kind === 'bubble' && bubbleAllowed && payload.space === idx)
                  ) {
                    e.preventDefault();
                    return;
                  }
                  // Allow reserve drag payloads even when getData is unavailable in dragover events
                  if (!payload && started) {
                    e.preventDefault();
                  }
                }}
                onDrop={(e) => handleSpaceDrop(idx, e)}
              >
                <div className="space-label">{idx + 1}</div>
                <div className="stack">
                  {highlight && <div className="drop-hint">Drop here</div>}
                  {[...stack].reverse().map((token, displayIndex) => {
                    const actualIndex = stack.length - 1 - displayIndex;
                    const isTopSegment = selection?.space === idx && actualIndex >= stack.length - selection.count;
                    const hoverSegment = hoverSelection?.space === idx && actualIndex >= stack.length - hoverSelection.count;
                    const selectable =
                      started && actualIndex >= topStart && token.player === currentPlayer.id && !state.winner;
                    const bubbleSelectable =
                      bubbleAllowed && token.player === currentPlayer.id && isPinned(stack, actualIndex);
                    return (
                      <div
                        key={actualIndex}
                        className={tokenClasses(!!isTopSegment, !!hoverSegment)}
                        style={{ background: state.players.find((p) => p.id === token.player)?.color }}
                        draggable={(selectable && moveOptions.length > 0) || bubbleSelectable}
                        onMouseEnter={() => {
                          if (selectable) setHoverSelection({ space: idx, count: stack.length - actualIndex });
                        }}
                        onMouseLeave={() => setHoverSelection(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTokenClick(idx, actualIndex);
                        }}
                        onDragStart={(e) => handleDragStartToken(e, idx, actualIndex)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div
            className={`space exit-space ${destinationOptions.some((opt) => opt.landing?.type === 'exit') ? 'highlight' : ''}`}
            onDragOver={(e) => {
              const payload = parseDrag(e);
              if (payload?.kind === 'move') e.preventDefault();
            }}
            onDrop={(e) => handleSpaceDrop('exit', e)}
            onClick={() => handleDestinationClick('exit')}
          >
            <div className="space-label">Exit</div>
            <div className="exit-grid">
              {state.players.map((p) => (
                <div key={p.id} className="exit-row">
                  <span className="swatch" style={{ background: p.color }} />
                  <span className="reserve-name">{p.name}</span>
                  <div className="exit-slots">
                    {Array.from({ length: 5 }).map((_, i) => {
                      const filled = (state.exited[p.id] ?? 0) > i;
                      return <div key={i} className={`token exit-slot ${filled ? 'filled' : ''}`} style={{ background: filled ? p.color : undefined }} />;
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="info-panels">
        <div className="control-card">
          <h3>On-screen help</h3>
          <ul>
            <li>Tap or drag your top tokens (or segments) to highlighted destinations.</li>
            <li>Backward moves slide backward through any 5-stacks; hitting a full space 1 is illegal.</li>
            <li>Drag from Start Zone to the glowing slot to place when required.</li>
            <li>If no moves/placements exist, drag one of your pinned tokens upward to bubble.</li>
            <li>Segments: click/drag deeper into your top run to move that token and all above it.</li>
          </ul>
        </div>
        <div className="control-card">
          <h3>Status</h3>
          <div>Selected: {selectionInfo}</div>
          <div>Placement: {placementInfo}</div>
          <div>Bubble: {bubbleAllowed ? 'Drag any pinned token you own.' : 'Unavailable this turn.'}</div>
        </div>
      </div>

      {state.winner && (
        <div className="message celebration">
          🎉 {state.players.find((p) => p.id === state.winner)?.name ?? state.winner} conquers the stack! Ready for a rematch?
          <div className="celebration-actions">
            <button onClick={restartWithActive}>Rematch</button>
            <button onClick={backToSetup}>Change lineup</button>
          </div>
        </div>
      )}
    </div>
  );
}
