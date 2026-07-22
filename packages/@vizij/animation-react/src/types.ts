import type { ReactNode } from "react";
import type {
  StoredAnimation,
  Inputs,
  OutputsWithDerivatives,
  Config,
  InstanceUpdate,
  AnimationInfo,
  PlayerInfo,
  InstanceInfo,
  AnimId,
  BakingConfig,
  BakedAnimationData,
  BakedAnimationBundle,
  Value as WasmValue,
  InitInput,
} from "@vizij/animation";

export type Value = WasmValue;

export type InstanceSpec = {
  playerName: string;
  /** Which animation index in `animations` array to attach; defaults to 0 */
  animIndex?: number;
  /** Optional raw InstanceCfg JSON; pass-through to engine.addInstance */
  cfg?: unknown;
};

export type AnimationProviderProps = {
  children: ReactNode;
  /** One or more StoredAnimation objects to load on mount (and when identity changes) */
  animations: StoredAnimation[] | StoredAnimation;
  /**
   * Instances to create on mount. If omitted, a single player "default" with the 0th animation is created.
   * Example: [{ playerName: "demo", animIndex: 0 }]
   */
  instances?: InstanceSpec[];
  /**
   * Optional: Prebind resolver mapping canonical target paths to keys.
   * Return string | number | null/undefined. Numbers will be coerced to string in the WASM layer.
   */
  prebind?: (path: string) => string | number | null | undefined;
  /** Start an internal RAF loop that calls engine.update(dt) each frame */
  autostart?: boolean;
  /** Throttle UI notifications (Hz). Default: notify every frame while autostarting */
  updateHz?: number;
  /** Optional engine configuration for Engine constructor. Changing this re-initializes the Engine. */
  engineConfig?: Config;
  /** Optional callback to receive raw Outputs each update (includes events and derivatives). */
  onOutputs?: (out: OutputsWithDerivatives) => void;
  /** Optional init input passed to @vizij/animation.init for tests and SSR. */
  wasmInitInput?: InitInput;
};

export type AnimationContextValue = {
  ready: boolean;
  /** Subscribe to changes for a given resolved target key; returns unsubscribe */
  subscribeToKey: (key: string, cb: () => void) => () => void;
  /** Snapshot accessor for latest Value of a given resolved target key */
  getKeySnapshot: (key: string) => Value | undefined;
  /** Subscribe to derivative changes for a resolved target key */
  subscribeToDerivativeKey: (key: string, cb: () => void) => () => void;
  /** Snapshot accessor for latest derivative of a given resolved target key */
  getKeyDerivativeSnapshot: (key: string) => Value | undefined;
  /** Subscribe to per-player key changes */
  subscribeToPlayerKey: (
    player: string | number,
    key: string,
    cb: () => void,
  ) => () => void;
  /** Snapshot accessor for per-player key */
  getPlayerKeySnapshot: (
    player: string | number,
    key: string,
  ) => Value | undefined;
  /** Subscribe to per-player derivative changes */
  subscribeToPlayerDerivative: (
    player: string | number,
    key: string,
    cb: () => void,
  ) => () => void;
  /** Snapshot accessor for per-player derivatives */
  getPlayerDerivativeSnapshot: (
    player: string | number,
    key: string,
  ) => Value | undefined;
  /** Get latest values grouped by player name */
  getLatestValuesByPlayer: () => Record<string, Record<string, Value>>;
  /** Get latest derivatives grouped by player name */
  getLatestDerivativesByPlayer: () => Record<string, Record<string, Value>>;
  /** Manual step; useful when autostart=false */
  step: (dt: number, inputs?: Inputs) => void;
  /** Reload animations and instances at runtime */
  reload: (
    animations: StoredAnimation[] | StoredAnimation,
    instances?: InstanceSpec[],
  ) => void;
  /** Append one or more animations without resetting existing state; returns new AnimIds (numbers) */
  addAnimations: (animations: StoredAnimation[] | StoredAnimation) => number[];
  /** Ensure a player exists with this name; returns PlayerId (number) */
  addPlayer: (name: string) => number;
  /** Add one or more instances to players; resolves animation by index or explicit id */
  addInstances: (
    specs: { playerName: string; animIndexOrId: number; cfg?: unknown }[],
  ) => { playerName: string; instId: number }[];
  /** Get instance ids for a given player (local cache; prefer listInstances for engine truth) */
  getInstances: (playerName: string) => number[];
  /** Apply instance-level updates immediately */
  updateInstances: (updates: InstanceUpdate[]) => void;
  /** Enumerate engine state (authoritative) */
  listAnimations: () => AnimationInfo[];
  listPlayers: () => PlayerInfo[];
  listInstances: (player: string | number) => InstanceInfo[];
  /** Keys currently associated with a player's instances */
  listPlayerKeys: (player: string | number) => string[];
  /** Removals */
  removePlayer: (player: string | number) => boolean;
  removeInstances: (
    specs: { playerName: string; instId: number }[],
  ) => { playerName: string; instId: number }[];
  unloadAnimations: (animIds: number[]) => number[];
  /** Baking helpers */
  bakeAnimation: (
    animIndexOrId: number,
    cfg?: BakingConfig,
  ) => BakedAnimationData | null;
  bakeAnimationWithDerivatives: (
    animIndexOrId: number,
    cfg?: BakingConfig,
  ) => BakedAnimationBundle | null;
  /** Optional: expose player name to id mapping for controls */
  players: Record<string, number>;
};

export type PlayerId = AnimId; // Alias for clarity when handling per-player data

export type Unsubscribe = () => void;
