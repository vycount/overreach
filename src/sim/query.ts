// Read-only views of the board. Everything here is public information that every
// player can see, which is what the AI and the viewer's inspect panel use.

import { charOf, dodges, facingOf, isBody, phaseOf, step, ticksUntilActive, unitById } from './engine.ts';
import type { ActionDef, ActionInstance, GameData, Impact, MatchState, Reaction, UnitState, Weight, Zone } from './types.ts';

export interface Threat {
  /** Unit that is attacking (or the object in flight). */
  source: string;
  sourceName: string;
  action: string;
  name: string;
  kind: 'strike' | 'grab' | 'projectile';
  zone: Zone;
  weight: Weight;
  /** 0 = lands on the next tick. */
  ticksUntilActive: number;
  /** Will it reach this unit, given the attacker's remaining movement? */
  inReach: boolean;
  /** Damage if it lands clean. */
  damage: number;
  /** Damage if blocked. */
  blockedDamage: number;
  onHit: Reaction;
  /** Plain-language answers to it. */
  answers: string[];
}

/** Everything currently heading for this unit: strikes, grabs, thrown objects and throws being wound up. */
export function threatsAgainst(s: MatchState, unitId: string, data: GameData): Threat[] {
  const me = unitById(s, unitId);
  if (!me || !isBody(me)) return [];
  const out: Threat[] = [];
  const bodies = s.units.filter(isBody);
  const firstAhead = (x: number, dir: number, skip?: string) => firstBodyAhead(s, x, dir, skip);
  const push = (src: UnitState, action: string, name: string, kind: Threat['kind'], impact: Impact, until: number, inReach: boolean, power: number) => {
    const f = forecastImpact(impact, power, kind, data);
    out.push({
      source: src.id, sourceName: src.name, action, name, kind,
      zone: impact.zone, weight: impact.weight, ticksUntilActive: until, inReach,
      damage: f.damage,
      blockedDamage: f.blockedDamage,
      onHit: impact.onHit,
      answers: answersFor(kind, impact.zone, impact.weight),
    });
  };

  for (const e of bodies) {
    if (e.team === me.team) continue;
    const dir = facingOf(s, e);
    const ch = charOf(e, data);
    for (const inst of e.actions) {
      const def = data.actions[inst.id];
      const until = ticksUntilActive(inst);
      if (until === null) continue;
      // Strikes and grabs aimed at me (I must be the nearest of my side in front of them).
      if ((def.kind === 'strike' || def.kind === 'grab') && def.hit && !inst.hasHit) {
        const mine = bodies.filter((v) => v.team === me.team && (v.x - e.x) * dir >= 0).sort((a, b) => Math.abs(a.x - e.x) - Math.abs(b.x - e.x))[0];
        if (!mine || mine.id !== me.id) continue;
        const inReach = withinReach(distanceAtHit(e, inst, def, me, data), def.hit.reach);
        push(e, def.id, def.name, def.kind, def.hit, until, inReach, ch.power);
      }
      // A throw still being wound up: when will its object reach me?
      if (def.projectile && inst.t <= inst.windup && phaseOf(inst) !== 'cancel') {
        const p = def.projectile;
        const releaseX = e.x + dir * p.offset;
        const first = firstAhead(releaseX - dir * p.radius, dir, e.id);
        if (!first || first.id !== me.id) continue;
        push(e, def.id, `${p.name} (${def.name})`, 'projectile', p.impact, until + flightTicks(releaseX, me, p.speed, p.radius, data), true, 1);
      }
    }
  }
  // Objects already flying: anything heading my way, whoever threw it.
  for (const o of s.units) {
    if (o.kind !== 'object') continue;
    const p = data.actions[o.char].projectile!;
    const dir = o.dir ?? 1;
    const first = firstAhead(o.x - dir * p.radius, dir, o.owner);
    if (!first || first.id !== me.id) continue;
    // It moves every coming tick, so it lands on the tick its travel covers the gap.
    push(o, o.char, p.name, 'projectile', p.impact, flightTicks(o.x, me, p.speed, p.radius, data) - 1, true, 1);
  }
  return out.sort((a, b) => a.ticksUntilActive - b.ticksUntilActive);
}

export function answersFor(kind: Threat['kind'], zone: Zone, weight: Weight): string[] {
  if (kind === 'grab') return ['strike first', 'jump'];
  const out: string[] = [];
  if (zone === 'head') out.push('duck', 'block');
  if (zone === 'body') out.push('block');
  if (zone === 'legs') out.push('jump', 'duck and block');
  if (kind === 'strike' && weight !== 'heavy' && zone !== 'legs') out.push('intercept');
  if (kind === 'strike') out.push('step back');
  if (kind === 'projectile' && weight === 'heavy') out.push('get out of its path');
  return out;
}

