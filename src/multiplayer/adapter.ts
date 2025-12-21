import { applyAction, getLegalActions } from '../engine/engine';
import { chooseBotAction } from '../engine/bots';
import { createInitialState } from '../engine/state';
import { GameState, LegalAction, PlayerInfo } from '../engine/types';
import { makeRoomCode, makeRoomId } from '../utils/ids';
import { GameController } from '../controllers/types';

interface JoinRequest {
  type: 'join-request';
  clientId: string;
  name: string;
}

interface JoinAccept {
  type: 'join-accept';
  clientId: string;
  player: PlayerInfo;
  players: PlayerInfo[];
  state?: GameState;
}

interface JoinReject {
  type: 'join-reject';
  clientId: string;
  reason: string;
}

interface PlayerUpdate {
  type: 'players-update';
  players: PlayerInfo[];
}

interface StateUpdate {
  type: 'state-update';
  state: GameState;
}

interface ActionMessage {
  type: 'action';
  clientId: string;
  playerId: string;
  action: LegalAction;
}

interface ToastMessage {
  type: 'toast';
  clientId: string;
  text: string;
}

type RoomMessage = JoinRequest | JoinAccept | JoinReject | PlayerUpdate | StateUpdate | ActionMessage | ToastMessage;

const palette = ['#ef4444', '#3b82f6', '#10b981', '#f97316', '#a855f7', '#14b8a6', '#e11d48', '#0ea5e9'];
const activeRoomCodes = new Set<string>();

export class NetworkController implements GameController {
  public kind: GameController['kind'] = 'network';
  public role: 'host' | 'client';
  private socket: WebSocket | null = null;
  private pendingSocket: Promise<void> | null = null;
  private callbacks: { state: ((s: GameState) => void)[]; join: ((p: PlayerInfo) => void)[]; leave: ((id: string) => void)[]; players: ((p: PlayerInfo[]) => void)[] } = {
    state: [],
    join: [],
    leave: [],
    players: []
  };
  private roomCode: string | null = null;
  private clientId = makeRoomId();
  private assignedPlayer: PlayerInfo | null = null;
  private hostPlayers: PlayerInfo[] = [];
  private state: GameState | null = null;
  private botTimer: number | null = null;

  constructor(role: 'host' | 'client') {
    this.role = role;
  }

  private getRoomSocketUrl() {
    const host = window.location.hostname;
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const port = 8787;
    return `${protocol}://${host}:${port}`;
  }

  getAssignedPlayer() {
    return this.assignedPlayer;
  }

  getRoomCode() {
    return this.roomCode;
  }

  getState() {
    return this.state;
  }

  getPlayers() {
    return this.hostPlayers.length ? this.hostPlayers : this.state?.players ?? [];
  }

  onStateChange(cb: (state: GameState) => void) {
    this.callbacks.state.push(cb);
  }

  onPlayerJoin(cb: (player: PlayerInfo) => void) {
    this.callbacks.join.push(cb);
  }

  onPlayerLeave(cb: (playerId: string) => void) {
    this.callbacks.leave.push(cb);
  }

  onPlayersChange(cb: (players: PlayerInfo[]) => void) {
    this.callbacks.players.push(cb);
  }

  onPlayersChanged(cb: (players: PlayerInfo[]) => void) {
    this.callbacks.players.push(cb);
  }

