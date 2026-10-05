// One test per decided rule. If a rule changes in the design doc, change its test.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMatch, durations, step, unitById, whyNot } from '../src/sim/engine.ts';
import { cloneData } from '../src/sim/data.ts';
import { threatsAgainst } from '../src/sim/query.ts';
import type { Commit, Commits, GameData, MatchState, SimEvent, UnitState } from '../src/sim/types.ts';

const data = cloneData();
const go = (...ids: string[]): Commit => ids.map((action) => ({ type: 'start', action }));
const U = (s: MatchState, id: string): UnitState => {
  const u = unitById(s, id);
  if (!u) throw new Error(`no unit ${id}`);
  return u;
};

function setup(dist = 80, a = 'fighter', b = 'fighter', d: GameData = data): MatchState {
  const s = createMatch(a, b, d);
  U(s, 'A').x = 500 - dist / 2;
  U(s, 'B').x = 500 + dist / 2;
  for (const u of s.units) u.ap = 6;
  return s;
}

/** Play ticks; each entry maps unit ids to their commits. */
function play(s: MatchState, ticks: Commits[], d: GameData = data) {
  const events: SimEvent[] = [];
  for (const commits of ticks) {
    const res = step(s, commits, d);
    s = res.state;
    events.push(...res.events);
  }
  return { s, events };
}
const idle = (n: number): Commits[] => Array.from({ length: n }, () => ({}));
const has = (events: SimEvent[], type: SimEvent['type'], action?: string) =>
  events.some((e) => e.type === type && (action === undefined || e.action === action));

// ---------------------------------------------------------------- strikes and defence

test('a jab lands on a standing opponent', () => {
  const { s, events } = play(setup(), [{ A: go('jab') }, {}]);
  assert.ok(has(events, 'hit', 'jab'));
  assert.equal(U(s, 'B').hp, 95); // 4 damage x 1.25 for the head
});

test('ducking makes a head strike miss', () => {
  const { s, events } = play(setup(), [{ A: go('jab'), B: go('crouch') }, {}]);
  assert.ok(has(events, 'whiff', 'jab'));
  assert.equal(U(s, 'B').hp, 100);
});

test('strikes to different zones on the same tick trade', () => {
  // Hook (wind-up 2) starts a tick before the jab (wind-up 1), so both are active on tick 3.
  const { s, events } = play(setup(), [{ B: go('hook') }, { A: go('jab') }, {}]);
  assert.ok(has(events, 'trade'));
  assert.ok(U(s, 'A').hp < 100 && U(s, 'B').hp < 100);
});

test('arm strikes to the same zone on the same tick clash and neither lands', () => {
  const { s, events } = play(setup(), [{ A: go('jab'), B: go('jab') }, {}]);
  assert.ok(has(events, 'clash'));
  assert.equal(U(s, 'A').hp, 100);
  assert.equal(U(s, 'B').hp, 100);
});

test('blocking reduces damage but does not cancel it', () => {
  const { s, events } = play(setup(), [{ A: go('cross'), B: go('block') }, {}, {}]);
  assert.ok(has(events, 'blocked', 'cross'));
  assert.equal(U(s, 'B').hp, 97); // 9 damage, 70% blocked
  assert.equal(U(s, 'B').reaction?.kind, 'blockstun');
});

test('a heavy hit on a block pushes the blocker onto the back foot', () => {
  const { s } = play(setup(120), [{ A: go('roundhouse') }, {}, { B: go('block') }, {}, {}]);
  assert.equal(U(s, 'B').posture, 'backfoot');
});

test('a low kick goes under a standing block', () => {
  const { s, events } = play(setup(), [{ A: go('lowkick'), B: go('block') }, {}, {}]);
  assert.ok(has(events, 'hit', 'lowkick'));
  assert.ok(U(s, 'B').hp < 100);
});

test('ducking and blocking together (two channels) stops a low kick', () => {
  const { events } = play(setup(), [{ A: go('lowkick'), B: go('crouch', 'block') }, {}, {}]);
  assert.ok(has(events, 'blocked', 'lowkick'));
});

test('a grab beats a block', () => {
  const { s, events } = play(setup(60), [{ B: go('block') }, { A: go('grab') }]);
  assert.ok(has(events, 'grabbed', 'grab'));
  assert.equal(U(s, 'B').posture, 'grounded');
});

test('a strike landing on the same tick beats a grab', () => {
  const { s, events } = play(setup(60), [{ B: go('jab') }, { A: go('grab') }]);
  assert.ok(events.some((e) => e.type === 'whiff' && e.action === 'grab' && e.detail === 'beaten by a strike'));
  assert.ok(has(events, 'hit', 'jab'));
  assert.equal(U(s, 'B').posture, 'standing');
});

test('jumping beats a grab', () => {
  const { s, events } = play(setup(60), [{ B: go('jump') }, { A: go('grab') }]);
  assert.ok(has(events, 'whiff', 'grab'));
  assert.equal(U(s, 'B').hp, 100);
});

