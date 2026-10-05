// AI opponents. An AI sees exactly what a human sees: the board and every committed
// action, never the other side's choices for the coming tick. It commands every
// unit on its team (its fighter and any lion or clone) each tick.

import {
  apAvailable, busyChannels, canAct, charOf, connects, durations, legalStarts, nearestEnemy,
  pickTarget, teamUnits, ticksUntilActive, unitById, whyNot,
} from '../sim/engine.ts';
import { threatsAgainst, ticksUntilFree } from '../sim/query.ts';
import type { Commit, Commits, GameData, MatchState, UnitState } from '../sim/types.ts';
import { makeRng, weighted, type Rng } from './rng.ts';

export interface Controller {
  readonly name: string;
  /** Commits for every unit of this team that can act. */
  decide(state: MatchState, team: 0 | 1, data: GameData): Commits;
  /** Commit for one unit (used when a player hands a lion over to the AI). */
  decideUnit(state: MatchState, unitId: string, data: GameData): Commit;
}

export type AiKind = 'reader' | 'random' | 'idle';
export const AI_KINDS: AiKind[] = ['reader', 'random', 'idle'];

export function makeController(kind: AiKind, seed: number): Controller {
  const rng = makeRng(seed);
  const unit = (s: MatchState, id: string, d: GameData): Commit => {
    const u = unitById(s, id);
    if (!u || !canAct(s, u)) return [];
    if (kind === 'idle') return [];
    if (kind === 'random') return randomDecide(s, u, d, rng);
    return readerDecide(s, u, d, rng);
  };
  return {
    name: kind,
    decideUnit: unit,
    decide(s, team, d) {
      const out: Commits = {};
      for (const u of teamUnits(s, team)) {
        const c = unit(s, u.id, d);
        if (c.length) out[u.id] = c;
      }
      return out;
    },
  };
}

/** Builds one unit's commit, adding actions only while they stay legal together. */
class CommitBuilder {
  readonly commit: Commit = [];
  private busy;
  private ap;
  constructor(private s: MatchState, private u: UnitState, private data: GameData) {
    this.busy = busyChannels(u, data);
    this.ap = apAvailable(u, data, s);
  }
  add(id: string | null | undefined): boolean {
    if (!id || id === 'wait') return false;
    if (whyNot(this.s, this.u.id, id, this.data, { busy: this.busy, apLeft: this.ap }) !== null) return false;
    const def = this.data.actions[id];
    this.commit.push({ type: 'start', action: id });
    for (const c of def.channels) this.busy.add(c);
    this.ap -= def.ap;
    return true;
  }
}

// ---------------------------------------------------------------- random

function randomDecide(s: MatchState, u: UnitState, data: GameData, rng: Rng): Commit {
  if (rng() < 0.4) return [];
  const b = new CommitBuilder(s, u, data);
  const legal = legalStarts(s, u.id, data);
  if (!legal.length) return [];
  b.add(legal[Math.floor(rng() * legal.length)]);
  // Sometimes try a second action on the channels left free.
  if (rng() < 0.25) b.add(legal[Math.floor(rng() * legal.length)]);
  return b.commit;
}

// ---------------------------------------------------------------- reader

/** Neutral-game weights for known moves. Strikes only count when they would reach. */
const NEUTRAL: Record<string, number> = {
  jab: 4, cross: 3, hook: 3, lowkick: 3, sweep: 1.5, roundhouse: 1, jumpkick: 0.7, grab: 3,
  bite: 4, claw: 3, pounce: 1.5,
  block: 2, parry: 0.5, crouch: 0.6,
};

/**
 * A rule-based fighter that reads the board: it answers visible threats in time,
 * punishes openings, times strikes for when a fallen opponent stands, uses its
 * specials (summons, throws) from a safe distance, and mixes up the rest of the time.
 * Random weights keep matches varied.
 */