  private ensureSocket(roomCode: string) {
    if (this.roomCode && this.roomCode !== roomCode && this.socket) {
      this.socket.close();
      this.socket = null;
    }

    if (this.socket && this.socket.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.pendingSocket) return this.pendingSocket;

    const url = this.getRoomSocketUrl();
    console.info('[room] opening websocket to', url, 'for room', roomCode);

    this.pendingSocket = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      let settled = false;

      const cleanup = () => {
        ws.removeEventListener('open', handleOpen);
        ws.removeEventListener('error', handleError);
      };

      const handleOpen = () => {
        console.info('[room] websocket connected');
        ws.send(JSON.stringify({ type: 'join-room', roomCode }));
        settled = true;
        cleanup();
        resolve();
      };

      const handleError = (event: Event) => {
        console.error('[room] websocket error', event);
        if (!settled) {
          settled = true;
          cleanup();
          reject(new Error('Unable to connect to room server'));
        }
      };

      ws.addEventListener('open', handleOpen);
      ws.addEventListener('error', handleError);

      ws.addEventListener('close', () => {
        console.warn('[room] websocket closed');
        this.socket = null;
        this.pendingSocket = null;
      });

      ws.addEventListener('message', (event) => {
        try {
          const parsed = JSON.parse(event.data as string) as { type: string; roomCode?: string; payload?: RoomMessage };
          if (parsed.type === 'room-message' && parsed.payload) {
            this.handleMessage(parsed.payload);
          }
        } catch (err) {
          console.error('[room] failed to parse message', err);
        }
      });

      this.socket = ws;
    }).finally(() => {
      this.pendingSocket = null;
    });

    return this.pendingSocket;
  }

  private sendMessage(msg: RoomMessage) {
    if (!this.roomCode) throw new Error('No room joined');
    const payload = { type: 'room-message', roomCode: this.roomCode, payload: msg };
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
      return;
    }
    throw new Error('Room socket not connected');
  }

  private emitState(state: GameState) {
    this.callbacks.state.forEach((cb) => cb(state));
  }

  private emitPlayers(players: PlayerInfo[]) {
    this.callbacks.players.forEach((cb) => cb(players));
  }

  async createRoom(hostPlayer: PlayerInfo): Promise<{ roomCode: string }> {
    if (this.role !== 'host') throw new Error('Only host can create room');
    const code = makeRoomCode(6, activeRoomCodes);
    this.roomCode = code;
    await this.ensureSocket(code);
    this.hostPlayers = [hostPlayer];
    this.assignedPlayer = hostPlayer;
    this.broadcastPlayers();
    return { roomCode: code };
  }

  async joinRoom(roomCode: string, requestedName: string): Promise<void> {
    if (this.role !== 'client') throw new Error('Only client can join');
    this.roomCode = roomCode;
    await this.ensureSocket(roomCode);
    const msg: JoinRequest = { type: 'join-request', clientId: this.clientId, name: requestedName };
    this.sendMessage(msg);
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('No response from host')), 5000);
      const handler = (event: MessageEvent) => {
        try {
          const envelope = JSON.parse(event.data as string) as { type: string; payload?: RoomMessage };
          if (envelope.type !== 'room-message' || !envelope.payload) return;
          const data = envelope.payload;
          if (data.type === 'join-accept' && data.clientId === this.clientId) {
            clearTimeout(timeout);
            this.socket!.removeEventListener('message', handler as any);
            this.assignedPlayer = data.player;
            this.callbacks.join.forEach((cb) => cb(data.player));
            this.emitPlayers(data.players);
            if (data.state) {
              this.state = data.state;
              this.emitState(data.state);
            }
            resolve();
          }
          if (data.type === 'join-reject' && data.clientId === this.clientId) {
            clearTimeout(timeout);
            this.socket!.removeEventListener('message', handler as any);
            reject(new Error(data.reason));
          }
        } catch (err) {
          console.error('[room] invalid message while joining', err);
        }
      };
      this.socket?.addEventListener('message', handler as any);
    });
  }

  setHostPlayers(players: PlayerInfo[]) {
    if (this.role !== 'host') return;
    this.hostPlayers = players;
    this.broadcastPlayers();
    if (this.state) {
      this.state = { ...this.state, players };
      this.broadcastState();
    }
  }

  setPlayers(players: PlayerInfo[]) {
    this.setHostPlayers(players);
  }

  startGame(players: PlayerInfo[]) {
    if (this.role !== 'host') return;
    this.hostPlayers = players;
    this.state = createInitialState(players);
    this.broadcastState();
    this.broadcastPlayers();
    this.emitState(this.state);
    this.maybeScheduleBot();
  }

  private broadcastState() {
    if (this.socket && this.state) {
      const msg: StateUpdate = { type: 'state-update', state: this.state };
      try {
        this.sendMessage(msg);
      } catch (err) {
        console.error('[room] failed to broadcast state', err);
      }
    }
  }

  private broadcastPlayers() {
    if (this.socket) {
      const msg: PlayerUpdate = { type: 'players-update', players: this.hostPlayers };
      try {
        this.sendMessage(msg);
      } catch (err) {
        console.error('[room] failed to broadcast players', err);
      }
      this.emitPlayers(this.hostPlayers);
    }
  }

  submitAction(action: LegalAction) {
    if (!this.assignedPlayer) return;
    if (this.role === 'host') {
      this.applyHostAction(this.assignedPlayer.id, action);
    } else {
      const msg: ActionMessage = {
        type: 'action',
        action,
        clientId: this.clientId,
        playerId: this.assignedPlayer.id
      };
      try {
        this.sendMessage(msg);
      } catch (err) {
        console.error('[room] failed to send action', err);
      }
    }
  }

  private handleMessage(message: RoomMessage) {
    if (message.type === 'players-update') {
      this.emitPlayers(message.players);
      return;
    }
    if (message.type === 'state-update') {
      this.state = message.state;
      this.emitState(message.state);
      return;
    }
    if (message.type === 'join-request') {
      this.handleJoinRequest(message);
      return;
    }
    if (message.type === 'action') {
      this.applyHostAction(message.playerId, message.action, message.clientId);
    }
    if (message.type === 'toast' && message.clientId === this.clientId) {
      // Clients can surface toasts if desired later
    }
  }

  private handleJoinRequest(message: JoinRequest) {
    if (this.role !== 'host') return;
    if (this.hostPlayers.length >= 8) {
      const reject: JoinReject = { type: 'join-reject', clientId: message.clientId, reason: 'Room full' };
      this.sendMessage(reject);
      return;
    }
    const nextIdx = this.hostPlayers.length;
    const player: PlayerInfo = {
      id: `P${nextIdx + 1}`,
      name: message.name || `Player ${nextIdx + 1}`,
      color: palette[nextIdx % palette.length],
      kind: 'human'
    };
    this.hostPlayers = [...this.hostPlayers, player];
    const accept: JoinAccept = {
      type: 'join-accept',
      clientId: message.clientId,
      player,
      players: this.hostPlayers,
      state: this.state ?? undefined
    };
    this.sendMessage(accept);
    this.callbacks.join.forEach((cb) => cb(player));
    this.broadcastPlayers();
  }

  private applyHostAction(playerId: string, action: LegalAction, clientId?: string) {
    if (this.role !== 'host' || !this.state) return;
    if (this.state.winner) return;
    const current = this.state.players[this.state.currentIndex];
    if (!current || current.id !== playerId) {
      this.sendToast(clientId, 'Not your turn');
      return;
    }
    const legal = getLegalActions(this.state).some((candidate) => JSON.stringify(candidate) === JSON.stringify(action));
    if (!legal) {
      this.sendToast(clientId, 'Illegal action');
      return;
    }
    this.state = applyAction(this.state, action);
    this.emitState(this.state);
    this.broadcastState();
    this.maybeScheduleBot();
  }

  private sendToast(clientId: string | undefined, text: string) {
    if (!clientId || !this.socket) return;
    const toast: ToastMessage = { type: 'toast', clientId, text };
    try {
      this.sendMessage(toast);
    } catch (err) {
      console.error('[room] failed to send toast', err);
    }
  }

  private maybeScheduleBot() {
    if (this.role !== 'host' || !this.state) return;
    const player = this.state.players[this.state.currentIndex];
    if (!player || player.kind !== 'bot' || this.state.winner) return;
    if (this.botTimer) {
      clearTimeout(this.botTimer);
    }
    this.botTimer = window.setTimeout(() => {
      const action = chooseBotAction(this.state!, player.difficulty || 'medium');
      if (action) {
        this.applyHostAction(player.id, action);
      }
    }, 500);
  }
  dispose() {
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close();
    }
    this.socket = null;
    this.pendingSocket = null;
  }
}
