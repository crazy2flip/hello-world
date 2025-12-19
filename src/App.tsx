import { useEffect, useMemo, useState } from 'react';
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
import { BubbleAction, GameState, LegalAction, MoveAction, PlayerInfo, Token } from './engine/types';

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

function tokenClasses(token: Token, selected: boolean, hover: boolean) {
  const classes = ['token'];
  if (selected) classes.push('selected');
  if (hover) classes.push('hovered');
  classes.push('player-token');
  return classes.join(' ');
}

export default function App() {
  const [setupPlayers, setSetupPlayers] = useState<PlayerInfo[]>(defaultPlayers());
  const [activePlayers, setActivePlayers] = useState<PlayerInfo[]>(defaultPlayers());
  const [setupMode, setSetupMode] = useState(true);
  const { state, dispatch, reset } = useGame(activePlayers);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [hoverSelection, setHoverSelection] = useState<Selection | null>(null);
  const [bubbleMode, setBubbleMode] = useState(false);
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
      const t = setTimeout(() => setToast(null), 1200);
      return () => clearTimeout(t);
    }
  }, [toast]);

  useEffect(() => {
    setSelection(null);
    setBubbleMode(false);
    setHoverSelection(null);
  }, [state.currentIndex]);

  useEffect(() => {
    if (setupMode) {
      setSelection(null);
      setBubbleMode(false);
      setHoverSelection(null);
    }
  }, [setupMode]);

  useEffect(() => {
    const player = currentPlayer;
    if (!started || !player || player.kind !== 'bot' || state.winner) return;
    const action = chooseBotAction(state, player.difficulty || 'easy');
    if (!action) return;
    const timer = setTimeout(() => dispatch(action), 600);
    return () => clearTimeout(timer);
  }, [state, currentPlayer, dispatch, started]);

  const handleTokenSelect = (space: number, tokenIndex: number) => {
    if (!started || state.winner) return;
    const stack = state.board[space];
    const playerId = currentPlayer.id;
    const topCount = topContiguousCount(stack, playerId);
    const topStart = stack.length - topCount;
    if (tokenIndex < topStart) return;
    if (stack[tokenIndex].player !== playerId) return;
    const count = stack.length - tokenIndex;
    const hasMove = moveOptions.some((m) => m.from === space && m.count === count);
    if (!hasMove) return;
    setSelection({ space, count });
  };

  const handleBubbleClick = (space: number, tokenIndex: number) => {
    if (!started || !bubbleAllowed) return;
    const action: BubbleAction = { type: 'bubble', space, tokenIndex };
    const isLegal = legalActions.some((a) => a.type === 'bubble' && a.space === space && a.tokenIndex === tokenIndex);
    if (!isLegal) return;
    dispatch(action);
  };

  const destinationOptions = useMemo(() => {
    if (!selection) return [] as { landing: ReturnType<typeof predictLandingForMove>; action: MoveAction }[];
    return moveOptions
      .filter((m) => m.from === selection.space && m.count === selection.count)
      .map((action) => ({ action, landing: predictLandingForMove(state, action) }))
      .filter((item) => item.landing !== null);
  }, [selection, moveOptions, state]);

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
    setBubbleMode(false);
    setToast(null);
    setSetupMode(false);
  };

  const restartWithActive = () => {
    setSelection(null);
    setBubbleMode(false);
    setToast(null);
    reset();
  };

  const backToSetup = () => {
    setSetupPlayers(activePlayers);
    setSelection(null);
    setBubbleMode(false);
    setToast(null);
    setSetupMode(true);
  };

  const selectionInfo = selection ? `${selection.count} token(s) from space ${selection.space + 1}` : 'None';
  const info = !started
    ? 'Use the start menu to configure players, then begin.'
    : state.winner
      ? `${state.winner} wins!`
      : `${currentPlayer?.name ?? '—'} to act`;

  return (
    <div className="app">
      <div className="header">
        <div>
          <h1>STACKERS: Five & Slide</h1>
          <div className="legend">Stacks render bottom → top; topmost tokens are clickable.</div>
        </div>
        <div className="header-actions">
          {started ? (
            <>
              <button onClick={restartWithActive}>Restart</button>
              <button onClick={backToSetup}>Change lineup</button>
            </>
          ) : (
            <button onClick={startGame} disabled={setupPlayers.length < 2}>Start game</button>
          )}
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
                          value={p.difficulty ?? 'easy'}
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
                  <span className="pill">{p.kind === 'bot' ? `${p.difficulty ?? 'easy'} bot` : 'Human'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="message">{info}</div>
      {state.message && <div className="message subtle">{state.message}</div>}
      {toast && <div className="message warning">{toast}</div>}

      <div className={`board ${!started ? 'disabled' : ''}`}>
        {state.board.map((stack, idx) => {
          const topCount = topContiguousCount(stack, currentPlayer.id);
          const topStart = stack.length - topCount;
          return (
            <div
              key={idx}
              className={`space ${destinationOptions.some((opt) => opt.landing?.type === 'space' && opt.landing.index === idx) ? 'highlight' : ''}`}
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
            >
              <div className="space-label">{idx + 1}</div>
              <div className="stack">
                {stack.map((token, actualIndex) => {
                  const isTopSegment = selection?.space === idx && actualIndex >= stack.length - selection.count;
                  const hoverSegment = hoverSelection?.space === idx && actualIndex >= stack.length - hoverSelection.count;
                  const selectable =
                    started && actualIndex >= topStart && token.player === currentPlayer.id && !bubbleMode && !state.winner;
                  const bubbleSelectable =
                    bubbleAllowed && bubbleMode && token.player === currentPlayer.id && isPinned(stack, actualIndex);
                  return (
                    <div
                      key={actualIndex}
                      className={tokenClasses(token, !!isTopSegment, !!hoverSegment)}
                      style={{ background: state.players.find((p) => p.id === token.player)?.color }}
                      onMouseEnter={() => {
                        if (selectable) setHoverSelection({ space: idx, count: stack.length - actualIndex });
                      }}
                      onMouseLeave={() => setHoverSelection(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (bubbleSelectable) {
                          handleBubbleClick(idx, actualIndex);
                        } else if (selectable) {
                          handleTokenSelect(idx, actualIndex);
                        }
                      }}
                    >
                      {token.player}
                    </div>
                  );
                })}
                {destinationOptions.some((opt) => opt.landing?.type === 'exit' && opt.action.from === idx) && (
                  <div className="exit-indicator" onClick={() => handleDestinationClick('exit')}>
                    Exit →
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="controls">
        <div className="control-card">
          <h3>Placement</h3>
          <p>Lowest empty space: {placementTarget !== null ? placementTarget + 1 : '—'}</p>
          <button onClick={() => dispatch({ type: 'place' })} disabled={!canPlaceToken}>
            Place token
          </button>
        </div>
        <div className="control-card">
          <h3>Bubble Up</h3>
          <button onClick={() => setBubbleMode(true)} disabled={!bubbleAllowed}>
            Start bubble mode
          </button>
          {bubbleMode && bubbleAllowed && <p>Tap a pinned token you own to bubble.</p>}
        </div>
        <div className="control-card">
          <h3>Selection</h3>
          <div>Selected: {selectionInfo}</div>
          <div>Legal destinations highlighted on board.</div>
        </div>
      </div>

      <div className="message subtle">
        If all on-board tokens are pinned and an empty space exists with unplaced tokens, placement is forced. Bubble Up is
        only for turns with no moves or placements.
      </div>
      <div className="message subtle">Segment selection: click deeper into your top stack to move that token and everything above it.</div>
    </div>
  );
}
