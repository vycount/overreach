// Read-only views of the board. Everything here is public information that every
// player can see, which is what the AI and the viewer's inspect panel use.

import { charOf, facingOf, isBody, phaseOf, ticksUntilActive, unitById } from './engine.ts';
import type { GameData, Impact, MatchState, Reaction, UnitState, Weight, Zone } from './types.ts';

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
  const r = data.rules;
  const out: Threat[] = [];
  const bodies = s.units.filter(isBody);
  /** First body (other than `skip`) ahead of x in direction dir. */
  const firstAhead = (x: number, dir: number, skip?: string) =>
    bodies
      .filter((v) => v.id !== skip && (v.x - x) * dir > 0)
      .sort((a, b) => (a.x - x) * dir - (b.x - x) * dir)[0];
  const push = (src: UnitState, action: string, name: string, kind: Threat['kind'], impact: Impact, until: number, inReach: boolean, power: number) =>
    out.push({
      source: src.id, sourceName: src.name, action, name, kind,
      zone: impact.zone, weight: impact.weight, ticksUntilActive: until, inReach,
      damage: Math.round(impact.damage * power * r.zoneDamage[impact.zone]),
      blockedDamage: Math.round(impact.damage * power * (1 - r.blockReduction[impact.weight])),
      onHit: impact.onHit,
      answers: answersFor(kind, impact.zone, impact.weight),
    });

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
        const total = Math.round((def.move ?? 0) * ch.moveMul);
        const span = inst.windup + inst.active;
        const hitIdx = Math.max(inst.t, inst.windup);
        const movedAtHit = span > 0 ? Math.round((total * (Math.min(hitIdx, span - 1) + 1)) / span) : 0;
        const projected = Math.max(r.bodyWidth, Math.abs(me.x - e.x) - (movedAtHit - inst.movedSoFar));
        const inReach = projected >= def.hit.reach[0] - 5 && projected <= def.hit.reach[1] + 5;
        push(e, def.id, def.name, def.kind, def.hit, until, inReach, ch.power);
      }
      // A throw still being wound up: when will its object reach me?
      if (def.projectile && inst.t <= inst.windup && phaseOf(inst) !== 'cancel') {
        const p = def.projectile;
        const releaseX = e.x + dir * p.offset;
        const first = firstAhead(releaseX - dir * p.radius, dir, e.id);
        if (!first || first.id !== me.id) continue;
        const gap = Math.max(0, Math.abs(me.x - releaseX) - r.bodyWidth / 2 - p.radius);
        const travel = Math.max(1, Math.ceil(gap / p.speed));
        push(e, def.id, `${p.name} (${def.name})`, 'projectile', p.impact, until + travel, true, 1);
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
    const gap = Math.max(0, Math.abs(me.x - o.x) - r.bodyWidth / 2 - p.radius);
    // It moves every coming tick, so it lands on the tick its travel covers the gap.
    const arrive = Math.max(1, Math.ceil(gap / p.speed));
    push(o, o.char, p.name, 'projectile', p.impact, arrive - 1, true, 1);
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
