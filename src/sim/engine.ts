// The tick engine. step() takes the state at the end of one tick plus every unit's
// commit and returns the state at the end of the next tick. It is pure and
// deterministic: the same inputs always give the same output.

import type {
  ActionDef, ActionInstance, Channel, CharacterDef, Commits, GameData, HitSpec, Impact,
  MatchState, Phase, Reaction, SimEvent, StepResult, UnitState, Zone,
} from './types.ts';

// ---------------------------------------------------------------- lookups

export function charOf(u: UnitState, data: GameData): CharacterDef {
  const c = data.characters[u.char];
  if (!c) throw new Error(`Unknown character "${u.char}"`);
  return c;
}

export function unitById(s: MatchState, id: string): UnitState | undefined {
  return s.units.find((u) => u.id === id);
}

/** Fighters and summons: the units that receive commits. */
export function isBody(u: UnitState): boolean {
  return u.kind !== 'object';
}

export function teamUnits(s: MatchState, team: 0 | 1): UnitState[] {
  return s.units.filter((u) => u.team === team && isBody(u));
}

export function leaderOf(s: MatchState, team: 0 | 1): UnitState {
  const l = s.units.find((u) => u.team === team && u.leader);
  if (!l) throw new Error(`Team ${team} has no leader`);
  return l;
}

/** The closest opposing fighter or summon (ties go to the leader). */
export function nearestEnemy(s: MatchState, u: UnitState): UnitState | undefined {
  let best: UnitState | undefined;
  for (const v of s.units) {
    if (v.team === u.team || !isBody(v)) continue;
    const d = Math.abs(v.x - u.x);
    const bd = best ? Math.abs(best.x - u.x) : Infinity;
    if (d < bd || (d === bd && v.leader)) best = v;
  }
  return best;
}

/** Units face their nearest enemy. Objects keep their direction of travel. */
export function facingOf(s: MatchState, u: UnitState): 1 | -1 {
  if (u.kind === 'object') return u.dir ?? 1;
  const e = nearestEnemy(s, u);
  if (!e || e.x === u.x) return u.team === 0 ? 1 : -1;
  return e.x > u.x ? 1 : -1;
}

/** Wind-up and recovery scale with the character's tempo; active ticks don't. */
export function durations(def: ActionDef, ch: CharacterDef) {
  return {
    windup: Math.max(0, Math.round(def.windup * ch.tempo)),
    active: def.active,
    recovery: Math.max(0, Math.round(def.recovery * ch.tempo)),
  };
}

export function createMatch(charA: string, charB: string, data: GameData): MatchState {
  const r = data.rules;
  const mid = r.stageWidth / 2;
  const make = (id: string, team: 0 | 1, char: string, x: number): UnitState => {
    const c = data.characters[char];
    if (!c) throw new Error(`Unknown character "${char}"`);
    return {
      id, team, kind: 'fighter', char, name: c.name, leader: true, x,
      hp: c.maxHp, maxHp: c.maxHp, ap: c.apStart, posture: 'standing',
      actions: [], reaction: null, combo: 0, idleDown: 0,
    };
  };
  return {
    tick: 0,
    units: [make('A', 0, charA, mid - r.startGap / 2), make('B', 1, charB, mid + r.startGap / 2)],
    nextUid: 1,
    nextSpawn: 1,
    over: false,
    winner: null,
    endReason: null,
  };
}

// ---------------------------------------------------------------- action timing

/** Phase of an action on the tick about to be processed (or being processed). */
export function phaseOf(inst: ActionInstance): Phase {
  if (inst.cancelLeft > 0) return 'cancel';
  if (inst.t < inst.windup) return 'windup';
  if (inst.t < inst.windup + inst.active) return 'active';
  return 'recovery';
}

export function totalTicks(inst: ActionInstance): number {
  return inst.windup + inst.active + inst.recovery;
}

/** Ticks until this action is finished (or its cancel is). */
export function ticksLeft(inst: ActionInstance): number {
  return inst.cancelLeft > 0 ? inst.cancelLeft : totalTicks(inst) - inst.t;
}

/** Ticks from now until the action's first active tick: 0 = active on the next tick. Null if past it. */
export function ticksUntilActive(inst: ActionInstance): number | null {
  if (inst.cancelLeft > 0) return null;
  if (inst.t < inst.windup) return inst.windup - inst.t;
  if (inst.t < inst.windup + inst.active) return 0;
  return null;
}

