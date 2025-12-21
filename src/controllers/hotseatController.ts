import { applyAction, getLegalActions } from '../engine/engine';
import { chooseBotAction } from '../engine/bots';
import { createInitialState } from '../engine/state';
import { GameState, LegalAction, PlayerInfo } from '../engine/types';
import { GameController } from './types';

export class HotseatController implements GameController {
  public kind: GameController['kind'] = 'hotseat';
  public role: GameController['role'] = 'host';
  private state: GameState | null = null;
  private players: PlayerInfo[] = [];
  private stateCallbacks: ((state: GameState) => void)[] = [];
  private playerCallbacks: ((players: PlayerInfo[]) => void)[] = [];
  private botTimer: number | null = null;

  startGame(players: PlayerInfo[]) {
    this.players = players;
    this.state = createInitialState(players);
    this.emitState();
    this.emitPlayers();
    this.scheduleBot();
  }

  getState() {
    return this.state;
  }

  getPlayers() {
    return this.players;
  }

  getAssignedPlayer() {
    return null;
  }

  setPlayers(players: PlayerInfo[]) {
    this.players = players;
    this.emitPlayers();
  }

  submitAction(action: LegalAction) {
    if (!this.state || this.state.winner) return;
    const legal = getLegalActions(this.state).some((candidate) => JSON.stringify(candidate) === JSON.stringify(action));
    console.debug('[hotseat] submitAction received', action, 'legal?', legal);
    if (!legal) {
      console.warn('[hotseat] illegal action rejected', action);
      return;
    }
    this.state = applyAction(this.state, action);
    console.debug('[hotseat] action applied; next player index', this.state.currentIndex);
    this.emitState();
    this.scheduleBot();
  }

  onStateChange(callback: (state: GameState) => void) {
    this.stateCallbacks.push(callback);
  }

  onPlayersChange(callback: (players: PlayerInfo[]) => void) {
    this.playerCallbacks.push(callback);
  }

  dispose() {
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
  }

  private emitPlayers() {
    this.playerCallbacks.forEach((cb) => cb(this.players));
  }

  private emitState() {
    if (this.state) {
      this.stateCallbacks.forEach((cb) => cb(this.state!));
    }
  }

  private scheduleBot() {
    if (!this.state) return;
    const player = this.state.players[this.state.currentIndex];
    if (!player || player.kind !== 'bot' || this.state.winner) return;
    if (this.botTimer) {
      clearTimeout(this.botTimer);
    }
    const timerHost = typeof window !== 'undefined' ? window : globalThis;
    this.botTimer = timerHost.setTimeout(() => {
      const action = chooseBotAction(this.state!, player.difficulty || 'medium');
      if (action) {
        this.submitAction(action);
      }
    }, 500);
  }
}