test('an intercept deflects a punch and staggers the attacker', () => {
  const { s, events } = play(setup(), [{ A: go('jab'), B: go('parry') }, {}]);
  assert.ok(has(events, 'parried', 'jab'));
  assert.equal(U(s, 'B').hp, 100);
  assert.equal(U(s, 'A').reaction?.kind, 'deflected');
});

test('a missed intercept leaves the arm in recovery', () => {
  const { s } = play(setup(), [{ B: go('parry') }, {}]);
  assert.match(whyNot(s, 'B', 'jab', data) ?? '', /lead is busy/);
});

// ---------------------------------------------------------------- posture, points, channels

test('jumping is impossible from the back foot until footing is recovered', () => {
  let s = setup();
  U(s, 'B').posture = 'backfoot';
  assert.match(whyNot(s, 'B', 'jump', data) ?? '', /backfoot/);
  ({ s } = play(s, [{ B: go('recover') }, {}, {}]));
  assert.equal(U(s, 'B').posture, 'standing');
  assert.equal(whyNot(s, 'B', 'jump', data), null);
});

test('a knocked-down fighter is untouchable and must get up first', () => {
  let { s } = play(setup(), [{ A: go('sweep') }, {}, {}, {}]);
  assert.equal(U(s, 'B').posture, 'grounded');
  ({ s } = play(s, idle(2)));
  assert.match(whyNot(s, 'B', 'jab', data) ?? '', /grounded/);
  assert.equal(whyNot(s, 'B', 'getup_quick', data), null);
  const hpBefore = U(s, 'B').hp;
  ({ s } = play(s, [{ A: go('jab'), B: go('getup_quick') }, {}, {}]));
  assert.equal(U(s, 'B').hp, hpBefore);
  assert.equal(U(s, 'B').posture, 'standing');
});

test('action points limit what can start, and unspent points carry over up to the cap', () => {
  let s = setup();
  U(s, 'A').ap = 0;
  assert.match(whyNot(s, 'A', 'roundhouse', data) ?? '', /needs 5 AP/); // 0 + 2 income
  ({ s } = play(s, idle(1)));
  assert.equal(U(s, 'A').ap, 2);
  ({ s } = play(s, idle(3)));
  assert.equal(U(s, 'A').ap, 6); // capped
  assert.equal(whyNot(s, 'A', 'roundhouse', data), null);
});

test('two actions can share a tick only on separate channels', () => {
  const { events } = play(setup(), [{ A: go('block', 'grab') }]);
  assert.ok(has(events, 'start', 'block'));
  assert.ok(events.some((e) => e.type === 'illegal' && e.action === 'grab'));
});

test('a speedster takes fewer ticks for the same action', () => {
  const cross = data.actions.cross;
  const normal = durations(cross, data.characters.fighter);
  const fast = durations(cross, data.characters.speedster);
  assert.ok(fast.windup + fast.recovery < normal.windup + normal.recovery);
});

test('a fighter with a wall behind them cannot step back', () => {
  const s = setup();
  U(s, 'A').x = data.rules.bodyWidth / 2;
  U(s, 'B').x = U(s, 'A').x + 80;
  assert.equal(whyNot(s, 'A', 'step_back', data), 'wall behind');
});

test('a wind-up can be cancelled at its cancel cost; a jab cannot be cancelled', () => {
  let { s } = play(setup(), [{ A: go('cross') }]);
  const uid = U(s, 'A').actions[0].uid;
  ({ s } = play(s, [{ A: [{ type: 'cancel', uid }] }]));
  assert.equal(U(s, 'A').actions.length, 0); // cancel cost 1: done after one tick
  ({ s } = play(s, [{ A: go('jab') }]));
  const jab = U(s, 'A').actions[0];
  const res = step(s, { A: [{ type: 'cancel', uid: jab.uid }] }, data);
  assert.ok(res.events.some((e) => e.type === 'illegal'));
});

test('the same inputs always give the same result', () => {
  const s = setup();
  const seq: Commits[] = [{ A: go('jab'), B: go('block') }, { A: go('step_fwd') }, { A: go('cross'), B: go('crouch') }, { B: go('sweep') }];
  assert.deepEqual(play(s, seq), play(s, seq));
});

// ---------------------------------------------------------------- summons

function withLion() {
  let { s, events } = play(setup(300, 'beastmaster', 'fighter'), [{ A: go('summon_lion') }, {}, {}, {}]);
  const lion = s.units.find((u) => u.kind === 'summon');
  return { s, events, lion: lion! };
}

test('calling the lion adds a unit on your team with its own action points', () => {
  const { s, events, lion } = withLion();
  assert.ok(has(events, 'summoned', 'summon_lion'));
  assert.ok(lion, 'lion should be on the board');
  assert.equal(lion.team, 0);
  assert.equal(lion.owner, 'A');
  assert.equal(lion.ap, data.characters.lion.apStart);
  assert.notEqual(lion.ap, U(s, 'A').ap);
});