export function busyChannels(u: UnitState, data: GameData): Set<Channel> {
  const busy = new Set<Channel>();
  for (const inst of u.actions) for (const c of data.actions[inst.id].channels) busy.add(c);
  return busy;
}

export function canAct(s: MatchState, u: UnitState): boolean {
  return !s.over && isBody(u) && u.reaction === null;
}

/** Action points this unit loses each tick to the summons it has out. */
export function upkeepOf(s: MatchState, u: UnitState, data: GameData): number {
  let total = 0;
  for (const v of s.units) if (v.owner === u.id && v.kind === 'summon' && v.spawnedBy) total += data.actions[v.spawnedBy]?.summon?.upkeep ?? 0;
  return total;
}

/** Action points a unit will have to spend on the coming tick. */
export function apAvailable(u: UnitState, data: GameData, s?: MatchState): number {
  const c = charOf(u, data);
  return Math.min(c.apCap, u.ap + Math.max(0, c.apIncome - (s ? upkeepOf(s, u, data) : 0)));
}

/**
 * Why a unit can't start an action on the coming tick, or null if it can.
 * Pass busy/apLeft to check a second action in the same commit.
 */
export function whyNot(
  s: MatchState, unitId: string, actionId: string, data: GameData,
  opts: { busy?: Set<Channel>; apLeft?: number } = {},
): string | null {
  const u = unitById(s, unitId);
  if (!u) return 'no such unit';
  if (!isBody(u)) return 'objects take no actions';
  const def = data.actions[actionId];
  if (!def) return 'unknown action';
  if (!charOf(u, data).moves.includes(actionId)) return "not in this character's moves";
  if (s.over) return 'match is over';
  if (u.reaction) return `can't act (${u.reaction.kind})`;
  if (!def.from.includes(u.posture)) return `can't start while ${u.posture}`;
  const busy = opts.busy ?? busyChannels(u, data);
  const taken = def.channels.find((c) => busy.has(c));
  if (taken) return `${taken} is busy`;
  const ap = opts.apLeft ?? apAvailable(u, data, s);
  if (def.ap > ap) return `needs ${def.ap} AP`;
  if (def.summon) {
    if (u.kind === 'summon') return "summons can't summon";
    const out = s.units.filter((v) => v.owner === u.id && v.spawnedBy === def.id).length;
    const coming = u.actions.filter((i) => i.id === def.id).length;
    if (out + coming >= def.summon.max) return 'already out';
  }
  if (def.needsRoomBehind !== undefined) {
    const r = data.rules;
    const behind = facingOf(s, u) === 1 ? u.x - r.bodyWidth / 2 : r.stageWidth - r.bodyWidth / 2 - u.x;
    if (behind < def.needsRoomBehind) return 'wall behind';
  }
  return null;
}

export function legalStarts(s: MatchState, unitId: string, data: GameData): string[] {
  const u = unitById(s, unitId);
  if (!u || !isBody(u)) return [];
  return charOf(u, data).moves.filter((id) => whyNot(s, unitId, id, data) === null);
}

/** Uids of a unit's actions that can be cancelled on the coming tick. */
export function legalCancels(s: MatchState, unitId: string, data: GameData): number[] {
  const u = unitById(s, unitId);
  if (!u || !canAct(s, u)) return [];
  return u.actions
    .filter((i) => i.cancelLeft === 0 && i.t < i.windup && data.actions[i.id].cancelCost !== undefined)
    .map((i) => i.uid);
}

// ---------------------------------------------------------------- the step

interface Outcome {
  /** Unit or object that caused it. */
  attacker: string;
  defender: string;
  inst?: ActionInstance;
  action: string;
  impact: Impact;
  kind: 'hit' | 'blocked' | 'parried' | 'grabbed';
  damage: number;
  /** Where the push comes from. */
  fromX: number;
}

