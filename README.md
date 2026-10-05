# OverReach simulator

The OverReach prototype: the tick engine, box fighters, and an AI to play against.
The rules follow the design doc. All the tuning numbers are placeholders, and the point
of this project is to change them and see what happens.

There are two ways to use it:

- **Batch simulator.** Runs hundreds or thousands of AI-vs-AI matches in seconds and reports win rates, match length, and how often each move lands.
- **Box viewer.** A web page where you play the AI tick by tick, play another person on the same computer, or watch two AIs fight.

## Setup

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run check       # typecheck, the rule tests, and the forecast tests
npm run dev         # the viewer at http://localhost:8000
npm run sim         # 500 AI-vs-AI matches, Fighter vs Fighter
```

## How the board works

The board is a list of **units** on two teams:

| Unit | Example | Who commands it |
| --- | --- | --- |
| Fighter | the character you picked; your team's leader | you, every tick |
| Summon | the beast master's lion, the twin's clone | you, every tick, alongside your fighter |
| Object | a thrown boulder, a bullet | nobody: it follows its own ticker |

- **Each tick, every fighter and summon gets its own commit,** and they all act at once. A summon has its own actions, action points, health and posture.
- **Objects hit the first body in their path,** friend or foe.
- **The match ends when a leader is knocked out.** A defeated summon just leaves the board.

## Box viewer

Run `npm run dev` and open http://localhost:8000. The page rebuilds every time you save a
file, so refresh to see a change. To open the viewer straight from disk instead, run
`npm run build:viewer` and open `viewer/index.html`.

- **Play vs AI.** Nothing happens until you commit, so take as long as you like. Choose a unit's tab (your fighter, then your lion), pick its actions, then press Commit to send them all. The AI commits at the same moment without seeing your picks; you see what it chose once the tick plays out.
  - **Suggest** fills in what the AI would do for the selected unit.
  - **Undo** takes back the last tick, so you can try another answer to the same situation.
  - **Let the AI command your lion** hands a summon over to the AI.
- **Two players.** Player 1 commits, then hands over; Player 2 commits; the tick plays out. Each player's picks stay hidden from the other.
- **Watch AI vs AI.** Step through a match tick by tick, or open a replay saved with `--replay`.
- **Space** commits (in Two players, it commits for whoever's turn it is; handing over still takes a click). During a replay or while watching, Space plays and pauses.
- **Replays.** Every tick you play is kept. **Replay the match** plays it back from the first tick with the same animation; a replay started mid-match hands you back to the fight when it catches up. When a match ends, the replay starts on its own after a moment. Untick *Replay automatically when the match ends* to turn that off. *Speed* sets how fast replays (and AI matches) play. Both settings are remembered in this browser.

*Coming at…* lists everything heading for the selected unit: strikes, grabs, throws still being wound up, and objects in flight. For each one it shows when it lands, the damage, and what answers it. Point at any action to read its description.

**The stage.** Every body is a jointed figure: head, chest, two arms and two legs, with a dot at each joint (the lion has four legs, jaws and a tail). The far-side arm and leg are drawn fainter. A figure's pose comes from its posture and from where each of its actions is: an arm pulls back during a wind-up, snaps out on the active tick, and comes back a little on each recovery tick. When a tick plays out, the figures move smoothly into their new pose and position, and damage numbers rise from whoever was hit. The view follows the fighters and zooms out when they're far apart.

- A limb that's busy has a halo: dashed while it winds up, solid while it's active, faint while it recovers.
- **Point at a body part** (tap it on a phone) to see what it's doing. For an attack it shows the damage clean and through a block, the stagger it causes, what answers it, whether it reaches its target, and what happens if nobody commits anything new. That last line runs the real engine forward, so it's exactly what the rules would do. Point at a head, body or legs to see what's coming at that spot. Point at a boulder or bullet in flight to see where it will land.
- Clicking or tapping pins the card so you can read it while the fight moves; click the stage again (or press Escape) to close it.
- The unit cards show the same damage forecast in one line under each attack.

## Batch simulator

```bash
npm run sim -- --n 2000                          # more matches
npm run sim -- --a beastmaster --b strongman     # pick characters
npm run sim -- --matrix --n 300                  # every character against every other
npm run sim -- --aiB random                      # reader AI against random play
npm run sim -- --set actions.jab.hit.damage=6    # change any number without editing files
npm run sim -- --a beastmaster --set actions.summon_lion.summon.upkeep=2 --set characters.lion.maxHp=25
npm run sim -- --replay replay.json              # save match 1 to open in the viewer
npm run sim -- --json results.json               # save the summary
npm run sim -- --help
```

`--set` accepts any path in the game data (see `src/sim/data.ts`). It can also add a field
that isn't set yet, such as a summon's `lifetime`, and tells you when it does. The same
seed always gives the same results.

## How the code is laid out

| File | What it does |
| --- | --- |
| `src/sim/data.ts` | **All tuning:** moves (each with a description), characters, rules. Start here. |
| `src/sim/types.ts` | The data shapes, with comments on every field. |
| `src/sim/engine.ts` | `step()`: one tick of the game. Pure and deterministic. |
| `src/sim/query.ts` | Public information for the AI and the viewer: what's coming at a unit, and the damage forecast for any attack or object. |
| `src/ai/controllers.ts` | The *reader* AI (rule-based, commands every unit on its team), plus *random* and *idle*. |
| `src/sim/match.ts` | Runs one match. |
| `src/cli/batch.ts` | The batch simulator. |
| `test/` | One test per rule from the design doc (`engine.test.ts`), checks that forecasts match what the engine deals (`query.test.ts`), and AI checks. |

### What happens in one tick (`step()`)

1. Every fighter and summon gains action points. Unspent points carry over, up to a cap. A summon's upkeep comes out of its owner's income.
2. Every unit's commit is checked and started. An action needs the right posture, free body channels on that unit, and enough of that unit's points.
3. Movement and posture changes apply. Summons and objects appear when the action that makes them goes active.
4. Objects move and hit the first body in their path, whoever threw them.
5. Melee contact is resolved all at once:
   - Arm strikes between two units aimed at the same zone **clash**, and neither lands.
   - Strikes to different zones **trade**: both land.
   - A strike beats a grab. A grab beats a block.
   - An intercept deflects light and medium strikes to the head or body.
   - A block reduces damage. A standing guard covers head and body; a crouching guard covers body and legs.
   - Ducking and low units (the lion) let anything at head height pass. Jumping dodges strikes to the legs and grabs. A grounded unit can't be hit.
6. Timers advance; misses are recorded.
7. Reactions count down. Each extra hit in a combo staggers for less time.
8. Defeated or expired summons and spent objects leave the board.
9. The match ends when a leader is knocked out, or on time (the leader with more health, as a share, wins).

### Adding things

- **A move:** add an entry to `ACTION_LIST` in `data.ts` with a `description`, then add its id to a character's `moves`. Wind-up, active and recovery are in ticks; `channels` say which body parts it uses.
- **A character:** add an entry to `CHARACTERS`. `tempo` below 1 makes every action faster (the speedster); `apIncome` and `apCap` set the action point budget.
- **A summon (a pet, a clone, a turret):**
  1. Add the summoned creature as a character with `summonOnly: true` and its own moves. Use `shape: 'beast'` to draw it as an animal, and `low: true` if head-height attacks should pass over it.
  2. Add an action with `kind: 'summon'` and `summon: { char, offset, max, upkeep, lifetime? }`. Use `char: 'self'` for a clone.
- **A thrown or fired object:** add an action with `kind: 'throw'` and a `projectile` block: speed per tick, size, what it does on impact. It flies by itself once released.
- **A rule:** change `step()` in `engine.ts`, then update or add the matching test.

## Findings from the first runs

These come from the default numbers and the reader AI, so treat them as starting points:

- **Summons dominate.** Running `--matrix` shows the beast master beating everyone (about 98% against the fighter), and the twin winning most matchups. A summon with its own action points is a second fighter. Even a much weaker lion (25 health, 40% damage, upkeep 2) still wins about 75%. Part of the reason is that a second body physically shields its owner, and part is that the AI handles two attackers poorly. Playing it yourself is the quickest way to tell which.
- **The speedster is even with the fighter at 0.75 tempo.** It used to be 0.5, where it won 93–98% of its matches.
- **Ranged characters are strong.** The strongman and the gunslinger each win about 70% against the fighter.
- **The brute is weak.**
- **Matches are short:** about 10 seconds of fight time, nearly always ending in a knockout.
