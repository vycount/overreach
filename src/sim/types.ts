// Core data shapes. Everything the engine knows about a move, a character or
// the rules lives in plain data (see data.ts), so tuning never touches engine code.
//
// The board is a list of UNITS on two teams. A unit is a fighter (the team leader),
// a summon (a lion, a clone) or an object (a thrown boulder, a bullet). Every
// fighter and summon gets its own commit each tick, so a fighter and their lion
// act at the same time. Objects follow their own ticker and nobody commits for them.

export type Posture = 'standing' | 'crouching' | 'backfoot' | 'airborne' | 'grounded';
export type Channel = 'lead' | 'rear' | 'legs';
export type Zone = 'head' | 'body' | 'legs';
export type Weight = 'light' | 'medium' | 'heavy';
export type ActionKind = 'strike' | 'grab' | 'block' | 'parry' | 'move' | 'posture' | 'summon' | 'throw';

/** What a hit (or a blocked hit) does to the target. */
export type Reaction =
  | { kind: 'stagger'; ticks: number }
  | { kind: 'backfoot'; ticks: number }
  | { kind: 'knockdown' }
  | { kind: 'thrown'; distance: number };

/** The effect of something landing, from a fist or from a flying boulder. */
export interface Impact {
  zone: Zone;
  damage: number;
  weight: Weight;
  /** How far the target is pushed back on a clean hit. */
  knockback: number;
  onHit: Reaction;
  /** Reaction when blocked. Defaults to rules.blockstun[weight]. */
  onBlock?: Reaction;
}

export interface HitSpec extends Impact {
  /** Distance between the two units' centres at which the move connects: [min, max]. */
  reach: [number, number];
}

/** An action that brings a new unit onto your team when it goes active. */
export interface SummonSpec {
  /** Character id of the new unit, or "self" for a copy of the summoner. */
  char: string;
  /** Health of the new unit. Defaults to that character's maxHp. */
  hp?: number;
  /** How far in front of the summoner it appears. */
  offset: number;
  /** Ticks before it leaves. Omit to stay until defeated. */
  lifetime?: number;
  /** How many of these one fighter can have out at once. */
  max: number;
  /** Action points the owner loses each tick while this summon is out (its upkeep). */
  upkeep?: number;
}

/** An action that releases an object (a boulder, a bullet) when it goes active. */
export interface ProjectileSpec {
  id: string;
  name: string;
  /** Distance travelled per tick, starting the tick after release. */
  speed: number;
  /** Half the object's size, for collisions. */
  radius: number;
  /** How far in front of the thrower it appears. */
  offset: number;
  /** Ticks before it drops out of play. */
  lifetime: number;
  /** What it does to the first unit in its path. Objects don't care who threw them. */
  impact: Impact;
}

export interface ActionDef {
  id: string;
  name: string;
  /** Plain-language description shown to players. */
  description: string;
  kind: ActionKind;
  /** Body channels the action occupies. Two actions on one unit can overlap only if they share none. */
  channels: Channel[];
  /** Action points spent when the action starts. */
  ap: number;
  /** Postures the action can start from. */
  from: Posture[];
  windup: number;
  active: number;
  recovery: number;
  /** Ticks a cancel takes. Only possible during wind-up. Omit for "can't cancel". */
  cancelCost?: number;
  hit?: HitSpec;
  summon?: SummonSpec;
  projectile?: ProjectileSpec;
  /** Distance moved toward the opponent (negative = away), spread over wind-up + active. */
  move?: number;
  /** The unit is airborne during the active ticks. */
  airborne?: boolean;
  /** Posture the unit is in from the first active tick onward. */
  sets?: Posture;
  /** Space needed behind the unit to start (e.g. stepping back at a wall). */
  needsRoomBehind?: number;
}

export interface CharacterDef {
  id: string;
  name: string;
  description: string;
  /** Only appears through a summon, never picked as a fighter. */
  summonOnly?: boolean;
  /** How the viewer draws it. */
  shape: 'humanoid' | 'beast';
  /** Low units (a lion) are never hit by strikes or objects aimed at head height. */
  low?: boolean;
  maxHp: number;
  /** Action points gained at the start of every tick. */
  apIncome: number;
  /** Unspent points carry over, up to this cap. */
  apCap: number;
  apStart: number;
  /** Multiplies wind-up and recovery ticks. Below 1 = faster (speedster). */
  tempo: number;
  /** Damage multiplier. */
  power: number;
  /** Movement distance multiplier. */
  moveMul: number;
  /** Action ids this character can use. */
  moves: string[];
}