export function step(prev: MatchState, commits: Commits, data: GameData): StepResult {
  const s: MatchState = structuredClone(prev);
  const events: SimEvent[] = [];
  if (s.over) return { state: s, events };
  const r = data.rules;
  s.tick += 1;
  const T = s.tick;
  const emit = (u: UnitState, e: Omit<SimEvent, 'tick' | 'unit' | 'team'>) => events.push({ tick: T, unit: u.id, team: u.team, ...e });
  const byId = (id: string) => s.units.find((u) => u.id === id);

  // 1. Action point income. Unspent points carry over up to the cap.
  //    A summon's upkeep comes out of its owner's income while it is out.
  for (const u of s.units) {
    if (!isBody(u)) continue;
    const c = charOf(u, data);
    u.ap = Math.min(c.apCap, u.ap + Math.max(0, c.apIncome - upkeepOf(s, u, data)));
  }

  // 2. Commits, every unit checked against the state at the start of the tick.
  for (const u of s.units) {
    if (!isBody(u)) continue;
    const commit = commits[u.id] ?? [];
    if (!canAct(s, u)) {
      for (const cmd of commit) emit(u, { type: 'illegal', action: cmd.type === 'start' ? cmd.action : 'cancel', detail: `can't act (${u.reaction?.kind})` });
      continue;
    }
    for (const cmd of commit) {
      if (cmd.type !== 'cancel') continue;
      const inst = u.actions.find((i) => i.uid === cmd.uid);
      const cost = inst ? data.actions[inst.id].cancelCost : undefined;
      if (!inst || cost === undefined || inst.cancelLeft > 0 || inst.t >= inst.windup) {
        emit(u, { type: 'illegal', action: inst?.id ?? 'cancel', detail: 'not cancellable now' });
        continue;
      }
      if (cost <= 0) u.actions = u.actions.filter((i) => i !== inst);
      else inst.cancelLeft = cost;
      emit(u, { type: 'cancel', action: inst.id });
    }
    const busy = busyChannels(u, data);
    for (const cmd of commit) {
      if (cmd.type !== 'start') continue;
      const reason = whyNot(s, u.id, cmd.action, data, { busy, apLeft: u.ap });
      if (reason) {
        emit(u, { type: 'illegal', action: cmd.action, detail: reason });
        continue;
      }
      startAction(s, u, cmd.action, data);
      for (const c of data.actions[cmd.action].channels) busy.add(c);
      emit(u, { type: 'start', action: cmd.action });
    }
    // A unit left on the ground too long gets up on its own.
    if (u.posture === 'grounded' && u.actions.length === 0) {
      u.idleDown += 1;
      if (u.idleDown >= r.autoGetupAfter && data.actions.getup_quick && charOf(u, data).moves.includes('getup_quick')) {
        startAction(s, u, 'getup_quick', data, true);
        emit(u, { type: 'start', action: 'getup_quick', detail: 'automatic' });
      }
    } else {
      u.idleDown = 0;
    }
  }

  // 3. Movement, posture changes, and actions that create units.
  const startX = new Map(s.units.map((u) => [u.id, u.x]));
  const spawns: { from: UnitState; def: ActionDef; dir: 1 | -1 }[] = [];
  for (const u of s.units) {
    if (!isBody(u)) continue;
    const dir = facingOf(s, u);
    const ch = charOf(u, data);
    for (const inst of u.actions) {
      if (inst.cancelLeft > 0) continue;
      const def = data.actions[inst.id];
      const idx = inst.t;
      const span = inst.windup + inst.active;
      if (def.move && idx < span) {
        const total = Math.round(def.move * ch.moveMul);
        const target = Math.round((total * (idx + 1)) / span);
        u.x += (target - inst.movedSoFar) * dir;
        inst.movedSoFar = target;
      }
      if (idx === inst.windup && inst.active > 0) {
        if (def.sets) {
          if (u.posture === 'grounded' && def.sets !== 'grounded') emit(u, { type: 'getup', action: def.id });
          u.posture = def.sets;
        }
        if (def.airborne) u.posture = 'airborne';
        if (def.summon || def.projectile) spawns.push({ from: u, def, dir });
      }
      if (def.airborne && idx >= span && u.posture === 'airborne') u.posture = 'standing';
    }
  }
  separate(s, data, startX);
  for (const { from, def, dir } of spawns) spawn(s, from, def, dir, data, emit);
  separate(s, data, startX);

  // 4. Objects in flight move and hit the first body in their path, friend or foe.
  const outcomes: Outcome[] = [];
  const removed = new Set<string>();
  for (const o of s.units) {
    if (o.kind !== 'object' || (o.bornAt ?? 0) >= T) continue;
    const proj = data.actions[o.char].projectile!;
    const dir = o.dir ?? 1;
    const from = o.x;
    const to = o.x + dir * proj.speed;
    // Swept from just behind the object's leading edge to where it ends this tick.
    const back = from - dir * proj.radius;
    const reachEnd = to + dir * proj.radius;
    const inPath = s.units
      .filter((v) => isBody(v) && v.id !== o.owner && (v.x - back) * dir > 0 && (v.x - (dir * r.bodyWidth) / 2 - reachEnd) * dir <= 0)
      .sort((a, b) => (a.x - from) * dir - (b.x - from) * dir);
    const target = inPath.find((v) => !dodges(v, proj.impact.zone, data));
    if (target) {
      outcomes.push(defend(o.id, target, proj.impact, from, o.char, undefined, s, data));
      removed.add(o.id);
      continue;
    }
    o.x = to;
    if (o.x < 0 || o.x > r.stageWidth) {
      emit(o, { type: 'impact', action: o.char, detail: 'hit the wall' });
      removed.add(o.id);
    }
  }

  // 5. Melee contact. Everything is decided from the same snapshot, then applied together.
  type Attack = { unit: UnitState; inst: ActionInstance; def: ActionDef; target: UnitState };
  const attacks: Attack[] = [];
  for (const u of s.units) {
    if (!isBody(u)) continue;
    for (const inst of u.actions) {
      if (phaseOf(inst) !== 'active' || inst.hasHit) continue;
      const def = data.actions[inst.id];
      if ((def.kind !== 'strike' && def.kind !== 'grab') || !def.hit) continue;
      const target = pickTarget(s, u, def, data);
      if (target) attacks.push({ unit: u, inst, def, target });
    }
  }
  // Two arm strikes aimed at each other's same zone meet and cancel out.
  for (const a of attacks) {
    if (a.inst.hasHit || !isArmStrike(a.def)) continue;
    const b = attacks.find((x) => !x.inst.hasHit && x.unit.id === a.target.id && x.target.id === a.unit.id && isArmStrike(x.def) && x.def.hit!.zone === a.def.hit!.zone);
    if (b) {
      a.inst.hasHit = b.inst.hasHit = true;
      emit(a.unit, { type: 'clash', action: a.def.id, detail: `met ${b.def.id}` });
      emit(b.unit, { type: 'clash', action: b.def.id, detail: `met ${a.def.id}` });
    }
  }
  // Grabs: two grabs on each other break; a grab loses to any strike landing on the grabber.
  for (const a of attacks) {
    if (a.inst.hasHit || a.def.kind !== 'grab') continue;
    const mutual = attacks.find((x) => !x.inst.hasHit && x.def.kind === 'grab' && x.unit.id === a.target.id && x.target.id === a.unit.id);
    if (mutual) {
      a.inst.hasHit = mutual.inst.hasHit = true;
      emit(a.unit, { type: 'clash', action: 'grab', detail: 'grabs broke each other' });
      emit(mutual.unit, { type: 'clash', action: 'grab', detail: 'grabs broke each other' });
      continue;
    }
    if (attacks.some((x) => !x.inst.hasHit && x.def.kind === 'strike' && x.target.id === a.unit.id)) {
      a.inst.hasHit = true;
      emit(a.unit, { type: 'whiff', action: a.def.id, detail: 'beaten by a strike' });
    }
  }
  for (const a of attacks) {
    if (a.inst.hasHit) continue;
    outcomes.push(defend(a.unit.id, a.target, a.def.hit!, a.unit.x, a.def.id, a.inst, s, data, a.def.kind === 'grab', charOf(a.unit, data).power));
  }

  // Apply every outcome. Reactions on the same unit merge: the strongest wins.
  const reactingBefore = new Map(s.units.map((u) => [u.id, u.reaction !== null && !u.reaction.fresh]));
  const pending = new Map<string, { reaction: Reaction; zone: Zone; wasHit: boolean }[]>();
  const hitPairs: string[] = [];
  for (const o of outcomes) {
    if (o.inst) o.inst.hasHit = true;
    const att = byId(o.attacker)!;
    const def = byId(o.defender)!;
    if (o.kind === 'parried') {
      def.actions = def.actions.filter((i) => data.actions[i.id].kind !== 'parry');
      att.actions = [];
      att.reaction = { kind: 'deflected', left: r.parryStagger, fresh: true };
      emit(att, { type: 'parried', action: o.action, target: def.id, zone: o.impact.zone });
      continue;
    }
    def.hp = Math.max(0, def.hp - o.damage);
    const list = pending.get(def.id) ?? [];
    if (o.kind === 'blocked') {
      emit(att, { type: 'blocked', action: o.action, target: def.id, damage: o.damage, zone: o.impact.zone });
      list.push({ reaction: o.impact.onBlock ?? r.blockstun[o.impact.weight], zone: o.impact.zone, wasHit: false });
      push(s, data, o.fromX, att, def, r.blockPushback[o.impact.weight]);
    } else {
      emit(att, { type: o.kind === 'grabbed' ? 'grabbed' : 'hit', action: o.action, target: def.id, damage: o.damage, zone: o.impact.zone });
      list.push({ reaction: o.impact.onHit, zone: o.impact.zone, wasHit: true });
      push(s, data, o.fromX, att, def, o.impact.onHit.kind === 'thrown' ? o.impact.onHit.distance : o.impact.knockback);
      hitPairs.push(`${o.attacker}>${o.defender}`);
    }
    pending.set(def.id, list);
  }
  for (const pair of hitPairs) {
    const [a, b] = pair.split('>');
    if (a < b && hitPairs.includes(`${b}>${a}`)) emit(byId(a)!, { type: 'trade', target: b, detail: 'both hit on the same tick' });
  }
  for (const [id, list] of pending) {
    const u = byId(id)!;
    applyReactions(u, list, reactingBefore.get(id) ?? false, data, (e) => emit(u, e));
  }

  // 6. Advance action timers.
  for (const u of s.units) {
    if (!isBody(u)) continue;
    const keep: ActionInstance[] = [];
    for (const inst of u.actions) {
      const def = data.actions[inst.id];
      if (inst.cancelLeft > 0) {
        inst.cancelLeft -= 1;
        if (inst.cancelLeft > 0) keep.push(inst);
        continue;
      }
      if ((def.kind === 'strike' || def.kind === 'grab') && inst.t === inst.windup + inst.active - 1 && !inst.hasHit) {
        emit(u, { type: 'whiff', action: def.id });
      }
      inst.t += 1;
      if (inst.t < totalTicks(inst)) keep.push(inst);
      else if (def.airborne && u.posture === 'airborne') u.posture = 'standing';
    }
    u.actions = keep;
  }

  // 7. Count down reactions applied before this tick.
  for (const u of s.units) {
    if (!u.reaction) continue;
    if (u.reaction.fresh) { u.reaction.fresh = false; continue; }
    u.reaction.left -= 1;
    if (u.reaction.left <= 0) { u.reaction = null; u.combo = 0; }
  }

  // 8. Units leave play: defeated summons, expired summons and objects.
  for (const u of s.units) {
    if (u.leader) continue;
    if (u.kind === 'summon' && u.hp <= 0) { emit(u, { type: 'defeated' }); removed.add(u.id); }
    else if (u.expiresAt !== undefined && T >= u.expiresAt && !removed.has(u.id)) {
      if (u.kind === 'summon') emit(u, { type: 'expired' });
      removed.add(u.id);
    }
  }
  if (removed.size) s.units = s.units.filter((u) => !removed.has(u.id));

  // 9. A knocked-out leader ends the match; otherwise the timer does.
  const a = leaderOf(s, 0), b = leaderOf(s, 1);
  if (a.hp <= 0 || b.hp <= 0) {
    s.over = true;
    s.endReason = 'ko';
    s.winner = a.hp <= 0 && b.hp <= 0 ? 'draw' : a.hp <= 0 ? 1 : 0;
    emit(s.winner === 1 ? b : a, { type: 'ko' });
  } else if (T >= r.maxTicks) {
    s.over = true;
    s.endReason = 'timeout';
    const pa = a.hp / a.maxHp, pb = b.hp / b.maxHp;
    s.winner = pa === pb ? 'draw' : pa > pb ? 0 : 1;
    emit(s.winner === 1 ? b : a, { type: 'timeout' });
  }
  return { state: s, events };
}

