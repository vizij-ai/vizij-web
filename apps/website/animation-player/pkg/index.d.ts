export default function init(): Promise<void>;

export class WasmAnimationEngine {
  constructor(configJson: string | null);
  load_animation(animationJson: string | object): string;
  export_animation(animationId: string): string;
  create_player(): string;
  add_instance(playerId: string, animationId: string): void;
  play(playerId: string): void;
  pause(playerId: string): void;
  stop(playerId: string): void;
  seek(playerId: string, timeSeconds: number): void;

  /**
   * Returns a nested Map:
   * Map<playerId, Map<trackName, { Float: number }>>
   */
  update(
    frameDeltaSeconds: number,
  ): Map<string, Map<string, { Float: number }>>;

  get_player_state(playerId: string): { playing: boolean; timeMs: number };
  get_player_time(playerId: string): number;
  animation_ids(): string[];
  get_player_progress(playerId: string): number;
  get_player_ids(): string[];
  update_player_config(playerId: string, configJson: string): boolean;
  bake_animation(animationId: string, configJson: string): string;
  get_derivatives(playerId: string, widthMs?: number): unknown;
}
/* eslint-disable @typescript-eslint/no-explicit-any */
export function create_test_animation(): any;
