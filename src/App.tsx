import React, { useEffect, useMemo, useState } from 'react';
import { getBubbleOptions, getLegalActions, getMoveOptions, placementDestination, predictLandingForMove, topContiguousCount, isPinned } from './engine/engine';
import { createInitialState } from './engine/state';
import { BubbleAction, GameState, LegalAction, MoveAction, PlayerInfo } from './engine/types';
import { LocalMultiplayerAdapter } from './multiplayer/adapter';

const palette = ['#ef4444', '#3b82f6', '#10b981', '#f97316', '#a855f7', '#14b8a6', '#e11d48', '#0ea5e9'];

function defaultPlayers(count = 2): PlayerInfo[] {
  return Array.from({ length: count }).map((_, idx) => ({
    id: `P${idx + 1}`,
    name: idx === 0 ? 'Host' : `Player ${idx + 1}`,
    color: palette[idx % palette.length],
    kind: 'human'
  }));
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

function nextBot(players: PlayerInfo[], difficulty: NonNullable<PlayerInfo['difficulty']> = 'medium'): PlayerInfo {
  const idx = players.length;
  return {
    id: `P${idx + 1}`,
    name: `AI ${idx + 1}`,
    color: palette[idx % palette.length],
    kind: 'bot',
    difficulty
  };
}

export default function App() {
  const [mode, setMode] = useState<'host' | 'client'>('host');
  const [adapter, setAdapter] = useState<LocalMultiplayerAdapter | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [nameInput, setNameInput] = useState('Host');
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [state, setState] = useState<GameState | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [hoverSelection, setHoverSelection] = useState<Selection | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [status, setStatus] = useState('Pick a mode to begin.');

  const assignedPlayer = adapter?.getAssignedPlayer() ?? null;
  const started = !!state;
  const livePlayers = started ? state.players : players.length > 0 ? players : defaultPlayers();
  const liveState = state ?? createInitialState(livePlayers);
  const currentPlayer = liveState.players[liveState.currentIndex];
  const myTurn = started && assignedPlayer?.id === currentPlayer?.id;

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 1400);
      return () => clearTimeout(t);
    }
  }, [toast]);

  useEffect(() => {
    setSelection(null);
    setHoverSelection(null);
  }, [liveState.currentIndex]);

  useEffect(() => {
    if (!adapter) return;
    const handleState = (s: GameState) => {
      setState(s);
      setSelection(null);
      setHoverSelection(null);
    };
    const handlePlayers = (list: PlayerInfo[]) => setPlayers(list);
    adapter.onStateUpdate(handleState);
    adapter.onPlayersChanged(handlePlayers);
    adapter.onPlayerJoin((player) => setStatus(`${player.name} joined.`));
  }, [adapter]);

  const moveOptions = useMemo(() => (started ? getMoveOptions(liveState) : []), [started, liveState]);
  const bubbleOptions = useMemo(() => (started ? getBubbleOptions(liveState) : []), [started, liveState]);
  const legalActions = useMemo(() => (started ? getLegalActions(liveState) : []), [started, liveState]);
  const placementTarget = started ? placementDestination(liveState) : null;
  const canPlaceToken = started && myTurn && legalActions.some((a) => a.type === 'place');
  const bubbleAllowed = started && myTurn && bubbleOptions.length > 0 && moveOptions.length === 0 && !canPlaceToken;

  const destinationOptions = useMemo(() => {
    if (!selection) return [] as { landing: ReturnType<typeof predictLandingForMove>; action: MoveAction }[];
    return moveOptions
      .filter((m) => m.from === selection.space && m.count === selection.count)
      .map((action) => ({ action, landing: predictLandingForMove(liveState, action) }))
      .filter((item) => item.landing !== null);
  }, [selection, moveOptions, liveState]);

  const beginMoveSelection = (space: number, tokenIndex: number) => {
    const stack = liveState.board[space];
    const playerId = assignedPlayer?.id;
    if (!playerId) return null;
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
    if (!started || liveState.winner || !myTurn || !adapter) return;
    if (bubbleAllowed && isPinned(liveState.board[space], tokenIndex) && liveState.board[space][tokenIndex].player === currentPlayer.id) {
      const isLegal = legalActions.some((a) => a.type === 'bubble' && a.space === space && a.tokenIndex === tokenIndex);
      if (isLegal) adapter.sendAction({ type: 'bubble', space, tokenIndex });
      return;
    }
    const res = beginMoveSelection(space, tokenIndex);
    if (!res) {
      setToast('Illegal selection');
    }
  };

  const handleDestinationClick = (target: number | 'exit') => {
    if (!selection || !started || !myTurn || !adapter) return;
    const match = destinationOptions.find((opt) =>
      opt.landing && (opt.landing.type === 'exit' ? target === 'exit' : opt.landing.index === target)
    );
    if (!match) {
      setToast('Illegal move');
      return;
    }
    adapter.sendAction(match.action);
    setSelection(null);
  };

  const handleDragStartToken = (e: React.DragEvent<HTMLDivElement>, space: number, tokenIndex: number) => {
    if (!started || liveState.winner || !myTurn) {
      e.preventDefault();
      return;
    }
    const stack = liveState.board[space];
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
    if (!canPlaceToken || !adapter) {
      setToast('Placement not available');
      return;
    }
    adapter.sendAction({ type: 'place' });
  };

  const parseDrag = (e: React.DragEvent<HTMLElement>): DragPayload | null => {
    try {
      const data = e.dataTransfer.getData('application/json');
      return data ? (JSON.parse(data) as DragPayload) : null;
    } catch {
      return null;
    }
  };

  const tryBubbleDrop = (space: number, payload: DragPayload) => {
    if (!bubbleAllowed || payload.kind !== 'bubble' || payload.space === undefined || payload.tokenIndex === undefined || !adapter)
      return false;
    if (payload.space !== space) return false;
    const isLegal = legalActions.some((a) => a.type === 'bubble' && a.space === payload.space && a.tokenIndex === payload.tokenIndex);
    if (isLegal) {
      adapter.sendAction({ type: 'bubble', space: payload.space, tokenIndex: payload.tokenIndex });
      return true;
    }
    return false;
  };

  const tryPlaceDrop = (space: number, payload: DragPayload) => {
    if (payload.kind !== 'place' || !adapter) return false;
    if (placementTarget === space && canPlaceToken) {
      adapter.sendAction({ type: 'place' });
      return true;
    }
    setToast('Place at highlighted slot');
    return false;
  };

  const tryMoveDrop = (space: number | 'exit', payload: DragPayload) => {
    if (payload.kind !== 'move' || payload.from === undefined || payload.count === undefined || !adapter) return false;
    const dir = space === 'exit' ? 'forward' : space > payload.from ? 'forward' : 'backward';
    const action = moveOptions.find((m) => m.from === payload.from && m.count === payload.count && m.dir === dir);
    if (!action) return false;
    const landing = predictLandingForMove(liveState, action);
    if (space === 'exit' && landing?.type !== 'exit') return false;
    if (typeof space === 'number' && (!landing || landing.type !== 'space' || landing.index !== space)) return false;
    adapter.sendAction(action);
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

  const createRoom = async () => {
    const hostPlayer: PlayerInfo = { ...defaultPlayers(1)[0], name: nameInput.trim() || 'Host' };
    setStatus('Connecting to room server...');
    console.info('Creating room for host player', hostPlayer.name);
    try {
      const host = new LocalMultiplayerAdapter('host');
      await host.createRoom(hostPlayer);
      setAdapter(host);
      setRoomCode(host.getRoomCode());
      setPlayers([hostPlayer]);
      setStatus('Room created. Share the code to invite others on your network.');
    } catch (err) {
      console.error('Room creation failed', err);
      setStatus(`Failed to create room: ${(err as Error).message}`);
      setToast('Could not create room. Ensure the room server is running and reachable.');
    }
  };

  const joinRoom = async () => {
    const trimmedCode = joinCode.trim().toUpperCase();
    setStatus('Connecting to room...');
    console.info('Attempting to join room', trimmedCode);
    try {
      const client = new LocalMultiplayerAdapter('client');
      await client.joinRoom(trimmedCode, nameInput.trim() || 'Player');
      setAdapter(client);
      setRoomCode(trimmedCode);
      setStatus('Joined room. Waiting for host to start.');
      if (client.getAssignedPlayer()) {
        setPlayers((prev) => {
          if (prev.length > 0) return prev;
          return [client.getAssignedPlayer()!];
        });
      }
    } catch (err) {
      console.error('Join failed', err);
      setStatus(`Failed to join room: ${(err as Error).message}`);
      setToast('Could not join room. Check the room code and network connection.');
      setAdapter(null);
    }
  };

  const addBot = (difficulty: NonNullable<PlayerInfo['difficulty']> = 'medium') => {
    if (!adapter || adapter.role !== 'host') return;
    if (players.length >= 8) return;
    const updated = [...players, nextBot(players, difficulty)];
    adapter.setHostPlayers?.(updated);
  };

  const removePlayer = (player: PlayerInfo) => {
    if (!adapter || adapter.role !== 'host') return;
    if (player.id === assignedPlayer?.id) return;
    if (players.length <= 2) return;
    const updated = players.filter((p) => p.id !== player.id);
    adapter.setHostPlayers?.(updated);
  };

  const startGame = () => {
    if (!adapter || adapter.role !== 'host') return;
    if (players.length < 2) return;
    adapter.startGame(players);
    setStatus('Game live. Host validates turns.');
  };

  const restartGame = () => {
    if (!adapter || adapter.role !== 'host') return;
    adapter.startGame(players);
    setToast(null);
    setStatus('Rematch in progress.');
  };

  const backToLobby = () => {
    setState(null);
    setSelection(null);
    setHoverSelection(null);
    setToast(null);
    setStatus('Back to lobby.');
  };

  const info = !started
    ? status
    : liveState.winner
      ? `${liveState.players.find((p) => p.id === liveState.winner)?.name ?? liveState.winner} wins!`
      : `${currentPlayer?.name ?? '—'} to act`;

  return (
    <div className="app">
      <div className="header">
        <div>
          <h1>STACKERS: Five & Slide</h1>
          <div className="legend">LAN-ready rooms with host-authoritative turns. Share your room code and play together.</div>
        </div>
        <div className="header-actions">
          {adapter?.role === 'host' && started ? (
            <>
              <button onClick={restartGame}>Restart</button>
              <button onClick={backToLobby}>Return to lobby</button>
            </>
          ) : null}
        </div>
      </div>

      <section className="setup">
        <h3>Room & Players (1–8)</h3>
        <div className="player-grid">
          <div className="player-card" style={{ borderColor: '#ccc' }}>
            <div className="player-row">
              <label>
                Mode:
                <select value={mode} onChange={(e) => setMode(e.target.value as 'host' | 'client')}>
                  <option value="host">Host a room</option>
                  <option value="client">Join a room</option>
                </select>
              </label>
            </div>
            <div className="player-row">
              <label>
                Your name:
                <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} />
              </label>
            </div>
            {mode === 'host' ? (
              <div className="player-row">
                <button onClick={createRoom} disabled={!!roomCode && adapter?.role === 'host'}>
                  {roomCode ? 'Room ready' : 'Create room'}
                </button>
                {roomCode && <span className="pill">Code: {roomCode}</span>}
              </div>
            ) : (
              <div className="player-row">
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ROOM"
                  maxLength={6}
                />
                <button onClick={joinRoom} disabled={!joinCode}>
                  Join
                </button>
              </div>
            )}
            <div className="player-row subtle">Only the host runs the rules engine; everyone else sends intents.</div>
          </div>

          {players.map((p, idx) => (
            <div key={p.id} className="player-card" style={{ borderColor: p.color }}>
              <div className="player-row">
                <span className="swatch" style={{ background: p.color }} />
                <strong>{p.name}</strong>
                <span className="pill">{p.kind === 'bot' ? `${p.difficulty ?? 'medium'} bot` : 'Human'}</span>
              </div>
              {adapter?.role === 'host' && idx > 0 && (
                <div className="player-row">
                  <button onClick={() => removePlayer(p)} disabled={players.length <= 1}>
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}

          {adapter?.role === 'host' && players.length < 8 && (
            <button className="add-player" onClick={() => addBot('medium')}>
              + Add AI player
            </button>
          )}
        </div>
        {adapter?.role === 'host' && (
          <div className="setup-actions">
            <div>Share the room code after creating it. Players join and receive state from the host.</div>
            <div className="subtle">Want to play solo? Start now with just the host seat, or add bots for practice.</div>
            <button onClick={startGame} disabled={players.length < 1 || !roomCode}>
              Start game
            </button>
          </div>
        )}
      </section>

      <div className="message">{info}</div>
      {liveState.message && <div className="message subtle">{liveState.message}</div>}
      {toast && <div className="message warning">{toast}</div>}

      <div className={`play-area ${!started || !myTurn ? 'disabled' : ''}`}>
        <div className="track">
          <div className="space start-space">
            <div className="space-label">Start</div>
            <div className="start-info">Drag or tap your reserve to the glowing slot.</div>
            <div className="reserve-list">
              {liveState.players.map((p) => (
                <div key={p.id} className="reserve-row">
                  <span className="swatch" style={{ background: p.color }} />
                  <span className="reserve-name">{p.name}</span>
                  <div className="reserve-chips">
                    {Array.from({ length: liveState.unplaced[p.id] }).map((_, i) => (
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

          {liveState.board.map((stack, idx) => {
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
                      started && actualIndex >= topStart && token.player === currentPlayer.id && !liveState.winner && myTurn;
                    const bubbleSelectable =
                      bubbleAllowed && token.player === currentPlayer.id && isPinned(stack, actualIndex);
                    return (
                      <div
                        key={actualIndex}
                        className={tokenClasses(!!isTopSegment, !!hoverSegment)}
                        style={{ background: liveState.players.find((p) => p.id === token.player)?.color }}
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
              {liveState.players.map((p) => (
                <div key={p.id} className="exit-row">
                  <span className="swatch" style={{ background: p.color }} />
                  <span className="reserve-name">{p.name}</span>
                  <div className="exit-slots">
                    {Array.from({ length: 5 }).map((_, i) => {
                      const filled = (liveState.exited[p.id] ?? 0) > i;
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
            <li>Host owns the authoritative state. Clients send intents only.</li>
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
          <div>Room: {roomCode ?? 'Not connected'}</div>
          <div>You are: {assignedPlayer?.name ?? '—'}</div>
        </div>
      </div>

      {liveState.winner && (
        <div className="message celebration">
          🎉 {liveState.players.find((p) => p.id === liveState.winner)?.name ?? liveState.winner} conquers the stack! Ready for a rematch?
          <div className="celebration-actions">
            {adapter?.role === 'host' && <button onClick={restartGame}>Rematch</button>}
            {adapter?.role === 'host' && <button onClick={backToLobby}>Change lineup</button>}
          </div>
        </div>
      )}
    </div>
  );
}
