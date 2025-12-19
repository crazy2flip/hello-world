import { applyAction, getLegalActions } from '../engine/engine';
import { chooseBotAction } from '../engine/bots';
import { createInitialState } from '../engine/state';
import { GameState, LegalAction, PlayerInfo } from '../engine/types';

export interface MultiplayerAdapter {
  role: 'host' | 'client';
  createRoom(hostPlayer: PlayerInfo): Promise<{ roomCode: string }>;
  joinRoom(roomCode: string, requestedName: string): Promise<void>;
  startGame(players: PlayerInfo[]): void;
  sendAction(action: LegalAction): void;
  setHostPlayers?(players: PlayerInfo[]): void;
  onStateUpdate(callback: (state: GameState) => void): void;
  onPlayerJoin(callback: (player: PlayerInfo) => void): void;
  onPlayerLeave(callback: (playerId: string) => void): void;
  onPlayersChanged(callback: (players: PlayerInfo[]) => void): void;
  getAssignedPlayer(): PlayerInfo | null;
  getRoomCode(): string | null;
}

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

function randomCode(length = 5) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let res = '';
  for (let i = 0; i < length; i++) {
    res += chars[Math.floor(Math.random() * chars.length)];
  }
  return res;
}

export class LocalMultiplayerAdapter implements MultiplayerAdapter {
  public role: 'host' | 'client';
  private channel: BroadcastChannel | null = null;
  private callbacks: { state: ((s: GameState) => void)[]; join: ((p: PlayerInfo) => void)[]; leave: ((id: string) => void)[]; players: ((p: PlayerInfo[]) => void)[] } = {
    state: [],
    join: [],
    leave: [],
    players: []
  };
  private roomCode: string | null = null;
  private clientId = crypto.randomUUID();
  private assignedPlayer: PlayerInfo | null = null;
  private hostPlayers: PlayerInfo[] = [];
  private state: GameState | null = null;
  private botTimer: number | null = null;

  constructor(role: 'host' | 'client') {
    this.role = role;
  }

  getAssignedPlayer() {
    return this.assignedPlayer;
  }

  getRoomCode() {
    return this.roomCode;
  }

  onStateUpdate(cb: (state: GameState) => void) {
    this.callbacks.state.push(cb);
  }

  onPlayerJoin(cb: (player: PlayerInfo) => void) {
    this.callbacks.join.push(cb);
  }

  onPlayerLeave(cb: (playerId: string) => void) {
    this.callbacks.leave.push(cb);
  }

  onPlayersChanged(cb: (players: PlayerInfo[]) => void) {
    this.callbacks.players.push(cb);
  }

  private emitState(state: GameState) {
    this.callbacks.state.forEach((cb) => cb(state));
  }

  private emitPlayers(players: PlayerInfo[]) {
    this.callbacks.players.forEach((cb) => cb(players));
  }

  private openChannel(roomCode: string) {
    if (this.channel) this.channel.close();
    this.channel = new BroadcastChannel(`stackers-room-${roomCode}`);
    this.channel.onmessage = (event) => this.handleMessage(event.data as RoomMessage);
  }

  async createRoom(hostPlayer: PlayerInfo): Promise<{ roomCode: string }> {
    if (this.role !== 'host') throw new Error('Only host can create room');
    const code = randomCode();
    this.roomCode = code;
    this.hostPlayers = [hostPlayer];
    this.assignedPlayer = hostPlayer;
    this.openChannel(code);
    this.broadcastPlayers();
    return { roomCode: code };
  }

  async joinRoom(roomCode: string, requestedName: string): Promise<void> {
    if (this.role !== 'client') throw new Error('Only client can join');
    this.roomCode = roomCode;
    this.openChannel(roomCode);
    const msg: JoinRequest = { type: 'join-request', clientId: this.clientId, name: requestedName };
    this.channel?.postMessage(msg);
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('No response from host')), 5000);
      const handler = (event: MessageEvent<RoomMessage>) => {
        const data = event.data;
        if (data.type === 'join-accept' && data.clientId === this.clientId) {
          clearTimeout(timeout);
          this.channel!.removeEventListener('message', handler as any);
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
          this.channel!.removeEventListener('message', handler as any);
          reject(new Error(data.reason));
        }
      };
      this.channel?.addEventListener('message', handler as any);
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
    if (this.channel && this.state) {
      const msg: StateUpdate = { type: 'state-update', state: this.state };
      this.channel.postMessage(msg);
    }
  }

  private broadcastPlayers() {
    if (this.channel) {
      const msg: PlayerUpdate = { type: 'players-update', players: this.hostPlayers };
      this.channel.postMessage(msg);
      this.emitPlayers(this.hostPlayers);
    }
  }

  sendAction(action: LegalAction) {
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
      this.channel?.postMessage(msg);
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
      this.channel?.postMessage(reject);
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
    this.channel?.postMessage(accept);
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
    if (!clientId || !this.channel) return;
    const toast: ToastMessage = { type: 'toast', clientId, text };
    this.channel.postMessage(toast);
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
}