function readerDecide(s: MatchState, me: UnitState, data: GameData, rng: Rng): Commit {
  const opp = nearestEnemy(s, me);
  if (!opp) return [];
  const b = new CommitBuilder(s, me, data);
  const ok = (id: string) => whyNot(s, me.id, id, data) === null;
  const w = (id: string) => durations(data.actions[id], charOf(me, data)).windup;
  const asStanding = opp.posture === 'grounded' ? { ...opp, posture: 'standing' as const } : opp;
  /** Would this attack land on someone right now? (A head-height strike passes over a lion to the fighter behind it.) */
  const reaches = (id: string) => opp.posture === 'grounded' ? connects(me, asStanding, data.actions[id], data) : !!pickTarget(s, me, data.actions[id], data);
  /** Strikes that would land on the enemy leader are worth more: the leader ends the match. */
  const leaderBonus = (id: string) => (pickTarget(s, me, data.actions[id], data)?.leader ? 1.6 : 1);
  const moves = charOf(me, data).moves;
  const strikes = moves.filter((id) => data.actions[id].kind === 'strike' || data.actions[id].kind === 'grab');
  const choose = (opts: [string, number][]) => weighted(rng, opts.filter(([id]) => id === 'wait' || (moves.includes(id) && ok(id))));
  const d = Math.abs(opp.x - me.x);

  // On the ground: pick a way to get up.
  if (me.posture === 'grounded') {
    if (me.actions.length) return [];
    b.add(choose([['getup_quick', 5], ['getup_slow', 2], ['getup_roll', 3]]));
    return b.commit;
  }

  // 1. Answer the soonest threat that will reach.
  const threat = threatsAgainst(s, me.id, data).find((t) => t.inReach);
  if (threat) {
    const time = threat.ticksUntilActive;
    const heavy = threat.weight === 'heavy';
    const melee = threat.kind !== 'projectile';
    const inTime = (id: string) => moves.includes(id) && ok(id) && w(id) <= time;
    const opts: [string, number][] = [];
    // Strike first if something lands strictly earlier.
    if (melee) for (const id of strikes) if (ok(id) && reaches(id) && w(id) < time) opts.push([id, data.actions[id].hit!.damage / 3]);
    if (threat.zone === 'head') {
      if (me.posture === 'standing' && inTime('crouch')) opts.push(['crouch', heavy ? 8 : 4]);
      if (inTime('block')) opts.push(['block', heavy ? 1.5 : 3]);
      if (melee && !heavy && inTime('parry')) opts.push(['parry', 2]);
    } else if (threat.zone === 'body') {
      if (inTime('block')) opts.push(['block', heavy ? 1.5 : 4]);
      if (melee && !heavy && inTime('parry')) opts.push(['parry', 2]);
      if (!melee && inTime('jump')) opts.push(['jump', 1]);
    } else {
      if (inTime('jump')) opts.push(['jump', 3]);
      if (me.posture === 'crouching' && inTime('block')) opts.push(['block', 4]);
    }
    if (melee && inTime('step_back')) opts.push(['step_back', heavy ? 4 : 2]);
    // Trade: hit back on the same tick when my hit is worth more.
    if (melee) {
      for (const id of strikes) {
        const h = data.actions[id].hit;
        if (h && ok(id) && reaches(id) && w(id) === time && h.zone !== threat.zone && h.damage * data.rules.zoneDamage[h.zone] > threat.damage) opts.push([id, 1.5]);
      }
    }
    const pick = weighted(rng, opts);
    if (pick) {
      b.add(pick);
      // Duck under a high attack while guarding the body.
      if (pick === 'crouch' && rng() < 0.3) b.add('block');
      return b.commit;
    }
  }

  // 2. Punish an opponent who is stuck.
  if (opp.posture === 'grounded') {
    const getup = opp.actions.find((i) => data.actions[i.id].sets === 'standing');
    const standsIn = getup ? ticksUntilActive(getup) : null;
    if (standsIn !== null) {
      // Time a strike to land the tick they stand up.
      const meaty = strikes.filter((id) => ok(id) && reaches(id) && w(id) === standsIn);
      const pick = weighted(rng, meaty.map((id) => [id, data.actions[id].hit!.damage] as [string, number]));
      if (pick && rng() < 0.7) { b.add(pick); return b.commit; }
    }
    if (d > 120) b.add(choose([['step_fwd', 3], ['wait', 2]]));
    return b.commit;
  }
  const stuck = ticksUntilFree(s, opp.id, data);
  if (stuck > 0) {
    const fits = strikes.filter((id) => ok(id) && reaches(id) && w(id) <= stuck && data.actions[id].kind !== 'grab');
    if (fits.length) {
      const pick = weighted(rng, fits.map((id) => {
        const h = data.actions[id].hit!;
        return [id, h.damage + (h.onHit.kind === 'knockdown' ? 6 : 0)] as [string, number];
      }));
      if (pick) { b.add(pick); return b.commit; }
    }
    if (d > 110 && ok('dash') && w('dash') + 2 <= stuck) { b.add('dash'); return b.commit; }
  }

  // 3. Posture housekeeping.
  if (me.posture === 'backfoot') {
    b.add(choose([['recover', 5], ['block', 2], ['jab', reaches('jab') ? 1 : 0], ['step_back', 1.5], ['wait', 1]]));
    return b.commit;
  }
  if (me.posture === 'crouching') {
    b.add(choose([['stand', 4], ['hook', reaches('hook') ? 2 : 0], ['sweep', reaches('sweep') ? 2 : 0], ['bite', reaches('bite') ? 2 : 0], ['jab', reaches('jab') ? 1 : 0], ['block', 1], ['wait', 1]]));
    return b.commit;
  }

  // 4. Specials from a safe distance: summon, split, throw, shoot.
  const specials: [string, number][] = [];
  for (const id of moves) {
    const def = data.actions[id];
    if (def.kind === 'summon') specials.push([id, d > 120 ? 4 : 0.5]);
    if (def.kind === 'throw' && def.projectile) specials.push([id, def.projectile.speed >= 150 ? (d > 90 ? 3 : 1) : d > 160 ? 3 : 0.3]);
  }
  if (specials.length && rng() < 0.45) {
    const pick = choose(specials);
    if (pick) { b.add(pick); return b.commit; }
  }

  // 5. Neutral. Save points now and then so heavier moves become possible.
  if (me.ap < 4 && rng() < 0.35) return [];
  if (d > 135) {
    b.add(choose([['step_fwd', 5], ['dash', 3], ['jump_fwd', 0.6], ['wait', 2]]));
    return b.commit;
  }
  const opts: [string, number][] = [];
  for (const id of moves) {
    const def = data.actions[id];
    if (def.kind === 'strike' || def.kind === 'grab') opts.push([id, reaches(id) ? (NEUTRAL[id] ?? 2.5) * leaderBonus(id) : 0]);
    else if (NEUTRAL[id] !== undefined) opts.push([id, NEUTRAL[id]]);
  }
  opts.push(['step_back', d < 60 ? 2.5 : 1], ['step_fwd', d > 100 ? 2 : 0.3], ['wait', 2]);
  const pick = choose(opts);
  if (pick && pick !== 'wait') {
    b.add(pick);
    // Fork: a high jab on top of a low kick.
    if (pick === 'lowkick' && reaches('jab') && rng() < 0.3) b.add('jab');
    if (pick === 'block' && rng() < 0.25) b.add('crouch');
  }
  return b.commit;
}