export interface Rules {
  stageWidth: number;
  bodyWidth: number;
  startGap: number;
  /** Round timer in ticks. When it runs out, the leader with more health (as a share) wins. */
  maxTicks: number;
  /** Fight time one tick represents, for reporting only. */
  secondsPerTick: number;
  zoneDamage: Record<Zone, number>;
  /** Extra stagger ticks by zone hit (head hits stagger longer). */
  zoneStagger: Record<Zone, number>;
  /** Fraction of damage a block removes, by weight. */
  blockReduction: Record<Weight, number>;
  blockstun: Record<Weight, Reaction>;
  blockPushback: Record<Weight, number>;
  /** Stagger ticks removed per hit already taken in the same combo. */
  comboDecay: number;
  minStagger: number;
  /** Ticks a knocked-down unit must stay down before choosing how to get up. */
  downTicks: number;
  /** A grounded unit that does nothing for this many ticks gets up automatically. */
  autoGetupAfter: number;
  /** Ticks of stagger an attacker suffers when intercepted. */
  parryStagger: number;
}

export interface GameData {
  rules: Rules;
  actions: Record<string, ActionDef>;
  characters: Record<string, CharacterDef>;
}

export type Phase = 'windup' | 'active' | 'recovery' | 'cancel';

export interface ActionInstance {
  uid: number;
  id: string;
  /** Ticks of this action already processed. */
  t: number;
  windup: number;
  active: number;
  recovery: number;
  /** Ticks of cancelling left. Above 0 means the action is being cancelled. */
  cancelLeft: number;
  hasHit: boolean;
  movedSoFar: number;
}

export interface ReactionState {
  kind: 'stagger' | 'blockstun' | 'down' | 'deflected';
  left: number;
  /** Applied this tick (not counted down until the next tick). */
  fresh: boolean;
}

export type UnitKind = 'fighter' | 'summon' | 'object';

export interface UnitState {
  /** "A" and "B" are the leaders; summons are named after their owner ("A.lion1"); objects "obj3". */
  id: string;
  team: 0 | 1;
  kind: UnitKind;
  /** Character id. For objects, the id of the action that released it. */
  char: string;
  name: string;
  /** The team's main fighter. The match ends when a leader is knocked out. */
  leader: boolean;
  /** Who summoned or threw it. */
  owner?: string;
  /** The action that created it. */
  spawnedBy?: string;
  x: number;
  hp: number;
  maxHp: number;
  ap: number;
  posture: Posture;
  actions: ActionInstance[];
  reaction: ReactionState | null;
  /** Hits taken in the current combo. */
  combo: number;
  /** Ticks spent grounded with nothing to do. */
  idleDown: number;
  /** Tick on which the unit leaves play. */
  expiresAt?: number;
  /** Objects: direction of travel. */
  dir?: 1 | -1;
  /** Objects: tick it was released (it starts moving the tick after). */
  bornAt?: number;
}

export interface MatchState {
  tick: number;
  units: UnitState[];
  nextUid: number;
  nextSpawn: number;
  over: boolean;
  winner: 0 | 1 | 'draw' | null;
  endReason: 'ko' | 'timeout' | null;
}

export type Command = { type: 'start'; action: string } | { type: 'cancel'; uid: number };
/** Everything one unit commits for one tick. Empty = do nothing. */
export type Commit = Command[];
/** Commits for one tick, by unit id. Units without an entry do nothing. */
export type Commits = Record<string, Commit>;

export type EventType =
  | 'start' | 'cancel' | 'illegal'
  | 'hit' | 'blocked' | 'clash' | 'parried' | 'whiff' | 'trade' | 'grabbed'
  | 'knockdown' | 'getup' | 'summoned' | 'released' | 'impact' | 'defeated' | 'expired'
  | 'ko' | 'timeout';

export interface SimEvent {
  tick: number;
  /** The unit the event is about: the attacker for hits, the actor otherwise. */
  unit: string;
  team: 0 | 1;
  type: EventType;
  action?: string;
  /** The unit on the receiving end, for hits. */
  target?: string;
  damage?: number;
  zone?: Zone;
  detail?: string;
}

export interface StepResult {
  state: MatchState;
  events: SimEvent[];
}
