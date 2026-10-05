# OverReach simulator

Prototype for **OverReach**, a chess-like, tick-based fighting game. Both players commit
actions at the same time each tick; everything already committed is public. This repo holds
the rules engine (no graphics), AI opponents, a batch simulator, and a box viewer for playing it.
The title is spelled **OverReach**, with a capital R, in all player-facing text.

The design doc lives at https://claude.ai/code/artifact/8791b292-88d6-44ab-95b2-8e01e7017338
(the owner can open it; it isn't readable from here). The rules that matter for code are summarised
below. When a request touches an open design question, ask the owner instead of inventing an answer.

## Commands

```bash
npm install
npm run check                 # typecheck + all tests; run before saying a change is done
npm test                      # rule tests only
npm run dev                   # viewer at http://localhost:8000, rebuilt on every save
npm run build:viewer          # write viewer/sim.bundle.js so viewer/index.html works when opened as a file
npm run sim -- --help         # batch simulator options
npm run sim -- --matrix --n 300                      # every character against every other
npm run sim -- --a beastmaster --b fighter --n 500   # one matchup in detail
npm run sim -- --set characters.lion.maxHp=25        # try a number without editing files
```

Node 20+. No other runtime dependencies.

## Layout

| Path | Role |
| --- | --- |
| `src/sim/data.ts` | All tuning: rules, every action (with a player-facing `description`), every character. |
| `src/sim/types.ts` | Data shapes, commented field by field. |
| `src/sim/engine.ts` | `step(state, commits, data)`: one tick. Pure and deterministic. |
| `src/sim/query.ts` | Public information for the AI and the viewer: threats heading for a unit, and damage forecasts (`forecastAction`, `forecastObject`) that play the engine forward. |
| `src/ai/controllers.ts` | AIs: `reader` (rule-based), `random`, `idle`. They command every unit on their team. |
| `src/sim/match.ts` | Runs a match between two controllers. |
| `src/cli/batch.ts` | Batch simulator CLI. |
| `src/browser.ts` | What the viewer imports; bundled to `viewer/sim.bundle.js` as the global `TickSim`. |
| `viewer/index.html` | Box viewer. Single file, vanilla JS, no framework. Jointed figures posed from posture and action phase, eased between ticks; hover a part for its forecast. Live matches record every tick for replays; Space commits. |
| `test/engine.test.ts` | One test per decided rule. |
| `test/query.test.ts` | Forecasts shown in the viewer match what the engine actually deals. |
| `test/ai.test.ts` | Every matchup finishes; the reader AI never sends illegal commits. |

## Game rules (decided)

- **Ticks.** The world moves only on ticks; thinking happens between them. One tick is about 0.1 s of fight time. Ordinary actions take at least 2 ticks, so speed effects have room to shorten them.
- **Units.** The board is a list of units on two teams: fighters (the team leader), summons (lion, clone) and objects (boulder, bullet). Every fighter and summon gets its own commit each tick, and they all act at once. Objects follow their own ticker and hit the first body in their path, friend or foe (the thrower excepted). Only a leader's knockout ends the match; on timeout, the leader with the higher health share wins.
- **Actions** have wind-up, active and recovery ticks, an optional cancel cost (wind-up only), body **channels** (lead arm, rear arm, legs), and an **action point** cost. Two actions on one unit can overlap only if they share no channel. Unspent action points carry over up to a cap. Character `tempo` scales wind-up and recovery (the speedster is below 1).
- **Postures:** standing, crouching, back foot, airborne, grounded. Each action lists the postures it can start from. Getting up from the ground is its own choice (quick, slow, roll), and a grounded unit can't be hit. A heavy hit on a block puts the blocker on the back foot, and you can't jump from there.
- **Contact** is resolved for everyone at once:
  - **Trades:** strikes to different zones on the same tick both land.
  - **Clashes:** arm strikes aimed at each other's same zone cancel out.
  - **Grabs:** a grab takes effect the tick it's committed and beats a block. A strike landing that tick beats it, and so does a jump.
  - **Intercepts:** an intercept deflects light and medium strikes to the head or body. A missed intercept is punishable.
  - **Blocks:** a block cuts damage by weight but doesn't cancel it. A standing guard covers head and body; a crouching guard covers body and legs.
  - **Dodging:** ducking, and low units like the lion, let anything at head height pass. Jumping dodges low strikes and grabs.
- **Hit zones:** head, body and legs set damage and stagger length. Each extra hit in a combo staggers for less time (`rules.comboDecay`).
- **Summons** have their own actions, action points, health and posture, and the owner commands them every tick. Limits: one of each summon at a time, and summons can't summon. A summon's upkeep comes out of its owner's action point income.

## Conventions

- **Tuning goes in `data.ts`, not the engine.** New moves, characters, summons (`kind: 'summon'`) and projectiles (`kind: 'throw'`) are data. Give every action a `description` written for players.
- **The engine must stay pure and deterministic:** no `Math.random`, no clocks, no I/O in `src/sim`. AI randomness goes through the seeded RNG in `src/ai/rng.ts`.
- **When a rule changes, its test changes.** Add a test for every new rule in `test/engine.test.ts`, and finish with `npm run check` green.
- **After any change to `src/`, rebuild the viewer bundle** with `npm run build:viewer` (or keep `npm run dev` running) so the viewer matches the engine.
- **After a balance-relevant change, run the simulator** (for example `npm run sim -- --matrix --n 300`) and report what moved.
- **Viewer code stays in one HTML file.** It has light and dark themes via CSS tokens, and must work at phone width.
- **Write user-facing text** (action descriptions, viewer labels, README) in plain language.

## Open design questions (ask before deciding)

- Action points: how many per tick, what each action costs, and the cap on saved points.
- Movement: walk speed, dashes, jump arcs, stage width.
- Tick costs for posture changes and actions.
- Timer and thinking-bank values for each match mode.
- How many objects one player can have in flight at once.
- How strong summons should be. Simulations show them dominating; upkeep is the current lever.
- Art direction.