// ---------------------------------------------------------------- pieces of the step

function startAction(s: MatchState, u: UnitState, id: string, data: GameData, free = false) {
  const def = data.actions[id];
  u.actions.push({ uid: s.nextUid++, id, t: 0, ...durations(def, charOf(u, data)), cancelLeft: 0, hasHit: false, movedSoFar: 0 });
  if (!free) u.ap -= def.ap;
}

function spawn(
  s: MatchState, from: UnitState, def: ActionDef, dir: 1 | -1, data: GameData,
  emit: (u: UnitState, e: Omit<SimEvent, 'tick' | 'unit' | 'team'>) => void,
) {
  const r = data.rules;
  const clamp = (x: number) => Math.min(r.stageWidth - r.bodyWidth / 2, Math.max(r.bodyWidth / 2, x));
  const n = s.nextSpawn++;
  if (def.summon) {
    const spec = def.summon;
    const char = spec.char === 'self' ? from.char : spec.char;
    const ch = data.characters[char];
    if (!ch) throw new Error(`Summon of unknown character "${char}"`);
    const hp = spec.hp ?? ch.maxHp;
    const unit: UnitState = {
      id: `${from.id}.${spec.char === 'self' ? 'clone' : char}${n}`,
      team: from.team, kind: 'summon', char, name: spec.char === 'self' ? `${ch.name} clone` : ch.name,
      leader: false, owner: from.id, spawnedBy: def.id, x: clamp(from.x + dir * spec.offset),
      hp, maxHp: hp, ap: ch.apStart, posture: 'standing', actions: [], reaction: null, combo: 0, idleDown: 0,
      expiresAt: spec.lifetime ? s.tick + spec.lifetime : undefined,
    };
    s.units.push(unit);
    emit(from, { type: 'summoned', action: def.id, target: unit.id });
  } else if (def.projectile) {
    const p = def.projectile;
    const obj: UnitState = {
      id: `obj${n}`, team: from.team, kind: 'object', char: def.id, name: p.name, leader: false,
      owner: from.id, spawnedBy: def.id, x: from.x + dir * p.offset, hp: 1, maxHp: 1, ap: 0,
      posture: p.impact.zone === 'legs' ? 'crouching' : 'standing', actions: [], reaction: null, combo: 0, idleDown: 0,
      expiresAt: s.tick + p.lifetime, dir, bornAt: s.tick,
    };
    s.units.push(obj);
    emit(from, { type: 'released', action: def.id, target: obj.id });
  }
}

