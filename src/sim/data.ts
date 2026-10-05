// All tuning lives here. Every number is a placeholder to be tested in simulation.
// One tick is roughly 0.1 s of fight time, so ordinary actions take 2+ ticks and
// a speedster has room to be faster.
//
// To add a move: add an entry to ACTION_LIST, then add its id to a character's moves.
// To add a character: add an entry to CHARACTERS. Summoned units (a lion) are
// characters too, marked summonOnly.

import type { ActionDef, CharacterDef, GameData, Rules } from './types.ts';

export const RULES: Rules = {
  stageWidth: 1000,
  bodyWidth: 40,
  startGap: 220,
  maxTicks: 600,
  secondsPerTick: 0.1,
  zoneDamage: { head: 1.25, body: 1, legs: 0.8 },
  zoneStagger: { head: 1, body: 0, legs: 0 },
  blockReduction: { light: 0.9, medium: 0.7, heavy: 0.4 },
  blockstun: {
    light: { kind: 'stagger', ticks: 1 },
    medium: { kind: 'stagger', ticks: 2 },
    heavy: { kind: 'backfoot', ticks: 2 },
  },
  blockPushback: { light: 5, medium: 15, heavy: 40 },
  comboDecay: 1,
  minStagger: 1,
  downTicks: 2,
  autoGetupAfter: 10,
  parryStagger: 3,
};

const UPRIGHT = ['standing', 'crouching', 'backfoot'] as const;

