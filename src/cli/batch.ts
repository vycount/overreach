// Batch simulator: runs many AI-vs-AI matches and prints what happened.
// Run `npm run sim -- --help` for options.

import { writeFileSync } from 'node:fs';
import { AI_KINDS, makeController, type AiKind } from '../ai/controllers.ts';
import { applyOverride, cloneData, playableCharacters } from '../sim/data.ts';
import { runMatch, type MatchResult } from '../sim/match.ts';
import type { GameData } from '../sim/types.ts';

const HELP = `
Tick Fighter batch simulator

  npm run sim -- [options]

Options
  --n <count>          Matches to run (default 500)
  --a <character>      Character on side A (default fighter)
  --b <character>      Character on side B (default fighter)
  --ai <kind>          AI for both sides: reader, random or idle (default reader)
  --aiA / --aiB <kind> AI for one side
  --seed <number>      Starting seed (default 1). Same seed = same results.
  --set <path=value>   Change any number in the data, e.g. --set actions.jab.hit.damage=6
                       or --set rules.maxTicks=300 or --set characters.speedster.tempo=0.6
                       Repeat --set to change several values.
  --matrix             Every character against every other, win rates only
  --replay <file>      Save the first match as a replay you can open in the viewer
  --json <file>        Save the summary as JSON
  --help               Show this help

Characters: fighter, speedster, brute, beastmaster, twin, strongman, gunslinger
(edit src/sim/data.ts to add more)
`;