function isArmStrike(def: ActionDef): boolean {
  return def.kind === 'strike' && !def.channels.includes('legs');
}

/** Does a unit's posture or shape let something aimed at this zone pass? */
export function dodges(target: UnitState, zone: Zone, data: GameData): boolean {
  if (target.posture === 'grounded') return true;
  if (zone === 'head' && (target.posture === 'crouching' || charOf(target, data).low)) return true;
  if (zone === 'legs' && target.posture === 'airborne') return true;
  return false;
}

/** Does this attack reach the target, given distance and the target's posture? */
export function connects(att: UnitState, target: UnitState, def: ActionDef, data: GameData): boolean {
  const spec = def.hit;
  if (!spec) return false;
  const d = Math.abs(att.x - target.x);
  if (d < spec.reach[0] || d > spec.reach[1]) return false;
  if (def.kind === 'grab') return target.posture !== 'grounded' && target.posture !== 'airborne';
  return !dodges(target, spec.zone, data);
}

/** The nearest enemy in front of the attacker that the attack would connect with. */
export function pickTarget(s: MatchState, u: UnitState, def: ActionDef, data: GameData): UnitState | undefined {
  const dir = facingOf(s, u);
  let best: UnitState | undefined;
  for (const v of s.units) {
    if (v.team === u.team || !isBody(v)) continue;
    if ((v.x - u.x) * dir < 0) continue;
    if (!connects(u, v, def, data)) continue;
    if (!best || Math.abs(v.x - u.x) < Math.abs(best.x - u.x)) best = v;
  }
  return best;
}

