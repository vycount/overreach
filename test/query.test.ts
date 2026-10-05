// The forecasts the viewer shows on hover must match what the engine actually does.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMatch, step, unitById } from '../src/sim/engine.ts';
import { cloneData } from '../src/sim/data.ts';
import { forecastAction, forecastObject } from '../src/sim/query.ts';
import type { Commit, Commits, MatchState, SimEvent, UnitState } from '../src/sim/types.ts';

const data = cloneData();
const go = (...ids: string[]): Commit => ids.map((action) => ({ type: 'start', action }));
const U = (s: MatchState, id: string): UnitState => {
  const u = unitById(s, id);
  if (!u) throw new Error(`no unit ${id}`);
  return u;
};

function setup(dist = 80, a = 'fighter', b = 'fighter'): MatchState {
  const s = createMatch(a, b, data);
  U(s, 'A').x = 500 - dist / 2;
  U(s, 'B').x = 500 + dist / 2;
  for (const u of s.units) u.ap = 6;
  return s;
}

function play(s: MatchState, ticks: Commits[]) {
  const events: SimEvent[] = [];
  for (const commits of ticks) {
    const res = step(s, commits, data);
    s = res.state;
    events.push(...res.events);
  }
  return { s, events };
}

/** Forecast for the unit's first running action with this id. */
function forecastOf(s: MatchState, unitId: string, action: string) {
  const inst = U(s, unitId).actions.find((i) => i.id === action);
  assert.ok(inst, `${unitId} should be running ${action}`);
  const f = forecastAction(s, unitId, inst.uid, data);
  assert.ok(f, `${action} should have a forecast`);
  return f;
}

test('a strike forecast gives the damage the engine deals, clean and blocked', () => {
  const clean = play(setup(), [{ A: go('cross') }]).s;
  const f = forecastOf(clean, 'A', 'cross');
  assert.equal(f.target, 'B');
  assert.equal(f.inReach, true);
  assert.equal(f.ticksUntilActive, 1);
  assert.equal(f.playOut?.result, 'hit');
  const hit = play(clean, [{}, {}]).events.find((e) => e.type === 'hit');
  assert.equal(hit?.damage, f.damage);
  assert.equal(f.playOut?.damage, f.damage);
  assert.equal(f.playOut?.tick, hit?.tick);

  const guarded = play(setup(), [{ A: go('cross'), B: go('block') }]).s;
  const g = forecastOf(guarded, 'A', 'cross');
  assert.equal(g.playOut?.result, 'blocked');
  const blocked = play(guarded, [{}, {}]).events.find((e) => e.type === 'blocked');
  assert.equal(blocked?.damage, g.blockedDamage);
});

test('a forecast uses the attacker\'s power', () => {
  const s = play(setup(80, 'brute', 'fighter'), [{ A: go('hook') }]).s;
  const f = forecastOf(s, 'A', 'hook');
  assert.equal(f.damage, Math.round(8 * 1.25));
  const hit = play(s, [{}, {}, {}]).events.find((e) => e.type === 'hit');
  assert.equal(hit?.damage, f.damage);
});

test('a forecast shows a head strike missing a ducking target', () => {
  const s = play(setup(), [{ A: go('cross'), B: go('crouch') }]).s;
  const f = forecastOf(s, 'A', 'cross');
  assert.equal(f.playOut?.result, 'missed');
});

test('a grab forecast is unblockable', () => {
  const s = createMatch('fighter', 'fighter', data);
  U(s, 'A').x = 470; U(s, 'B').x = 530;
  // Grabs land the tick they are committed, so forecast one by hand-starting it.
  U(s, 'A').actions.push({ uid: 99, id: 'grab', t: 0, windup: 0, active: 1, recovery: 4, cancelLeft: 0, hasHit: false, movedSoFar: 0 });
  U(s, 'B').actions.push({ uid: 98, id: 'block', t: 1, windup: 1, active: 3, recovery: 1, cancelLeft: 0, hasHit: false, movedSoFar: 0 });
  const f = forecastAction(s, 'A', 99, data);
  assert.equal(f?.blockable, false);
  assert.equal(f?.playOut?.result, 'grabbed');
  assert.equal(f?.playOut?.damage, f?.damage);
});

test('a throw forecast follows the boulder it releases, and the boulder has its own forecast', () => {
  let s = play(setup(300, 'strongman', 'fighter'), [{ A: go('throw_boulder') }]).s;
  const f = forecastOf(s, 'A', 'throw_boulder');
  assert.equal(f.kind, 'projectile');
  assert.equal(f.target, 'B');
  assert.equal(f.playOut?.result, 'hit');
  assert.equal(f.playOut?.target, 'B');
  // Let it go, then point at the boulder in flight.
  s = play(s, Array.from({ length: (f.ticksUntilActive ?? 0) + 1 }, () => ({}))).s;
  const obj = s.units.find((u) => u.kind === 'object');
  assert.ok(obj, 'the boulder should be in flight');
  const o = forecastObject(s, obj.id, data);
  assert.equal(o?.target, 'B');
  assert.equal(o?.playOut?.result, 'hit');
  const res = play(s, [{}, {}, {}, {}, {}, {}]);
  const hit = res.events.find((e) => e.type === 'hit' && e.unit === obj.id);
  assert.equal(hit?.damage, o?.damage);
  assert.equal(hit?.tick, s.tick + (o?.ticksUntilActive ?? 0) + 1);
});

test('a forecast notices when the attacker gets hit first', () => {
  // A's roundhouse needs 4 ticks of wind-up; B's jab lands first and wipes it.
  const s = play(setup(), [{ A: go('roundhouse'), B: go('jab') }]).s;
  const f = forecastOf(s, 'A', 'roundhouse');
  assert.equal(f.playOut?.result, 'interrupted');
});

test('an object forecast looks past a body that would let it pass', () => {
  const s = setup(300, 'strongman', 'fighter');
  const A = U(s, 'A');
  // A ducking ally between the thrower and B: a head-height boulder flies over it.
  s.units.push({ ...structuredClone(A), id: 'A.ally', kind: 'summon', leader: false, owner: 'A', char: 'fighter', name: 'Ally', x: A.x + 150, posture: 'crouching' });
  const after = play(s, [{ A: go('throw_boulder') }]).s;
  const f = forecastOf(after, 'A', 'throw_boulder');
  assert.equal(f.target, 'B');
  assert.equal(f.playOut?.target, 'B');
});