/** Ticks before this unit can start something new on its arms (rough "free in"). */
export function ticksUntilFree(s: MatchState, unitId: string, data: GameData): number {
  const u = unitById(s, unitId);
  if (!u) return 0;
  if (u.reaction) return u.reaction.left;
  let worst = 0;
  for (const inst of u.actions) {
    const kind = data.actions[inst.id].kind;
    if (kind === 'move' || kind === 'posture') continue;
    if (phaseOf(inst) === 'recovery') worst = Math.max(worst, inst.windup + inst.active + inst.recovery - inst.t);
  }
  return worst;
}

// ---------------------------------------------------------------- forecasts
// What the viewer shows when you point at a limb that is mid-action, or at an object in flight.

/** The numbers behind an impact, before anyone knows how the target will answer it. */
export interface DamageForecast {
  zone: Zone;
  weight: Weight;
  /** Damage if it lands clean. */
  damage: number;
  /** Damage that gets through a block. */
  blockedDamage: number;
  /** False for grabs, which go through a block. */
  blockable: boolean;
  /** An intercept would deflect it. */
  interceptable: boolean;
  onHit: Reaction;
  onBlock: Reaction;
  /** Stagger ticks on a clean hit, before combo decay. Null when it knocks down or throws instead. */
  hitStagger: number | null;
}

/** Same arithmetic as the engine's contact step. Objects hit with power 1. */
export function forecastImpact(impact: Impact, power: number, kind: Threat['kind'], data: GameData): DamageForecast {
  const r = data.rules;
  const base = impact.damage * power;
  const grab = kind === 'grab';
  return {
    zone: impact.zone,
    weight: impact.weight,
    damage: Math.round(grab ? base : base * r.zoneDamage[impact.zone]),
    blockedDamage: Math.round(base * (1 - r.blockReduction[impact.weight])),
    blockable: !grab,
    interceptable: kind === 'strike' && impact.weight !== 'heavy' && impact.zone !== 'legs',
    onHit: impact.onHit,
    onBlock: impact.onBlock ?? r.blockstun[impact.weight],
    hitStagger: impact.onHit.kind === 'stagger' || impact.onHit.kind === 'backfoot' ? impact.onHit.ticks + r.zoneStagger[impact.zone] : null,
  };
}

/** How one action or object turns out if nobody commits anything new. */
export interface PlayOut {
  result: 'hit' | 'blocked' | 'grabbed' | 'intercepted' | 'clash' | 'missed' | 'interrupted' | 'gone';
  /** Tick it happens on. */
  tick: number;
  target?: string;
  damage?: number;
  /** The engine's own note, e.g. why it missed or what it clashed with. */
  detail?: string;
}

export interface ActionForecast extends DamageForecast {
  /** Unit (or object) it comes from. */
  source: string;
  action: string;
  name: string;
  kind: Threat['kind'];
  /** 0 = active (or released) on the next tick. Null once it's past that. */
  ticksUntilActive: number | null;
  /** Melee: centre-to-centre distance at which it connects. */
  reach?: [number, number];
  /** Who is in its path now: the nearest enemy in front for melee; for objects, the first body of either side that wouldn't let it pass. */
  target?: string;
  /** Distance to that target now. */
  distance?: number;
  /** Melee: will it reach that target, given the attacker's own remaining movement? */
  inReach?: boolean;
  /** How it turns out if nobody commits anything new. Null once it has landed or missed. */
  playOut: PlayOut | null;
}

/** Forecast for one of a unit's running actions (by uid). Null for actions that don't hit anyone. */
export function forecastAction(s: MatchState, unitId: string, uid: number, data: GameData): ActionForecast | null {
  const u = unitById(s, unitId);
  const inst = u?.actions.find((i) => i.uid === uid);
  if (!u || !inst) return null;
  const def = data.actions[inst.id];
  const until = ticksUntilActive(inst);
  const dir = facingOf(s, u);
  if (def.hit && (def.kind === 'strike' || def.kind === 'grab')) {
    const target = s.units
      .filter((v) => isBody(v) && v.team !== u.team && (v.x - u.x) * dir >= 0)
      .sort((a, b) => Math.abs(a.x - u.x) - Math.abs(b.x - u.x))[0];
    const live = until !== null && !inst.hasHit;
    return {
      ...forecastImpact(def.hit, charOf(u, data).power, def.kind, data),
      source: u.id, action: def.id, name: def.name, kind: def.kind,
      ticksUntilActive: live ? until : null,
      reach: def.hit.reach,
      target: target?.id,
      distance: target ? Math.abs(target.x - u.x) : undefined,
      inReach: target ? withinReach(distanceAtHit(u, inst, def, target, data), def.hit.reach) : undefined,
      playOut: live ? playOut(s, u.id, inst.uid, def.id, data) : null,
    };
  }
  if (def.projectile) {
    const p = def.projectile;
    // Already let go of (the object has its own forecast), or being cancelled.
    const done = inst.t > inst.windup || inst.cancelLeft > 0;
    const releaseX = u.x + dir * p.offset;
    const target = done ? undefined : firstBodyAhead(s, releaseX - dir * p.radius, dir, u.id, p.impact.zone, data);
    return {
      ...forecastImpact(p.impact, 1, 'projectile', data),
      source: u.id, action: def.id, name: `${p.name} (${def.name})`, kind: 'projectile',
      ticksUntilActive: done ? null : until,
      target: target?.id,
      distance: target ? Math.abs(target.x - u.x) : undefined,
      playOut: done ? null : playOut(s, u.id, inst.uid, def.id, data),
    };
  }
  return null;
}