test('the fighter and the lion each commit, and act on the same tick', () => {
  const { s, lion } = withLion();
  const { events } = play(s, [{ A: go('step_fwd'), [lion.id]: go('dash') }]);
  assert.ok(events.some((e) => e.type === 'start' && e.unit === 'A' && e.action === 'step_fwd'));
  assert.ok(events.some((e) => e.type === 'start' && e.unit === lion.id && e.action === 'dash'));
});

test('only one lion at a time, and summons cannot summon', () => {
  const { s: called, lion } = withLion();
  const { s } = play(called, idle(3)); // let the call's recovery finish
  assert.equal(whyNot(s, 'A', 'summon_lion', data), 'already out');
  assert.notEqual(whyNot(s, lion.id, 'summon_lion', data), null);
});

test('head-height strikes pass over the low lion', () => {
  const { s, lion } = withLion();
  U(s, lion.id).x = U(s, 'B').x - 80;
  const { events } = play(s, [{ B: go('jab') }, {}]);
  assert.ok(has(events, 'whiff', 'jab'));
});

test('a defeated lion leaves the board without ending the match', () => {
  const { s, lion } = withLion();
  U(s, lion.id).x = U(s, 'B').x - 80;
  U(s, lion.id).hp = 1;
  const { s: after, events } = play(s, [{ B: go('hook') }, {}, {}]);
  assert.ok(has(events, 'defeated'));
  assert.equal(after.units.find((u) => u.id === lion.id), undefined);
  assert.equal(after.over, false);
});

test("knocking out a team's leader ends the match", () => {
  const s = setup();
  U(s, 'B').hp = 1;
  const { s: after } = play(s, [{ A: go('jab') }, {}]);
  assert.equal(after.over, true);
  assert.equal(after.winner, 0);
});

test('a clone is a copy with less health that cannot split again and leaves when its time is up', () => {
  const d = cloneData();
  d.actions.split.summon!.lifetime = 3;
  let { s } = play(setup(300, 'twin', 'fighter', d), [{ A: go('split') }, {}, {}, {}], d);
  const clone = s.units.find((u) => u.kind === 'summon')!;
  assert.equal(clone.char, 'twin');
  assert.equal(clone.hp, 35);
  assert.notEqual(whyNot(s, clone.id, 'split', d), null);
  const res = play(s, idle(3), d);
  assert.ok(has(res.events, 'expired'));
  assert.equal(res.s.units.find((u) => u.id === clone.id), undefined);
});

// ---------------------------------------------------------------- objects

test('a thrown boulder flies on its own and lands when its ticker says', () => {
  let { s } = play(setup(300, 'strongman', 'fighter'), [{ A: go('throw_boulder') }]);
  const threat = threatsAgainst(s, 'B', data).find((t) => t.kind === 'projectile');
  assert.ok(threat, 'the throw should show as a threat during its wind-up');
  const landsOn = s.tick + threat.ticksUntilActive + 1;
  let hitTick = -1;
  for (let i = 0; i < 12 && hitTick < 0; i++) {
    const res = step(s, {}, data);
    s = res.state;
    if (res.events.some((e) => e.type === 'hit' && e.action === 'throw_boulder')) hitTick = s.tick;
  }
  assert.equal(hitTick, landsOn);
  assert.equal(U(s, 'B').posture, 'grounded');
});

test('ducking lets a head-height boulder pass', () => {
  const { s, events } = play(setup(300, 'strongman', 'fighter'), [{ A: go('throw_boulder') }, {}, {}, { B: go('crouch') }, ...idle(10)]);
  assert.ok(!has(events, 'hit', 'throw_boulder'));
  assert.equal(U(s, 'B').hp, 100);
});

test("objects don't care who threw them: a boulder hits an ally in its path", () => {
  const s = setup(300, 'strongman', 'fighter');
  const A = U(s, 'A');
  s.units.push({ ...structuredClone(A), id: 'A.ally', kind: 'summon', leader: false, owner: 'A', char: 'fighter', name: 'Ally', x: A.x + 150, hp: 50, maxHp: 50 });
  const { events } = play(s, [{ A: go('throw_boulder') }, ...idle(8)]);
  assert.ok(events.some((e) => e.type === 'hit' && e.action === 'throw_boulder' && e.target === 'A.ally'));
});

test('a bullet is mostly stopped by a block', () => {
  const { s, events } = play(setup(300, 'gunslinger', 'fighter'), [{ A: go('shoot'), B: go('block') }, {}, {}, {}]);
  assert.ok(has(events, 'blocked', 'shoot'));
  assert.equal(U(s, 'B').hp, 99); // 6 damage, 90% blocked
});
