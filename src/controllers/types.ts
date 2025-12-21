import { GameState, LegalAction, PlayerInfo } from '../engine/types';

export interface GameController {
  kind: 'hotseat' | 'network';
  role: 'host' | 'client' | 'local';
  startGame(players: PlayerInfo[]): void | Promise<void>;
  getState(): GameState | null;
  getPlayers(): PlayerInfo[];
  getAssignedPlayer(): PlayerInfo | null;
  submitAction(action: LegalAction): void;
  onStateChange(callback: (state: GameState) => void): void;
  onPlayersChange(callback: (players: PlayerInfo[]) => void): void;
  onPlayerJoin?(callback: (player: PlayerInfo) => void): void;
  setPlayers?(players: PlayerInfo[]): void;
  dispose(): void;
}