interface Args {
  n: number; a: string; b: string; aiA: AiKind; aiB: AiKind; seed: number;
  sets: string[]; matrix: boolean; replay?: string; json?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { n: 500, a: 'fighter', b: 'fighter', aiA: 'reader', aiB: 'reader', seed: 1, sets: [], matrix: false };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${key} needs a value`);
      return v;
    };
    switch (key) {
      case '--n': args.n = Number(val()); break;
      case '--a': args.a = val(); break;
      case '--b': args.b = val(); break;
      case '--ai': args.aiA = args.aiB = val() as AiKind; break;
      case '--aiA': args.aiA = val() as AiKind; break;
      case '--aiB': args.aiB = val() as AiKind; break;
      case '--seed': args.seed = Number(val()); break;
      case '--set': args.sets.push(val()); break;
      case '--matrix': args.matrix = true; break;
      case '--replay': args.replay = val(); break;
      case '--json': args.json = val(); break;
      case '--help': case '-h': console.log(HELP); process.exit(0);
      default: throw new Error(`Unknown option ${key}. Run with --help.`);
    }
  }
  for (const ai of [args.aiA, args.aiB]) if (!AI_KINDS.includes(ai)) throw new Error(`Unknown AI "${ai}". Use ${AI_KINDS.join(', ')}.`);
  if (!Number.isFinite(args.n) || args.n < 1) throw new Error('--n must be a positive number');
  return args;
}

function runMany(data: GameData, a: string, b: string, aiA: AiKind, aiB: AiKind, n: number, seed: number, recordFirst: boolean) {
  const results: MatchResult[] = [];
  for (let i = 0; i < n; i++) {
    const base = (seed * 100003 + i * 7919) >>> 0;
    results.push(runMatch({
      chars: [a, b],
      controllers: [makeController(aiA, base + 1), makeController(aiB, base + 2)],
      data,
      record: recordFirst && i === 0,
    }));
  }
  return results;
}

// ---------------------------------------------------------------- summary

interface SideStats { damage: number; hits: number; blocked: number; whiffs: number; clashes: number; parriedBy: number; parries: number; grabs: number; knockdowns: number; summons: number; objects: number; unitsLost: number }
interface MoveStats { uses: number; hits: number; blocked: number; whiffs: number; clashed: number; parried: number; damage: number }

function summarise(results: MatchResult[], data: GameData) {
  const n = results.length;
  const wins = [0, 0];
  let draws = 0, kos = 0, trades = 0;
  const side: SideStats[] = [0, 1].map(() => ({ damage: 0, hits: 0, blocked: 0, whiffs: 0, clashes: 0, parriedBy: 0, parries: 0, grabs: 0, knockdowns: 0, summons: 0, objects: 0, unitsLost: 0 }));
  const moves: Record<string, MoveStats> = {};
  const mv = (id: string) => (moves[id] ??= { uses: 0, hits: 0, blocked: 0, whiffs: 0, clashed: 0, parried: 0, damage: 0 });
  for (const r of results) {
    if (r.winner === 'draw') draws++; else wins[r.winner]++;
    if (r.endReason === 'ko') kos++;
    for (const e of r.events) {
      const s = side[e.team];
      const id = e.action ?? '';
      switch (e.type) {
        case 'start': if (e.detail !== 'automatic') mv(id).uses++; break;
        case 'hit': case 'grabbed': s.hits++; s.damage += e.damage ?? 0; mv(id).hits++; mv(id).damage += e.damage ?? 0; if (e.type === 'grabbed') s.grabs++; break;
        case 'blocked': s.blocked++; s.damage += e.damage ?? 0; mv(id).blocked++; mv(id).damage += e.damage ?? 0; break;
        case 'whiff': s.whiffs++; mv(id).whiffs++; break;
        case 'clash': s.clashes++; mv(id).clashed++; break;
        case 'parried': s.parriedBy++; side[e.team === 0 ? 1 : 0].parries++; mv(id).parried++; break;
        case 'knockdown': s.knockdowns++; break;
        case 'trade': trades++; break;
        case 'summoned': s.summons++; break;
        case 'released': s.objects++; break;
        case 'defeated': s.unitsLost++; break;
      }
    }
  }
  const ticks = results.map((r) => r.ticks).sort((x, y) => x - y);
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
  const pct = (x: number) => `${((100 * x) / n).toFixed(1)}%`;
  return {
    matches: n,
    winRate: [pct(wins[0]), pct(wins[1])],
    draws: pct(draws),
    koRate: pct(kos),
    timeoutRate: pct(n - kos),
    ticks: { avg: avg(ticks), median: ticks[Math.floor(n / 2)], p90: ticks[Math.floor(n * 0.9)] ?? ticks[n - 1] },
    fightSeconds: avg(ticks) * data.rules.secondsPerTick,
    decisionTicks: avg(results.map((r) => r.decisionTicks)),
    tradesPerMatch: trades / n,
    perSide: side.map((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v / n]))),
    moves,
  };
}

// ---------------------------------------------------------------- printing

function table(headers: string[], rows: (string | number)[][]): string {
  const cells = [headers, ...rows.map((r) => r.map((c) => (typeof c === 'number' ? fmt(c) : c)))];
  const widths = headers.map((_, i) => Math.max(...cells.map((r) => String(r[i]).length)));
  const line = (r: (string | number)[]) => r.map((c, i) => (i === 0 ? String(c).padEnd(widths[i]) : String(c).padStart(widths[i]))).join('  ');
  return [line(cells[0]), widths.map((w) => '-'.repeat(w)).join('  '), ...cells.slice(1).map(line)].join('\n');
}
const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2));

function printSummary(a: string, b: string, aiA: string, aiB: string, sum: ReturnType<typeof summarise>, data: GameData) {
  const nameA = `${data.characters[a].name} (A)`, nameB = `${data.characters[b].name} (B)`;
  console.log(`\n${nameA}, ${aiA} AI  vs  ${nameB}, ${aiB} AI  ·  ${sum.matches} matches\n`);
  console.log(`Wins        ${nameA} ${sum.winRate[0]}  ·  ${nameB} ${sum.winRate[1]}  ·  draws ${sum.draws}`);
  console.log(`Endings     knockout ${sum.koRate}  ·  time out ${sum.timeoutRate}`);
  console.log(`Length      ${sum.ticks.avg.toFixed(0)} ticks on average (${sum.fightSeconds.toFixed(1)} s of fight)  ·  median ${sum.ticks.median}  ·  90% under ${sum.ticks.p90}`);
  console.log(`Decisions   ${sum.decisionTicks.toFixed(0)} ticks per match where someone could choose  ·  ${sum.tradesPerMatch.toFixed(2)} trades per match\n`);
  const keys = ['damage', 'hits', 'blocked', 'whiffs', 'clashes', 'parries', 'parriedBy', 'grabs', 'knockdowns', 'summons', 'objects', 'unitsLost'] as const;
  const labels = ['Damage dealt', 'Hits landed', 'Hits blocked', 'Whiffs', 'Clashes', 'Intercepts made', 'Got intercepted', 'Grabs landed', 'Knocked down', 'Units summoned', 'Objects thrown', 'Summons lost'];
  console.log('Per match, average, whole team (fighter plus any summons)');
  console.log(table(['', nameA, nameB], keys.map((k, i) => [labels[i], sum.perSide[0][k], sum.perSide[1][k]])));
  console.log('\nMoves, both sides, per match');
  const rows = Object.entries(sum.moves)
    .sort((x, y) => y[1].uses - x[1].uses)
    .map(([id, m]) => {
      const attacks = data.actions[id]?.hit;
      return [
        data.actions[id]?.name ?? id,
        m.uses / sum.matches,
        attacks ? `${m.uses ? Math.round((100 * m.hits) / m.uses) : 0}%` : '',
        attacks ? `${m.uses ? Math.round((100 * m.blocked) / m.uses) : 0}%` : '',
        attacks ? `${m.uses ? Math.round((100 * (m.whiffs + m.clashed + m.parried)) / m.uses) : 0}%` : '',
        attacks ? m.damage / sum.matches : '',
      ];
    });
  console.log(table(['Move', 'Uses', 'Landed', 'Blocked', 'Missed', 'Damage'], rows));
}

// ---------------------------------------------------------------- main

function main() {
  const args = parseArgs(process.argv.slice(2));
  const data = cloneData();
  for (const set of args.sets) {
    if (applyOverride(data, set) === 'added') console.log(`Note: "${set.split('=')[0]}" was not set before, so it was added. Check the spelling if that's unexpected.`);
  }
  for (const c of [args.a, args.b]) if (!playableCharacters(data).includes(c)) throw new Error(`Unknown character "${c}". Use ${playableCharacters(data).join(', ')}.`);
  if (args.sets.length) console.log(`Overrides: ${args.sets.join(', ')}`);

  if (args.matrix) {
    const chars = playableCharacters(data);
    const rows = chars.map((a) => [
      data.characters[a].name,
      ...chars.map((b) => {
        const res = runMany(data, a, b, args.aiA, args.aiB, args.n, args.seed, false);
        const wins = res.filter((r) => r.winner === 0).length;
        return `${Math.round((100 * wins) / res.length)}%`;
      }),
    ]);
    console.log(`\nWin rate of the row character against the column character · ${args.n} matches each · ${args.aiA} AI vs ${args.aiB} AI\n`);
    console.log(table(['', ...chars.map((c) => data.characters[c].name)], rows));
    return;
  }

  const results = runMany(data, args.a, args.b, args.aiA, args.aiB, args.n, args.seed, Boolean(args.replay));
  const sum = summarise(results, data);
  printSummary(args.a, args.b, args.aiA, args.aiB, sum, data);
  if (args.replay) {
    writeFileSync(args.replay, JSON.stringify({ chars: results[0].chars, ai: [args.aiA, args.aiB], data, frames: results[0].frames }));
    console.log(`\nSaved replay of match 1 to ${args.replay}`);
  }
  if (args.json) {
    writeFileSync(args.json, JSON.stringify({ args, summary: sum }, null, 2));
    console.log(`Saved summary to ${args.json}`);
  }
}

try {
  main();
} catch (err) {
  console.error(`\n${(err as Error).message}\n`);
  process.exit(1);
}
