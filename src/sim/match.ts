// Runs one full match between two controllers.

import type { Controller } from '../ai/controllers.ts';
import { canAct, createMatch, step, teamUnits } from './engine.ts';
import type { Commits, GameData, MatchState, SimEvent } from './types.ts';

export interface Frame {
  state: MatchState;
  /** Commits that produced this state, by unit id (empty for the opening frame). */
  commits: Commits;
  events: SimEvent[];
}

export interface MatchResult {
  chars: [string, string];
  winner: 0 | 1 | 'draw';
  endReason: 'ko' | 'timeout';
  ticks: number;
  /** Leaders' health at the end. */
  hp: [number, number];
  events: SimEvent[];
  /** Ticks on which each team had at least one unit free to choose something. */
  freeTicks: [number, number];
  /** Ticks on which anyone was free (what a player would be asked about). */
  decisionTicks: number;
  frames?: Frame[];
}

export function runMatch(opts: {
  chars: [string, string];
  controllers: [Controller, Controller];
  data: GameData;
  record?: boolean;
}): MatchResult {
  const { chars, controllers, data } = opts;
  let state = createMatch(chars[0], chars[1], data);
  const frames: Frame[] | undefined = opts.record ? [{ state, commits: {}, events: [] }] : undefined;
  const events: SimEvent[] = [];
  const freeTicks: [number, number] = [0, 0];
  let decisionTicks = 0;
  const limit = data.rules.maxTicks + 5;
  while (!state.over && state.tick < limit) {
    const commits: Commits = {};
    let anyFree = false;
    for (const team of [0, 1] as const) {
      if (!teamUnits(state, team).some((u) => canAct(state, u))) continue;
      freeTicks[team] += 1;
      anyFree = true;
      Object.assign(commits, controllers[team].decide(state, team, data));
    }
    if (anyFree) decisionTicks += 1;
    const res = step(state, commits, data);
    state = res.state;
    events.push(...res.events);
    frames?.push({ state, commits, events: res.events });
  }
  const leaders = [0, 1].map((t) => state.units.find((u) => u.team === t && u.leader)!);
  return {
    chars,
    winner: state.winner ?? 'draw',
    endReason: state.endReason ?? 'timeout',
    ticks: state.tick,
    hp: [leaders[0].hp, leaders[1].hp],
    events,
    freeTicks,
    decisionTicks,
    frames,
  };
}
