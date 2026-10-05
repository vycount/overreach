import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeController, type AiKind } from '../src/ai/controllers.ts';
import { cloneData, playableCharacters } from '../src/sim/data.ts';
import { runMatch } from '../src/sim/match.ts';

const data = cloneData();
const run = (a: AiKind, b: AiKind, chars: [string, string], seed: number) =>
  runMatch({ chars, controllers: [makeController(a, seed), makeController(b, seed + 1)], data });

test('every pairing of AIs and characters finishes a match', () => {
  const chars = playableCharacters(data);
  for (const a of chars) for (const b of chars) for (const ai of ['reader', 'random'] as AiKind[]) {
    const r = run(ai, ai, [a, b], 11);
    assert.ok(r.ticks <= data.rules.maxTicks, `${a} vs ${b} (${ai}) ran past the timer`);
  }
});

test('the reader AI never sends an illegal commit, for any unit', () => {
  const chars = playableCharacters(data);
  for (let i = 0; i < 40; i++) {
    const r = run('reader', 'reader', [chars[i % chars.length], chars[(i * 3 + 1) % chars.length]], i * 2 + 1);
    const bad = r.events.filter((e) => e.type === 'illegal');
    assert.equal(bad.length, 0, JSON.stringify(bad[0]));
  }
});

test('the reader AI uses summons and throws', () => {
  let summons = 0, throws = 0;
  for (let i = 0; i < 20; i++) {
    summons += run('reader', 'reader', ['beastmaster', 'fighter'], i).events.filter((e) => e.type === 'summoned').length;
    throws += run('reader', 'reader', ['strongman', 'fighter'], i).events.filter((e) => e.type === 'released').length;
  }
  assert.ok(summons > 0 && throws > 0);
});

test('the reader AI beats random play most of the time', () => {
  let wins = 0;
  for (let i = 0; i < 60; i++) if (run('reader', 'random', ['fighter', 'fighter'], i * 2 + 1).winner === 0) wins++;
  assert.ok(wins >= 45, `reader won only ${wins} of 60`);
});

test('matches with the same seed are identical', () => {
  const a = run('reader', 'reader', ['beastmaster', 'strongman'], 99);
  const b = run('reader', 'reader', ['beastmaster', 'strongman'], 99);
  assert.deepEqual(a, b);
});