const ACTION_LIST: ActionDef[] = [
  // ---- Strikes ----
  {
    id: 'jab', name: 'Jab', kind: 'strike', channels: ['lead'], ap: 2,
    description: 'Fast, light punch to the head with the lead hand. Hard to react to; ducking makes it miss.',
    from: [...UPRIGHT], windup: 1, active: 1, recovery: 2,
    hit: { zone: 'head', reach: [30, 100], damage: 4, weight: 'light', knockback: 10, onHit: { kind: 'stagger', ticks: 2 } },
  },
  {
    id: 'cross', name: 'Cross', kind: 'strike', channels: ['rear'], ap: 3,
    description: 'Straight rear-hand punch to the head. Slower than a jab but hits harder and reaches further.',
    from: ['standing', 'backfoot'], windup: 2, active: 1, recovery: 3, cancelCost: 1,
    hit: { zone: 'head', reach: [30, 115], damage: 9, weight: 'medium', knockback: 25, onHit: { kind: 'stagger', ticks: 3 } },
  },
  {
    id: 'hook', name: 'Body hook', kind: 'strike', channels: ['rear'], ap: 3,
    description: 'Short hook to the body. Can be thrown from a crouch and staggers longer than head shots.',
    from: ['standing', 'crouching'], windup: 2, active: 1, recovery: 3, cancelCost: 1,
    hit: { zone: 'body', reach: [25, 90], damage: 8, weight: 'medium', knockback: 15, onHit: { kind: 'stagger', ticks: 4 } },
  },
  {
    id: 'lowkick', name: 'Low kick', kind: 'strike', channels: ['legs'], ap: 3,
    description: 'Kick to the legs. Goes under a standing guard; a jump or a crouching guard stops it.',
    from: ['standing'], windup: 2, active: 1, recovery: 3, cancelCost: 1,
    hit: { zone: 'legs', reach: [40, 125], damage: 7, weight: 'medium', knockback: 10, onHit: { kind: 'stagger', ticks: 3 } },
  },
  {
    id: 'sweep', name: 'Sweep', kind: 'strike', channels: ['legs'], ap: 4,
    description: 'Low spinning sweep that knocks the target down. Slow to start, easy to jump.',
    from: ['standing', 'crouching'], windup: 3, active: 1, recovery: 4, cancelCost: 2,
    hit: { zone: 'legs', reach: [40, 135], damage: 8, weight: 'medium', knockback: 20, onHit: { kind: 'knockdown' } },
  },
  {
    id: 'roundhouse', name: 'Roundhouse', kind: 'strike', channels: ['legs'], ap: 5,
    description: 'Heavy kick to the head with long reach. Knocks down on hit and puts a blocker on the back foot. Very slow.',
    from: ['standing'], windup: 4, active: 1, recovery: 5, cancelCost: 2,
    hit: { zone: 'head', reach: [60, 160], damage: 18, weight: 'heavy', knockback: 70, onHit: { kind: 'knockdown' }, onBlock: { kind: 'backfoot', ticks: 2 } },
  },
  {
    id: 'jumpkick', name: 'Jump kick', kind: 'strike', channels: ['legs'], ap: 4,
    description: 'Leaping kick that covers ground. Airborne while active, so low attacks and grabs miss it. Ducking makes it sail over.',
    from: ['standing'], windup: 2, active: 2, recovery: 2, cancelCost: 2, airborne: true, move: 120,
    hit: { zone: 'head', reach: [30, 130], damage: 12, weight: 'heavy', knockback: 50, onHit: { kind: 'knockdown' }, onBlock: { kind: 'backfoot', ticks: 2 } },
  },
  {
    id: 'grab', name: 'Grab', kind: 'grab', channels: ['lead', 'rear'], ap: 3,
    description: 'Grab and throw. Lands the tick you commit it, goes through a block, and throws the target down. Loses to any strike landing the same tick and to a jump.',
    from: ['standing'], windup: 0, active: 1, recovery: 4,
    hit: { zone: 'body', reach: [20, 75], damage: 10, weight: 'heavy', knockback: 0, onHit: { kind: 'thrown', distance: 120 } },
  },
  // ---- Specials ----
  {
    id: 'summon_lion', name: 'Call the lion', kind: 'summon', channels: ['lead', 'rear'], ap: 4,
    description: 'Calls your lion. It arrives in front of you and acts from the next tick, with its own action points. You command it each tick alongside yourself. Keeping it out costs you 1 action point per tick.',
    from: ['standing'], windup: 3, active: 1, recovery: 2, cancelCost: 1,
    summon: { char: 'lion', offset: 50, max: 1, upkeep: 1 },
  },
  {
    id: 'split', name: 'Split', kind: 'summon', channels: ['lead', 'rear', 'legs'], ap: 5,
    description: 'Splits off a copy of yourself with less health. It has your moves and its own action points, and lasts 12 seconds of fight time. Keeping it out costs you 1 action point per tick.',
    from: ['standing'], windup: 3, active: 1, recovery: 2, cancelCost: 1,
    summon: { char: 'self', hp: 35, offset: 45, max: 1, lifetime: 120, upkeep: 1 },
  },
  {
    id: 'throw_boulder', name: 'Throw boulder', kind: 'throw', channels: ['lead', 'rear', 'legs'], ap: 5,
    description: 'Rips up a boulder and hurls it at head height. It flies on its own once released and hits the first body in its path, friend or foe. Ducking lets it pass.',
    from: ['standing'], windup: 3, active: 1, recovery: 3, cancelCost: 2,
    projectile: {
      id: 'boulder', name: 'Boulder', speed: 50, radius: 22, offset: 40, lifetime: 30,
      impact: { zone: 'head', damage: 16, weight: 'heavy', knockback: 60, onHit: { kind: 'knockdown' }, onBlock: { kind: 'backfoot', ticks: 2 } },
    },
  },
  {
    id: 'shoot', name: 'Shoot', kind: 'throw', channels: ['rear'], ap: 3,
    description: 'Fires a bullet at body height with the rear hand. Crosses most of the stage in a tick; a block takes most of it.',
    from: [...UPRIGHT], windup: 1, active: 1, recovery: 3,
    projectile: {
      id: 'bullet', name: 'Bullet', speed: 240, radius: 4, offset: 30, lifetime: 6,
      impact: { zone: 'body', damage: 6, weight: 'light', knockback: 5, onHit: { kind: 'stagger', ticks: 3 } },
    },
  },
  // ---- Lion ----
  {
    id: 'bite', name: 'Bite', kind: 'strike', channels: ['lead'], ap: 2,
    description: 'Lunging bite to the body.',
    from: ['standing', 'crouching'], windup: 1, active: 1, recovery: 2,
    hit: { zone: 'body', reach: [30, 90], damage: 7, weight: 'medium', knockback: 10, onHit: { kind: 'stagger', ticks: 3 } },
  },
  {
    id: 'claw', name: 'Claw', kind: 'strike', channels: ['rear'], ap: 2,
    description: 'Quick swipe at the legs. Goes under a standing guard.',
    from: ['standing', 'crouching'], windup: 1, active: 1, recovery: 1,
    hit: { zone: 'legs', reach: [30, 100], damage: 5, weight: 'light', knockback: 5, onHit: { kind: 'stagger', ticks: 2 } },
  },
  {
    id: 'pounce', name: 'Pounce', kind: 'strike', channels: ['lead', 'rear', 'legs'], ap: 4,
    description: 'Leaps forward and bowls the target over. Airborne while active.',
    from: ['standing'], windup: 2, active: 2, recovery: 3, cancelCost: 1, airborne: true, move: 110,
    hit: { zone: 'body', reach: [20, 110], damage: 9, weight: 'heavy', knockback: 40, onHit: { kind: 'knockdown' } },
  },
  // ---- Defence ----
  {
    id: 'block', name: 'Block', kind: 'block', channels: ['lead', 'rear'], ap: 1,
    description: 'Guard with both arms for 3 ticks. Standing it covers head and body; while ducking it covers body and legs. Heavy hits still hurt and push you back.',
    from: [...UPRIGHT], windup: 1, active: 3, recovery: 1,
  },
  {
    id: 'parry', name: 'Intercept', kind: 'parry', channels: ['lead'], ap: 2,
    description: 'Knock an incoming punch or kick aside with the lead hand. Deflects light and medium strikes to the head or body and staggers the attacker. A miss leaves the arm recovering.',
    from: ['standing', 'backfoot'], windup: 1, active: 1, recovery: 4,
  },
  // ---- Posture ----
  { id: 'crouch', name: 'Duck', kind: 'posture', channels: ['legs'], ap: 1, from: ['standing'], windup: 1, active: 1, recovery: 0, sets: 'crouching',
    description: 'Drop into a crouch. Head-height strikes and objects pass over you. Stay down until you rise.' },
  { id: 'stand', name: 'Rise', kind: 'posture', channels: ['legs'], ap: 0, from: ['crouching'], windup: 1, active: 1, recovery: 0, sets: 'standing',
    description: 'Stand back up from a crouch.' },
  { id: 'recover', name: 'Recover footing', kind: 'posture', channels: ['legs'], ap: 1, from: ['backfoot'], windup: 2, active: 1, recovery: 0, sets: 'standing',
    description: 'Get off the back foot and stand square again. Needed before jumping.' },
  { id: 'getup_quick', name: 'Quick get-up', kind: 'posture', channels: ['legs'], ap: 0, from: ['grounded'], windup: 2, active: 1, recovery: 0, sets: 'standing',
    description: 'Spring back up as fast as possible. You cannot be hit until you are standing.' },
  { id: 'getup_slow', name: 'Slow get-up', kind: 'posture', channels: ['legs'], ap: 0, from: ['grounded'], windup: 4, active: 1, recovery: 0, sets: 'standing',
    description: 'Take your time getting up, so an attack timed for a quick get-up misses.' },
  { id: 'getup_roll', name: 'Roll back', kind: 'posture', channels: ['legs'], ap: 1, from: ['grounded'], windup: 3, active: 1, recovery: 0, sets: 'standing', move: -110,
    description: 'Roll away from the attacker before standing up.' },
  // ---- Movement ----
  { id: 'step_fwd', name: 'Step in', kind: 'move', channels: ['legs'], ap: 1, from: ['standing'], windup: 0, active: 2, recovery: 0, move: 50,
    description: 'Short step toward the opponent.' },
  { id: 'step_back', name: 'Step back', kind: 'move', channels: ['legs'], ap: 1, from: ['standing', 'backfoot'], windup: 0, active: 2, recovery: 0, move: -50, needsRoomBehind: 20,
    description: 'Short step away. Not possible with a wall right behind you.' },
  { id: 'dash', name: 'Dash in', kind: 'move', channels: ['legs'], ap: 2, from: ['standing'], windup: 1, active: 2, recovery: 1, move: 140,
    description: 'Burst of speed toward the opponent.' },
  { id: 'jump', name: 'Jump', kind: 'move', channels: ['legs'], ap: 2, from: ['standing'], windup: 1, active: 3, recovery: 1, airborne: true,
    description: 'Jump in place. Low attacks and grabs miss while you are in the air; a hit in the air knocks you down.' },
  { id: 'jump_fwd', name: 'Jump forward', kind: 'move', channels: ['legs'], ap: 2, from: ['standing'], windup: 1, active: 3, recovery: 1, airborne: true, move: 100,
    description: 'Jump toward the opponent.' },
];