/** Forecast for an object in flight. */
export function forecastObject(s: MatchState, objectId: string, data: GameData): ActionForecast | null {
  const o = unitById(s, objectId);
  if (!o || o.kind !== 'object') return null;
  const p = data.actions[o.char].projectile!;
  const dir = o.dir ?? 1;
  const target = firstBodyAhead(s, o.x - dir * p.radius, dir, o.owner, p.impact.zone, data);
  return {
    ...forecastImpact(p.impact, 1, 'projectile', data),
    source: o.id, action: o.char, name: p.name, kind: 'projectile',
    ticksUntilActive: target ? flightTicks(o.x, target, p.speed, p.radius, data) - 1 : null,
    target: target?.id,
    distance: target ? Math.abs(target.x - o.x) : undefined,
    playOut: playOut(s, o.id, null, o.char, data),
  };
}

/**
 * Runs the real engine forward with nobody committing anything, and reports what
 * happens to one action (or, for a throw, to the object it releases).
 */
function playOut(s: MatchState, source: string, uid: number | null, action: string, data: GameData): PlayOut {
  let state = s;
  let follow = source;
  let followUid = uid;
  for (let i = 0; i < 64 && !state.over; i++) {
    const { state: next, events } = step(state, {}, data);
    for (const e of events) {
      if (e.unit !== follow || e.action !== action) continue;
      const out = { tick: e.tick, target: e.target, damage: e.damage, detail: e.detail };
      switch (e.type) {
        case 'released': follow = e.target!; followUid = null; break;
        case 'hit': return { result: 'hit', ...out };
        case 'blocked': return { result: 'blocked', ...out };
        case 'grabbed': return { result: 'grabbed', ...out };
        case 'parried': return { result: 'intercepted', ...out };
        case 'clash': return { result: 'clash', ...out };
        case 'whiff': return { result: 'missed', ...out };
        case 'impact': return { result: 'missed', ...out, detail: 'hit the wall' };
      }
    }
    const u = unitById(next, follow);
    if (!u) return { result: 'gone', tick: next.tick };
    if (followUid !== null && !u.actions.some((x) => x.uid === followUid)) return { result: 'interrupted', tick: next.tick };
    state = next;
  }
  return { result: 'gone', tick: state.tick };
}

// ---------------------------------------------------------------- helpers

/**
 * First body (other than `skip`) ahead of x in direction dir. With `zone` and `data`,
 * bodies that would let something at that height pass (ducking, low, down) are skipped,
 * as the engine does for objects.
 */
function firstBodyAhead(s: MatchState, x: number, dir: number, skip?: string, zone?: Zone, data?: GameData): UnitState | undefined {
  return s.units
    .filter((v) => isBody(v) && v.id !== skip && (v.x - x) * dir > 0 && !(zone && data && dodges(v, zone, data)))
    .sort((a, b) => (a.x - x) * dir - (b.x - x) * dir)[0];
}

/** Distance between attacker and target on the attack's first active tick, given the attacker's remaining movement. */
function distanceAtHit(u: UnitState, inst: ActionInstance, def: ActionDef, target: UnitState, data: GameData): number {
  const total = Math.round((def.move ?? 0) * charOf(u, data).moveMul);
  const span = inst.windup + inst.active;
  const hitIdx = Math.max(inst.t, inst.windup);
  const movedAtHit = span > 0 ? Math.round((total * (Math.min(hitIdx, span - 1) + 1)) / span) : 0;
  return Math.max(data.rules.bodyWidth, Math.abs(target.x - u.x) - (movedAtHit - inst.movedSoFar));
}

/** A little slack, since the target may shuffle. */
function withinReach(distance: number, reach: [number, number]): boolean {
  return distance >= reach[0] - 5 && distance <= reach[1] + 5;
}

/** Ticks an object released at x takes to reach a body, counting the tick it covers the last of the gap. */
function flightTicks(x: number, target: UnitState, speed: number, radius: number, data: GameData): number {
  const gap = Math.max(0, Math.abs(target.x - x) - data.rules.bodyWidth / 2 - radius);
  return Math.max(1, Math.ceil(gap / speed));
}