/** Standing guard covers head and body; a crouching guard covers body and legs. */
export function blockCovers(posture: UnitState['posture'], zone: Zone): boolean {
  if (posture === 'crouching') return zone !== 'head';
  return zone !== 'legs';
}

function activeOf(u: UnitState, kind: ActionDef['kind'], data: GameData): ActionInstance | undefined {
  return u.actions.find((i) => data.actions[i.id].kind === kind && phaseOf(i) === 'active');
}

/** How the target meets an incoming impact: intercepted, blocked, or hit. */
function defend(
  attacker: string, target: UnitState, impact: Impact | HitSpec, fromX: number, action: string,
  inst: ActionInstance | undefined, s: MatchState, data: GameData, isGrab = false, power = 1,
): Outcome {
  const r = data.rules;
  const base = impact.damage * power;
  const out = { attacker, defender: target.id, inst, action, impact, fromX };
  if (isGrab) return { ...out, kind: 'grabbed', damage: Math.round(base) };
  const fromObject = s.units.find((u) => u.id === attacker)?.kind === 'object';
  if (!fromObject && activeOf(target, 'parry', data) && impact.weight !== 'heavy' && impact.zone !== 'legs') {
    return { ...out, kind: 'parried', damage: 0 };
  }
  if (activeOf(target, 'block', data) && blockCovers(target.posture, impact.zone)) {
    return { ...out, kind: 'blocked', damage: Math.round(base * (1 - r.blockReduction[impact.weight])) };
  }
  return { ...out, kind: 'hit', damage: Math.round(base * r.zoneDamage[impact.zone]) };
}