export const ACTIONS: Record<string, ActionDef> = Object.fromEntries(ACTION_LIST.map((a) => [a.id, a]));

const CORE = [
  'jab', 'cross', 'hook', 'lowkick', 'sweep', 'roundhouse', 'jumpkick', 'grab',
  'block', 'parry', 'crouch', 'stand', 'recover', 'getup_quick', 'getup_slow', 'getup_roll',
  'step_fwd', 'step_back', 'dash', 'jump', 'jump_fwd',
];
const LION = ['bite', 'claw', 'pounce', 'crouch', 'stand', 'recover', 'getup_quick', 'getup_roll', 'step_fwd', 'step_back', 'dash', 'jump', 'jump_fwd'];

const base = { shape: 'humanoid' as const, apIncome: 2, apCap: 6, apStart: 4, tempo: 1, power: 1, moveMul: 1 };

export const CHARACTERS: Record<string, CharacterDef> = {
  fighter: { ...base, id: 'fighter', name: 'Fighter', description: 'The baseline: every core move, nothing extra.', maxHp: 100, moves: CORE },
  speedster: {
    ...base, id: 'speedster', name: 'Speedster', description: 'Every action takes fewer ticks, with an extra action point per tick. Less health and power.',
    maxHp: 85, apIncome: 3, apCap: 7, apStart: 5, tempo: 0.75, power: 0.8, moveMul: 1.3, moves: CORE,
  },
  brute: {
    ...base, id: 'brute', name: 'Brute', description: 'Slow and tough. Hits harder, takes more to put down.',
    maxHp: 120, apCap: 7, tempo: 1.25, power: 1.25, moveMul: 0.85, moves: CORE,
  },
  beastmaster: {
    ...base, id: 'beastmaster', name: 'Beast master', description: 'Calls a lion that fights alongside them. You command both every tick.',
    maxHp: 90, moves: [...CORE, 'summon_lion'],
  },
  twin: {
    ...base, id: 'twin', name: 'Twin', description: 'Splits into two for a while. You command both every tick.',
    maxHp: 90, moves: [...CORE, 'split'],
  },
  strongman: {
    ...base, id: 'strongman', name: 'Strongman', description: 'Throws boulders that fly on their own and hit whoever is in the way.',
    maxHp: 115, apCap: 7, tempo: 1.1, power: 1.15, moveMul: 0.9, moves: [...CORE, 'throw_boulder'],
  },
  gunslinger: {
    ...base, id: 'gunslinger', name: 'Gunslinger', description: 'Fights at range with a pistol in the rear hand.',
    maxHp: 90, moves: [...CORE, 'shoot'],
  },
  lion: {
    ...base, id: 'lion', name: 'Lion', description: 'Summoned by the beast master. Low to the ground, so head-height attacks pass over it.',
    summonOnly: true, shape: 'beast', low: true,
    maxHp: 45, apCap: 5, apStart: 3, tempo: 0.75, moveMul: 1.6, moves: LION,
  },
};

export const DEFAULT_DATA: GameData = { rules: RULES, actions: ACTIONS, characters: CHARACTERS };

/** Deep copy so overrides never touch the defaults. */
export function cloneData(data: GameData = DEFAULT_DATA): GameData {
  return JSON.parse(JSON.stringify(data)) as GameData;
}

/** Characters a player can pick (not summon-only ones). */
export function playableCharacters(data: GameData): string[] {
  return Object.keys(data.characters).filter((id) => !data.characters[id].summonOnly);
}

/**
 * Set a value by dotted path, e.g. "actions.jab.hit.damage=6" or "rules.maxTicks=300".
 * The value is parsed as JSON when possible (numbers, booleans, arrays), else kept as text.
 * Setting a field that doesn't exist yet (e.g. a summon's lifetime) adds it and returns "added".
 */
export function applyOverride(data: GameData, assignment: string): 'changed' | 'added' {
  const eq = assignment.indexOf('=');
  if (eq < 0) throw new Error(`Override "${assignment}" needs the form path=value`);
  const path = assignment.slice(0, eq).split('.');
  const raw = assignment.slice(eq + 1);
  let value: unknown;
  try { value = JSON.parse(raw); } catch { value = raw; }
  let node: Record<string, unknown> = data as unknown as Record<string, unknown>;
  for (let i = 0; i < path.length - 1; i++) {
    const next = node[path[i]];
    if (next === undefined || next === null || typeof next !== 'object') {
      throw new Error(`Override path "${path.slice(0, i + 1).join('.')}" does not exist`);
    }
    node = next as Record<string, unknown>;
  }
  const last = path[path.length - 1];
  const existed = last in node;
  node[last] = value;
  return existed ? 'changed' : 'added';
}