function applyReactions(
  u: UnitState,
  list: { reaction: Reaction; zone: Zone; wasHit: boolean }[],
  wasReacting: boolean,
  data: GameData,
  emit: (e: Omit<SimEvent, 'tick' | 'unit' | 'team'>) => void,
) {
  const r = data.rules;
  const wasHit = list.some((x) => x.wasHit);
  if (wasHit) u.combo = wasReacting ? u.combo + 1 : 0;
  const rank = (x: Reaction) => (x.kind === 'knockdown' || x.kind === 'thrown' ? 3 : x.kind === 'backfoot' ? 2 : 1);
  const top = list.reduce((best, x) => {
    if (rank(x.reaction) !== rank(best.reaction)) return rank(x.reaction) > rank(best.reaction) ? x : best;
    const tx = 'ticks' in x.reaction ? x.reaction.ticks : 0;
    const tb = 'ticks' in best.reaction ? best.reaction.ticks : 0;
    return tx > tb ? x : best;
  });
  const reaction = top.reaction;
  if (wasHit) u.actions = [];
  const airborneHit = wasHit && u.posture === 'airborne';
  if (reaction.kind === 'knockdown' || reaction.kind === 'thrown' || airborneHit) {
    u.actions = [];
    u.posture = 'grounded';
    u.reaction = { kind: 'down', left: r.downTicks, fresh: true };
    u.idleDown = 0;
    emit({ type: 'knockdown', detail: airborneHit && reaction.kind === 'stagger' ? 'hit out of the air' : reaction.kind });
    return;
  }
  const extra = top.wasHit ? r.zoneStagger[top.zone] : 0;
  const ticks = Math.max(r.minStagger, reaction.ticks + extra - r.comboDecay * u.combo);
  if (reaction.kind === 'backfoot' && u.posture !== 'grounded') u.posture = 'backfoot';
  u.reaction = { kind: top.wasHit ? 'stagger' : 'blockstun', left: ticks, fresh: true };
}

/** Push the target away from where the blow came from; at a wall the attacker takes the rest. */
function push(s: MatchState, data: GameData, fromX: number, att: UnitState, target: UnitState, amount: number) {
  if (amount <= 0) return;
  const r = data.rules;
  const dir = target.x >= fromX ? 1 : -1;
  const min = r.bodyWidth / 2, max = r.stageWidth - r.bodyWidth / 2;
  const wanted = target.x + dir * amount;
  const actual = Math.min(max, Math.max(min, wanted));
  target.x = actual;
  const leftover = Math.abs(wanted - actual);
  if (leftover > 0 && isBody(att)) att.x = Math.min(max, Math.max(min, att.x - dir * leftover));
}

/** Keep units inside the stage and stop enemies passing through each other. Allies may overlap. */
function separate(s: MatchState, data: GameData, startX: Map<string, number>) {
  const r = data.rules;
  const bw = r.bodyWidth;
  const min = bw / 2, max = r.stageWidth - bw / 2;
  const bodies = s.units.filter(isBody);
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const u = bodies[i], v = bodies[j];
        if (u.team === v.team) continue;
        const [L, R] = (startX.get(u.id) ?? u.x) <= (startX.get(v.id) ?? v.x) ? [u, v] : [v, u];
        if (R.x - L.x >= bw) continue;
        const mid = (L.x + R.x) / 2;
        if (mid - bw / 2 < min) { L.x = min; R.x = min + bw; }
        else if (mid + bw / 2 > max) { R.x = max; L.x = max - bw; }
        else { L.x = mid - bw / 2; R.x = mid + bw / 2; }
      }
    }
    for (const u of bodies) u.x = Math.min(max, Math.max(min, u.x));
  }
}
