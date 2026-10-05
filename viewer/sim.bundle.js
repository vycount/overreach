"use strict";
var TickSim = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/browser.ts
  var browser_exports = {};
  __export(browser_exports, {
    AI_KINDS: () => AI_KINDS,
    DEFAULT_DATA: () => DEFAULT_DATA,
    answersFor: () => answersFor,
    apAvailable: () => apAvailable,
    applyOverride: () => applyOverride,
    blockCovers: () => blockCovers,
    busyChannels: () => busyChannels,
    canAct: () => canAct,
    charOf: () => charOf,
    cloneData: () => cloneData,
    connects: () => connects,
    createMatch: () => createMatch,
    dodges: () => dodges,
    durations: () => durations,
    facingOf: () => facingOf,
    isBody: () => isBody,
    leaderOf: () => leaderOf,
    legalCancels: () => legalCancels,
    legalStarts: () => legalStarts,
    makeController: () => makeController,
    nearestEnemy: () => nearestEnemy,
    phaseOf: () => phaseOf,
    pickTarget: () => pickTarget,
    runMatch: () => runMatch,
    step: () => step,
    teamUnits: () => teamUnits,
    threatsAgainst: () => threatsAgainst,
    ticksLeft: () => ticksLeft,
    ticksUntilActive: () => ticksUntilActive,
    ticksUntilFree: () => ticksUntilFree,
    totalTicks: () => totalTicks,
    unitById: () => unitById,
    upkeepOf: () => upkeepOf,
    whyNot: () => whyNot
  });

  // src/sim/data.ts
  var RULES = {
    stageWidth: 1e3,
    bodyWidth: 40,
    startGap: 220,
    maxTicks: 600,
    secondsPerTick: 0.1,
    zoneDamage: { head: 1.25, body: 1, legs: 0.8 },
    zoneStagger: { head: 1, body: 0, legs: 0 },
    blockReduction: { light: 0.9, medium: 0.7, heavy: 0.4 },
    blockstun: {
      light: { kind: "stagger", ticks: 1 },
      medium: { kind: "stagger", ticks: 2 },
      heavy: { kind: "backfoot", ticks: 2 }
    },
    blockPushback: { light: 5, medium: 15, heavy: 40 },
    comboDecay: 1,
    minStagger: 1,
    downTicks: 2,
    autoGetupAfter: 10,
    parryStagger: 3
  };
  var UPRIGHT = ["standing", "crouching", "backfoot"];
  var ACTION_LIST = [
    // ---- Strikes ----
    {
      id: "jab",
      name: "Jab",
      kind: "strike",
      channels: ["lead"],
      ap: 2,
      description: "Fast, light punch to the head with the lead hand. Hard to react to; ducking makes it miss.",
      from: [...UPRIGHT],
      windup: 1,
      active: 1,
      recovery: 2,
      hit: { zone: "head", reach: [30, 100], damage: 4, weight: "light", knockback: 10, onHit: { kind: "stagger", ticks: 2 } }
    },
    {
      id: "cross",
      name: "Cross",
      kind: "strike",
      channels: ["rear"],
      ap: 3,
      description: "Straight rear-hand punch to the head. Slower than a jab but hits harder and reaches further.",
      from: ["standing", "backfoot"],
      windup: 2,
      active: 1,
      recovery: 3,
      cancelCost: 1,
      hit: { zone: "head", reach: [30, 115], damage: 9, weight: "medium", knockback: 25, onHit: { kind: "stagger", ticks: 3 } }
    },
    {
      id: "hook",
      name: "Body hook",
      kind: "strike",
      channels: ["rear"],
      ap: 3,
      description: "Short hook to the body. Can be thrown from a crouch and staggers longer than head shots.",
      from: ["standing", "crouching"],
      windup: 2,
      active: 1,
      recovery: 3,
      cancelCost: 1,
      hit: { zone: "body", reach: [25, 90], damage: 8, weight: "medium", knockback: 15, onHit: { kind: "stagger", ticks: 4 } }
    },
    {
      id: "lowkick",
      name: "Low kick",
      kind: "strike",
      channels: ["legs"],
      ap: 3,
      description: "Kick to the legs. Goes under a standing guard; a jump or a crouching guard stops it.",
      from: ["standing"],
      windup: 2,
      active: 1,
      recovery: 3,
      cancelCost: 1,
      hit: { zone: "legs", reach: [40, 125], damage: 7, weight: "medium", knockback: 10, onHit: { kind: "stagger", ticks: 3 } }
    },
    {
      id: "sweep",
      name: "Sweep",
      kind: "strike",
      channels: ["legs"],
      ap: 4,
      description: "Low spinning sweep that knocks the target down. Slow to start, easy to jump.",
      from: ["standing", "crouching"],
      windup: 3,
      active: 1,
      recovery: 4,
      cancelCost: 2,
      hit: { zone: "legs", reach: [40, 135], damage: 8, weight: "medium", knockback: 20, onHit: { kind: "knockdown" } }
    },
    {
      id: "roundhouse",
      name: "Roundhouse",
      kind: "strike",
      channels: ["legs"],
      ap: 5,
      description: "Heavy kick to the head with long reach. Knocks down on hit and puts a blocker on the back foot. Very slow.",
      from: ["standing"],
      windup: 4,
      active: 1,
      recovery: 5,
      cancelCost: 2,
      hit: { zone: "head", reach: [60, 160], damage: 18, weight: "heavy", knockback: 70, onHit: { kind: "knockdown" }, onBlock: { kind: "backfoot", ticks: 2 } }
    },
    {
      id: "jumpkick",
      name: "Jump kick",
      kind: "strike",
      channels: ["legs"],
      ap: 4,
      description: "Leaping kick that covers ground. Airborne while active, so low attacks and grabs miss it. Ducking makes it sail over.",
      from: ["standing"],
      windup: 2,
      active: 2,
      recovery: 2,
      cancelCost: 2,
      airborne: true,
      move: 120,
      hit: { zone: "head", reach: [30, 130], damage: 12, weight: "heavy", knockback: 50, onHit: { kind: "knockdown" }, onBlock: { kind: "backfoot", ticks: 2 } }
    },
    {
      id: "grab",
      name: "Grab",
      kind: "grab",
      channels: ["lead", "rear"],
      ap: 3,
      description: "Grab and throw. Lands the tick you commit it, goes through a block, and throws the target down. Loses to any strike landing the same tick and to a jump.",
      from: ["standing"],
      windup: 0,
      active: 1,
      recovery: 4,
      hit: { zone: "body", reach: [20, 75], damage: 10, weight: "heavy", knockback: 0, onHit: { kind: "thrown", distance: 120 } }
    },
    // ---- Specials ----
    {
      id: "summon_lion",
      name: "Call the lion",
      kind: "summon",
      channels: ["lead", "rear"],
      ap: 4,
      description: "Calls your lion. It arrives in front of you and acts from the next tick, with its own action points. You command it each tick alongside yourself. Keeping it out costs you 1 action point per tick.",
      from: ["standing"],
      windup: 3,
      active: 1,
      recovery: 2,
      cancelCost: 1,
      summon: { char: "lion", offset: 50, max: 1, upkeep: 1 }
    },
    {
      id: "split",
      name: "Split",
      kind: "summon",
      channels: ["lead", "rear", "legs"],
      ap: 5,
      description: "Splits off a copy of yourself with less health. It has your moves and its own action points, and lasts 12 seconds of fight time. Keeping it out costs you 1 action point per tick.",
      from: ["standing"],
      windup: 3,
      active: 1,
      recovery: 2,
      cancelCost: 1,
      summon: { char: "self", hp: 35, offset: 45, max: 1, lifetime: 120, upkeep: 1 }
    },
    {
      id: "throw_boulder",
      name: "Throw boulder",
      kind: "throw",
      channels: ["lead", "rear", "legs"],
      ap: 5,
      description: "Rips up a boulder and hurls it at head height. It flies on its own once released and hits the first body in its path, friend or foe. Ducking lets it pass.",
      from: ["standing"],
      windup: 3,
      active: 1,
      recovery: 3,
      cancelCost: 2,
      projectile: {
        id: "boulder",
        name: "Boulder",
        speed: 50,
        radius: 22,
        offset: 40,
        lifetime: 30,
        impact: { zone: "head", damage: 16, weight: "heavy", knockback: 60, onHit: { kind: "knockdown" }, onBlock: { kind: "backfoot", ticks: 2 } }
      }
    },
    {
      id: "shoot",
      name: "Shoot",
      kind: "throw",
      channels: ["rear"],
      ap: 3,
      description: "Fires a bullet at body height with the rear hand. Crosses most of the stage in a tick; a block takes most of it.",
      from: [...UPRIGHT],
      windup: 1,
      active: 1,
      recovery: 3,
      projectile: {
        id: "bullet",
        name: "Bullet",
        speed: 240,
        radius: 4,
        offset: 30,
        lifetime: 6,
        impact: { zone: "body", damage: 6, weight: "light", knockback: 5, onHit: { kind: "stagger", ticks: 3 } }
      }
    },
    // ---- Lion ----
    {
      id: "bite",
      name: "Bite",
      kind: "strike",
      channels: ["lead"],
      ap: 2,
      description: "Lunging bite to the body.",
      from: ["standing", "crouching"],
      windup: 1,
      active: 1,
      recovery: 2,
      hit: { zone: "body", reach: [30, 90], damage: 7, weight: "medium", knockback: 10, onHit: { kind: "stagger", ticks: 3 } }
    },
    {
      id: "claw",
      name: "Claw",
      kind: "strike",
      channels: ["rear"],
      ap: 2,
      description: "Quick swipe at the legs. Goes under a standing guard.",
      from: ["standing", "crouching"],
      windup: 1,
      active: 1,
      recovery: 1,
      hit: { zone: "legs", reach: [30, 100], damage: 5, weight: "light", knockback: 5, onHit: { kind: "stagger", ticks: 2 } }
    },
    {
      id: "pounce",
      name: "Pounce",
      kind: "strike",
      channels: ["lead", "rear", "legs"],
      ap: 4,
      description: "Leaps forward and bowls the target over. Airborne while active.",
      from: ["standing"],
      windup: 2,
      active: 2,
      recovery: 3,
      cancelCost: 1,
      airborne: true,
      move: 110,
      hit: { zone: "body", reach: [20, 110], damage: 9, weight: "heavy", knockback: 40, onHit: { kind: "knockdown" } }
    },
    // ---- Defence ----
    {
      id: "block",
      name: "Block",
      kind: "block",
      channels: ["lead", "rear"],
      ap: 1,
      description: "Guard with both arms for 3 ticks. Standing it covers head and body; while ducking it covers body and legs. Heavy hits still hurt and push you back.",
      from: [...UPRIGHT],
      windup: 1,
      active: 3,
      recovery: 1
    },
    {
      id: "parry",
      name: "Intercept",
      kind: "parry",
      channels: ["lead"],
      ap: 2,
      description: "Knock an incoming punch or kick aside with the lead hand. Deflects light and medium strikes to the head or body and staggers the attacker. A miss leaves the arm recovering.",
      from: ["standing", "backfoot"],
      windup: 1,
      active: 1,
      recovery: 4
    },
    // ---- Posture ----
    {
      id: "crouch",
      name: "Duck",
      kind: "posture",
      channels: ["legs"],
      ap: 1,
      from: ["standing"],
      windup: 1,
      active: 1,
      recovery: 0,
      sets: "crouching",
      description: "Drop into a crouch. Head-height strikes and objects pass over you. Stay down until you rise."
    },
    {
      id: "stand",
      name: "Rise",
      kind: "posture",
      channels: ["legs"],
      ap: 0,
      from: ["crouching"],
      windup: 1,
      active: 1,
      recovery: 0,
      sets: "standing",
      description: "Stand back up from a crouch."
    },
    {
      id: "recover",
      name: "Recover footing",
      kind: "posture",
      channels: ["legs"],
      ap: 1,
      from: ["backfoot"],
      windup: 2,
      active: 1,
      recovery: 0,
      sets: "standing",
      description: "Get off the back foot and stand square again. Needed before jumping."
    },
    {
      id: "getup_quick",
      name: "Quick get-up",
      kind: "posture",
      channels: ["legs"],
      ap: 0,
      from: ["grounded"],
      windup: 2,
      active: 1,
      recovery: 0,
      sets: "standing",
      description: "Spring back up as fast as possible. You cannot be hit until you are standing."
    },
    {
      id: "getup_slow",
      name: "Slow get-up",
      kind: "posture",
      channels: ["legs"],
      ap: 0,
      from: ["grounded"],
      windup: 4,
      active: 1,
      recovery: 0,
      sets: "standing",
      description: "Take your time getting up, so an attack timed for a quick get-up misses."
    },
    {
      id: "getup_roll",
      name: "Roll back",
      kind: "posture",
      channels: ["legs"],
      ap: 1,
      from: ["grounded"],
      windup: 3,
      active: 1,
      recovery: 0,
      sets: "standing",
      move: -110,
      description: "Roll away from the attacker before standing up."
    },
    // ---- Movement ----
    {
      id: "step_fwd",
      name: "Step in",
      kind: "move",
      channels: ["legs"],
      ap: 1,
      from: ["standing"],
      windup: 0,
      active: 2,
      recovery: 0,
      move: 50,
      description: "Short step toward the opponent."
    },
    {
      id: "step_back",
      name: "Step back",
      kind: "move",
      channels: ["legs"],
      ap: 1,
      from: ["standing", "backfoot"],
      windup: 0,
      active: 2,
      recovery: 0,
      move: -50,
      needsRoomBehind: 20,
      description: "Short step away. Not possible with a wall right behind you."
    },
    {
      id: "dash",
      name: "Dash in",
      kind: "move",
      channels: ["legs"],
      ap: 2,
      from: ["standing"],
      windup: 1,
      active: 2,
      recovery: 1,
      move: 140,
      description: "Burst of speed toward the opponent."
    },
    {
      id: "jump",
      name: "Jump",
      kind: "move",
      channels: ["legs"],
      ap: 2,
      from: ["standing"],
      windup: 1,
      active: 3,
      recovery: 1,
      airborne: true,
      description: "Jump in place. Low attacks and grabs miss while you are in the air; a hit in the air knocks you down."
    },
    {
      id: "jump_fwd",
      name: "Jump forward",
      kind: "move",
      channels: ["legs"],
      ap: 2,
      from: ["standing"],
      windup: 1,
      active: 3,
      recovery: 1,
      airborne: true,
      move: 100,
      description: "Jump toward the opponent."
    }
  ];
  var ACTIONS = Object.fromEntries(ACTION_LIST.map((a) => [a.id, a]));
  var CORE = [
    "jab",
    "cross",
    "hook",
    "lowkick",
    "sweep",
    "roundhouse",
    "jumpkick",
    "grab",
    "block",
    "parry",
    "crouch",
    "stand",
    "recover",
    "getup_quick",
    "getup_slow",
    "getup_roll",
    "step_fwd",
    "step_back",
    "dash",
    "jump",
    "jump_fwd"
  ];
  var LION = ["bite", "claw", "pounce", "crouch", "stand", "recover", "getup_quick", "getup_roll", "step_fwd", "step_back", "dash", "jump", "jump_fwd"];
  var base = { shape: "humanoid", apIncome: 2, apCap: 6, apStart: 4, tempo: 1, power: 1, moveMul: 1 };
  var CHARACTERS = {
    fighter: { ...base, id: "fighter", name: "Fighter", description: "The baseline: every core move, nothing extra.", maxHp: 100, moves: CORE },
    speedster: {
      ...base,
      id: "speedster",
      name: "Speedster",
      description: "Every action takes fewer ticks, with an extra action point per tick. Less health and power.",
      maxHp: 85,
      apIncome: 3,
      apCap: 7,
      apStart: 5,
      tempo: 0.75,
      power: 0.8,
      moveMul: 1.3,
      moves: CORE
    },
    brute: {
      ...base,
      id: "brute",
      name: "Brute",
      description: "Slow and tough. Hits harder, takes more to put down.",
      maxHp: 120,
      apCap: 7,
      tempo: 1.25,
      power: 1.25,
      moveMul: 0.85,
      moves: CORE
    },
    beastmaster: {
      ...base,
      id: "beastmaster",
      name: "Beast master",
      description: "Calls a lion that fights alongside them. You command both every tick.",
      maxHp: 90,
      moves: [...CORE, "summon_lion"]
    },
    twin: {
      ...base,
      id: "twin",
      name: "Twin",
      description: "Splits into two for a while. You command both every tick.",
      maxHp: 90,
      moves: [...CORE, "split"]
    },
    strongman: {
      ...base,
      id: "strongman",
      name: "Strongman",
      description: "Throws boulders that fly on their own and hit whoever is in the way.",
      maxHp: 115,
      apCap: 7,
      tempo: 1.1,
      power: 1.15,
      moveMul: 0.9,
      moves: [...CORE, "throw_boulder"]
    },
    gunslinger: {
      ...base,
      id: "gunslinger",
      name: "Gunslinger",
      description: "Fights at range with a pistol in the rear hand.",
      maxHp: 90,
      moves: [...CORE, "shoot"]
    },
    lion: {
      ...base,
      id: "lion",
      name: "Lion",
      description: "Summoned by the beast master. Low to the ground, so head-height attacks pass over it.",
      summonOnly: true,
      shape: "beast",
      low: true,
      maxHp: 45,
      apCap: 5,
      apStart: 3,
      tempo: 0.75,
      moveMul: 1.6,
      moves: LION
    }
  };
  var DEFAULT_DATA = { rules: RULES, actions: ACTIONS, characters: CHARACTERS };
  function cloneData(data = DEFAULT_DATA) {
    return JSON.parse(JSON.stringify(data));
  }
  function applyOverride(data, assignment) {
    const eq = assignment.indexOf("=");
    if (eq < 0) throw new Error(`Override "${assignment}" needs the form path=value`);
    const path = assignment.slice(0, eq).split(".");
    const raw = assignment.slice(eq + 1);
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      value = raw;
    }
    let node = data;
    for (let i = 0; i < path.length - 1; i++) {
      const next = node[path[i]];
      if (next === void 0 || next === null || typeof next !== "object") {
        throw new Error(`Override path "${path.slice(0, i + 1).join(".")}" does not exist`);
      }
      node = next;
    }
    const last = path[path.length - 1];
    const existed = last in node;
    node[last] = value;
    return existed ? "changed" : "added";
  }

  // src/sim/engine.ts
  function charOf(u, data) {
    const c = data.characters[u.char];
    if (!c) throw new Error(`Unknown character "${u.char}"`);
    return c;
  }
  function unitById(s, id) {
    return s.units.find((u) => u.id === id);
  }
  function isBody(u) {
    return u.kind !== "object";
  }
  function teamUnits(s, team) {
    return s.units.filter((u) => u.team === team && isBody(u));
  }
  function leaderOf(s, team) {
    const l = s.units.find((u) => u.team === team && u.leader);
    if (!l) throw new Error(`Team ${team} has no leader`);
    return l;
  }
  function nearestEnemy(s, u) {
    let best;
    for (const v of s.units) {
      if (v.team === u.team || !isBody(v)) continue;
      const d = Math.abs(v.x - u.x);
      const bd = best ? Math.abs(best.x - u.x) : Infinity;
      if (d < bd || d === bd && v.leader) best = v;
    }
    return best;
  }
  function facingOf(s, u) {
    if (u.kind === "object") return u.dir ?? 1;
    const e = nearestEnemy(s, u);
    if (!e || e.x === u.x) return u.team === 0 ? 1 : -1;
    return e.x > u.x ? 1 : -1;
  }
  function durations(def, ch) {
    return {
      windup: Math.max(0, Math.round(def.windup * ch.tempo)),
      active: def.active,
      recovery: Math.max(0, Math.round(def.recovery * ch.tempo))
    };
  }
  function createMatch(charA, charB, data) {
    const r = data.rules;
    const mid = r.stageWidth / 2;
    const make = (id, team, char, x) => {
      const c = data.characters[char];
      if (!c) throw new Error(`Unknown character "${char}"`);
      return {
        id,
        team,
        kind: "fighter",
        char,
        name: c.name,
        leader: true,
        x,
        hp: c.maxHp,
        maxHp: c.maxHp,
        ap: c.apStart,
        posture: "standing",
        actions: [],
        reaction: null,
        combo: 0,
        idleDown: 0
      };
    };
    return {
      tick: 0,
      units: [make("A", 0, charA, mid - r.startGap / 2), make("B", 1, charB, mid + r.startGap / 2)],
      nextUid: 1,
      nextSpawn: 1,
      over: false,
      winner: null,
      endReason: null
    };
  }
  function phaseOf(inst) {
    if (inst.cancelLeft > 0) return "cancel";
    if (inst.t < inst.windup) return "windup";
    if (inst.t < inst.windup + inst.active) return "active";
    return "recovery";
  }
  function totalTicks(inst) {
    return inst.windup + inst.active + inst.recovery;
  }
  function ticksLeft(inst) {
    return inst.cancelLeft > 0 ? inst.cancelLeft : totalTicks(inst) - inst.t;
  }
  function ticksUntilActive(inst) {
    if (inst.cancelLeft > 0) return null;
    if (inst.t < inst.windup) return inst.windup - inst.t;
    if (inst.t < inst.windup + inst.active) return 0;
    return null;
  }
  function busyChannels(u, data) {
    const busy = /* @__PURE__ */ new Set();
    for (const inst of u.actions) for (const c of data.actions[inst.id].channels) busy.add(c);
    return busy;
  }
  function canAct(s, u) {
    return !s.over && isBody(u) && u.reaction === null;
  }
  function upkeepOf(s, u, data) {
    let total = 0;
    for (const v of s.units) if (v.owner === u.id && v.kind === "summon" && v.spawnedBy) total += data.actions[v.spawnedBy]?.summon?.upkeep ?? 0;
    return total;
  }
  function apAvailable(u, data, s) {
    const c = charOf(u, data);
    return Math.min(c.apCap, u.ap + Math.max(0, c.apIncome - (s ? upkeepOf(s, u, data) : 0)));
  }
  function whyNot(s, unitId, actionId, data, opts = {}) {
    const u = unitById(s, unitId);
    if (!u) return "no such unit";
    if (!isBody(u)) return "objects take no actions";
    const def = data.actions[actionId];
    if (!def) return "unknown action";
    if (!charOf(u, data).moves.includes(actionId)) return "not in this character's moves";
    if (s.over) return "match is over";
    if (u.reaction) return `can't act (${u.reaction.kind})`;
    if (!def.from.includes(u.posture)) return `can't start while ${u.posture}`;
    const busy = opts.busy ?? busyChannels(u, data);
    const taken = def.channels.find((c) => busy.has(c));
    if (taken) return `${taken} is busy`;
    const ap = opts.apLeft ?? apAvailable(u, data, s);
    if (def.ap > ap) return `needs ${def.ap} AP`;
    if (def.summon) {
      if (u.kind === "summon") return "summons can't summon";
      const out = s.units.filter((v) => v.owner === u.id && v.spawnedBy === def.id).length;
      const coming = u.actions.filter((i) => i.id === def.id).length;
      if (out + coming >= def.summon.max) return "already out";
    }
    if (def.needsRoomBehind !== void 0) {
      const r = data.rules;
      const behind = facingOf(s, u) === 1 ? u.x - r.bodyWidth / 2 : r.stageWidth - r.bodyWidth / 2 - u.x;
      if (behind < def.needsRoomBehind) return "wall behind";
    }
    return null;
  }
  function legalStarts(s, unitId, data) {
    const u = unitById(s, unitId);
    if (!u || !isBody(u)) return [];
    return charOf(u, data).moves.filter((id) => whyNot(s, unitId, id, data) === null);
  }
  function legalCancels(s, unitId, data) {
    const u = unitById(s, unitId);
    if (!u || !canAct(s, u)) return [];
    return u.actions.filter((i) => i.cancelLeft === 0 && i.t < i.windup && data.actions[i.id].cancelCost !== void 0).map((i) => i.uid);
  }
  function step(prev, commits, data) {
    const s = structuredClone(prev);
    const events = [];
    if (s.over) return { state: s, events };
    const r = data.rules;
    s.tick += 1;
    const T = s.tick;
    const emit = (u, e) => events.push({ tick: T, unit: u.id, team: u.team, ...e });
    const byId = (id) => s.units.find((u) => u.id === id);
    for (const u of s.units) {
      if (!isBody(u)) continue;
      const c = charOf(u, data);
      u.ap = Math.min(c.apCap, u.ap + Math.max(0, c.apIncome - upkeepOf(s, u, data)));
    }
    for (const u of s.units) {
      if (!isBody(u)) continue;
      const commit = commits[u.id] ?? [];
      if (!canAct(s, u)) {
        for (const cmd of commit) emit(u, { type: "illegal", action: cmd.type === "start" ? cmd.action : "cancel", detail: `can't act (${u.reaction?.kind})` });
        continue;
      }
      for (const cmd of commit) {
        if (cmd.type !== "cancel") continue;
        const inst = u.actions.find((i) => i.uid === cmd.uid);
        const cost = inst ? data.actions[inst.id].cancelCost : void 0;
        if (!inst || cost === void 0 || inst.cancelLeft > 0 || inst.t >= inst.windup) {
          emit(u, { type: "illegal", action: inst?.id ?? "cancel", detail: "not cancellable now" });
          continue;
        }
        if (cost <= 0) u.actions = u.actions.filter((i) => i !== inst);
        else inst.cancelLeft = cost;
        emit(u, { type: "cancel", action: inst.id });
      }
      const busy = busyChannels(u, data);
      for (const cmd of commit) {
        if (cmd.type !== "start") continue;
        const reason = whyNot(s, u.id, cmd.action, data, { busy, apLeft: u.ap });
        if (reason) {
          emit(u, { type: "illegal", action: cmd.action, detail: reason });
          continue;
        }
        startAction(s, u, cmd.action, data);
        for (const c of data.actions[cmd.action].channels) busy.add(c);
        emit(u, { type: "start", action: cmd.action });
      }
      if (u.posture === "grounded" && u.actions.length === 0) {
        u.idleDown += 1;
        if (u.idleDown >= r.autoGetupAfter && data.actions.getup_quick && charOf(u, data).moves.includes("getup_quick")) {
          startAction(s, u, "getup_quick", data, true);
          emit(u, { type: "start", action: "getup_quick", detail: "automatic" });
        }
      } else {
        u.idleDown = 0;
      }
    }
    const startX = new Map(s.units.map((u) => [u.id, u.x]));
    const spawns = [];
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
          const target = Math.round(total * (idx + 1) / span);
          u.x += (target - inst.movedSoFar) * dir;
          inst.movedSoFar = target;
        }
        if (idx === inst.windup && inst.active > 0) {
          if (def.sets) {
            if (u.posture === "grounded" && def.sets !== "grounded") emit(u, { type: "getup", action: def.id });
            u.posture = def.sets;
          }
          if (def.airborne) u.posture = "airborne";
          if (def.summon || def.projectile) spawns.push({ from: u, def, dir });
        }
        if (def.airborne && idx >= span && u.posture === "airborne") u.posture = "standing";
      }
    }
    separate(s, data, startX);
    for (const { from, def, dir } of spawns) spawn(s, from, def, dir, data, emit);
    separate(s, data, startX);
    const outcomes = [];
    const removed = /* @__PURE__ */ new Set();
    for (const o of s.units) {
      if (o.kind !== "object" || (o.bornAt ?? 0) >= T) continue;
      const proj = data.actions[o.char].projectile;
      const dir = o.dir ?? 1;
      const from = o.x;
      const to = o.x + dir * proj.speed;
      const back = from - dir * proj.radius;
      const reachEnd = to + dir * proj.radius;
      const inPath = s.units.filter((v) => isBody(v) && v.id !== o.owner && (v.x - back) * dir > 0 && (v.x - dir * r.bodyWidth / 2 - reachEnd) * dir <= 0).sort((a2, b2) => (a2.x - from) * dir - (b2.x - from) * dir);
      const target = inPath.find((v) => !dodges(v, proj.impact.zone, data));
      if (target) {
        outcomes.push(defend(o.id, target, proj.impact, from, o.char, void 0, s, data));
        removed.add(o.id);
        continue;
      }
      o.x = to;
      if (o.x < 0 || o.x > r.stageWidth) {
        emit(o, { type: "impact", action: o.char, detail: "hit the wall" });
        removed.add(o.id);
      }
    }
    const attacks = [];
    for (const u of s.units) {
      if (!isBody(u)) continue;
      for (const inst of u.actions) {
        if (phaseOf(inst) !== "active" || inst.hasHit) continue;
        const def = data.actions[inst.id];
        if (def.kind !== "strike" && def.kind !== "grab" || !def.hit) continue;
        const target = pickTarget(s, u, def, data);
        if (target) attacks.push({ unit: u, inst, def, target });
      }
    }
    for (const a2 of attacks) {
      if (a2.inst.hasHit || !isArmStrike(a2.def)) continue;
      const b2 = attacks.find((x) => !x.inst.hasHit && x.unit.id === a2.target.id && x.target.id === a2.unit.id && isArmStrike(x.def) && x.def.hit.zone === a2.def.hit.zone);
      if (b2) {
        a2.inst.hasHit = b2.inst.hasHit = true;
        emit(a2.unit, { type: "clash", action: a2.def.id, detail: `met ${b2.def.id}` });
        emit(b2.unit, { type: "clash", action: b2.def.id, detail: `met ${a2.def.id}` });
      }
    }
    for (const a2 of attacks) {
      if (a2.inst.hasHit || a2.def.kind !== "grab") continue;
      const mutual = attacks.find((x) => !x.inst.hasHit && x.def.kind === "grab" && x.unit.id === a2.target.id && x.target.id === a2.unit.id);
      if (mutual) {
        a2.inst.hasHit = mutual.inst.hasHit = true;
        emit(a2.unit, { type: "clash", action: "grab", detail: "grabs broke each other" });
        emit(mutual.unit, { type: "clash", action: "grab", detail: "grabs broke each other" });
        continue;
      }
      if (attacks.some((x) => !x.inst.hasHit && x.def.kind === "strike" && x.target.id === a2.unit.id)) {
        a2.inst.hasHit = true;
        emit(a2.unit, { type: "whiff", action: a2.def.id, detail: "beaten by a strike" });
      }
    }
    for (const a2 of attacks) {
      if (a2.inst.hasHit) continue;
      outcomes.push(defend(a2.unit.id, a2.target, a2.def.hit, a2.unit.x, a2.def.id, a2.inst, s, data, a2.def.kind === "grab", charOf(a2.unit, data).power));
    }
    const reactingBefore = new Map(s.units.map((u) => [u.id, u.reaction !== null && !u.reaction.fresh]));
    const pending = /* @__PURE__ */ new Map();
    const hitPairs = [];
    for (const o of outcomes) {
      if (o.inst) o.inst.hasHit = true;
      const att = byId(o.attacker);
      const def = byId(o.defender);
      if (o.kind === "parried") {
        def.actions = def.actions.filter((i) => data.actions[i.id].kind !== "parry");
        att.actions = [];
        att.reaction = { kind: "deflected", left: r.parryStagger, fresh: true };
        emit(att, { type: "parried", action: o.action, target: def.id, zone: o.impact.zone });
        continue;
      }
      def.hp = Math.max(0, def.hp - o.damage);
      const list = pending.get(def.id) ?? [];
      if (o.kind === "blocked") {
        emit(att, { type: "blocked", action: o.action, target: def.id, damage: o.damage, zone: o.impact.zone });
        list.push({ reaction: o.impact.onBlock ?? r.blockstun[o.impact.weight], zone: o.impact.zone, wasHit: false });
        push(s, data, o.fromX, att, def, r.blockPushback[o.impact.weight]);
      } else {
        emit(att, { type: o.kind === "grabbed" ? "grabbed" : "hit", action: o.action, target: def.id, damage: o.damage, zone: o.impact.zone });
        list.push({ reaction: o.impact.onHit, zone: o.impact.zone, wasHit: true });
        push(s, data, o.fromX, att, def, o.impact.onHit.kind === "thrown" ? o.impact.onHit.distance : o.impact.knockback);
        hitPairs.push(`${o.attacker}>${o.defender}`);
      }
      pending.set(def.id, list);
    }
    for (const pair of hitPairs) {
      const [a2, b2] = pair.split(">");
      if (a2 < b2 && hitPairs.includes(`${b2}>${a2}`)) emit(byId(a2), { type: "trade", target: b2, detail: "both hit on the same tick" });
    }
    for (const [id, list] of pending) {
      const u = byId(id);
      applyReactions(u, list, reactingBefore.get(id) ?? false, data, (e) => emit(u, e));
    }
    for (const u of s.units) {
      if (!isBody(u)) continue;
      const keep = [];
      for (const inst of u.actions) {
        const def = data.actions[inst.id];
        if (inst.cancelLeft > 0) {
          inst.cancelLeft -= 1;
          if (inst.cancelLeft > 0) keep.push(inst);
          continue;
        }
        if ((def.kind === "strike" || def.kind === "grab") && inst.t === inst.windup + inst.active - 1 && !inst.hasHit) {
          emit(u, { type: "whiff", action: def.id });
        }
        inst.t += 1;
        if (inst.t < totalTicks(inst)) keep.push(inst);
        else if (def.airborne && u.posture === "airborne") u.posture = "standing";
      }
      u.actions = keep;
    }
    for (const u of s.units) {
      if (!u.reaction) continue;
      if (u.reaction.fresh) {
        u.reaction.fresh = false;
        continue;
      }
      u.reaction.left -= 1;
      if (u.reaction.left <= 0) {
        u.reaction = null;
        u.combo = 0;
      }
    }
    for (const u of s.units) {
      if (u.leader) continue;
      if (u.kind === "summon" && u.hp <= 0) {
        emit(u, { type: "defeated" });
        removed.add(u.id);
      } else if (u.expiresAt !== void 0 && T >= u.expiresAt && !removed.has(u.id)) {
        if (u.kind === "summon") emit(u, { type: "expired" });
        removed.add(u.id);
      }
    }
    if (removed.size) s.units = s.units.filter((u) => !removed.has(u.id));
    const a = leaderOf(s, 0), b = leaderOf(s, 1);
    if (a.hp <= 0 || b.hp <= 0) {
      s.over = true;
      s.endReason = "ko";
      s.winner = a.hp <= 0 && b.hp <= 0 ? "draw" : a.hp <= 0 ? 1 : 0;
      emit(s.winner === 1 ? b : a, { type: "ko" });
    } else if (T >= r.maxTicks) {
      s.over = true;
      s.endReason = "timeout";
      const pa = a.hp / a.maxHp, pb = b.hp / b.maxHp;
      s.winner = pa === pb ? "draw" : pa > pb ? 0 : 1;
      emit(s.winner === 1 ? b : a, { type: "timeout" });
    }
    return { state: s, events };
  }
  function startAction(s, u, id, data, free = false) {
    const def = data.actions[id];
    u.actions.push({ uid: s.nextUid++, id, t: 0, ...durations(def, charOf(u, data)), cancelLeft: 0, hasHit: false, movedSoFar: 0 });
    if (!free) u.ap -= def.ap;
  }
  function spawn(s, from, def, dir, data, emit) {
    const r = data.rules;
    const clamp = (x) => Math.min(r.stageWidth - r.bodyWidth / 2, Math.max(r.bodyWidth / 2, x));
    const n = s.nextSpawn++;
    if (def.summon) {
      const spec = def.summon;
      const char = spec.char === "self" ? from.char : spec.char;
      const ch = data.characters[char];
      if (!ch) throw new Error(`Summon of unknown character "${char}"`);
      const hp = spec.hp ?? ch.maxHp;
      const unit = {
        id: `${from.id}.${spec.char === "self" ? "clone" : char}${n}`,
        team: from.team,
        kind: "summon",
        char,
        name: spec.char === "self" ? `${ch.name} clone` : ch.name,
        leader: false,
        owner: from.id,
        spawnedBy: def.id,
        x: clamp(from.x + dir * spec.offset),
        hp,
        maxHp: hp,
        ap: ch.apStart,
        posture: "standing",
        actions: [],
        reaction: null,
        combo: 0,
        idleDown: 0,
        expiresAt: spec.lifetime ? s.tick + spec.lifetime : void 0
      };
      s.units.push(unit);
      emit(from, { type: "summoned", action: def.id, target: unit.id });
    } else if (def.projectile) {
      const p = def.projectile;
      const obj = {
        id: `obj${n}`,
        team: from.team,
        kind: "object",
        char: def.id,
        name: p.name,
        leader: false,
        owner: from.id,
        spawnedBy: def.id,
        x: from.x + dir * p.offset,
        hp: 1,
        maxHp: 1,
        ap: 0,
        posture: p.impact.zone === "legs" ? "crouching" : "standing",
        actions: [],
        reaction: null,
        combo: 0,
        idleDown: 0,
        expiresAt: s.tick + p.lifetime,
        dir,
        bornAt: s.tick
      };
      s.units.push(obj);
      emit(from, { type: "released", action: def.id, target: obj.id });
    }
  }
  function isArmStrike(def) {
    return def.kind === "strike" && !def.channels.includes("legs");
  }
  function dodges(target, zone, data) {
    if (target.posture === "grounded") return true;
    if (zone === "head" && (target.posture === "crouching" || charOf(target, data).low)) return true;
    if (zone === "legs" && target.posture === "airborne") return true;
    return false;
  }
  function connects(att, target, def, data) {
    const spec = def.hit;
    if (!spec) return false;
    const d = Math.abs(att.x - target.x);
    if (d < spec.reach[0] || d > spec.reach[1]) return false;
    if (def.kind === "grab") return target.posture !== "grounded" && target.posture !== "airborne";
    return !dodges(target, spec.zone, data);
  }
  function pickTarget(s, u, def, data) {
    const dir = facingOf(s, u);
    let best;
    for (const v of s.units) {
      if (v.team === u.team || !isBody(v)) continue;
      if ((v.x - u.x) * dir < 0) continue;
      if (!connects(u, v, def, data)) continue;
      if (!best || Math.abs(v.x - u.x) < Math.abs(best.x - u.x)) best = v;
    }
    return best;
  }
  function blockCovers(posture, zone) {
    if (posture === "crouching") return zone !== "head";
    return zone !== "legs";
  }
  function activeOf(u, kind, data) {
    return u.actions.find((i) => data.actions[i.id].kind === kind && phaseOf(i) === "active");
  }
  function defend(attacker, target, impact, fromX, action, inst, s, data, isGrab = false, power = 1) {
    const r = data.rules;
    const base2 = impact.damage * power;
    const out = { attacker, defender: target.id, inst, action, impact, fromX };
    if (isGrab) return { ...out, kind: "grabbed", damage: Math.round(base2) };
    const fromObject = s.units.find((u) => u.id === attacker)?.kind === "object";
    if (!fromObject && activeOf(target, "parry", data) && impact.weight !== "heavy" && impact.zone !== "legs") {
      return { ...out, kind: "parried", damage: 0 };
    }
    if (activeOf(target, "block", data) && blockCovers(target.posture, impact.zone)) {
      return { ...out, kind: "blocked", damage: Math.round(base2 * (1 - r.blockReduction[impact.weight])) };
    }
    return { ...out, kind: "hit", damage: Math.round(base2 * r.zoneDamage[impact.zone]) };
  }
  function applyReactions(u, list, wasReacting, data, emit) {
    const r = data.rules;
    const wasHit = list.some((x) => x.wasHit);
    if (wasHit) u.combo = wasReacting ? u.combo + 1 : 0;
    const rank = (x) => x.kind === "knockdown" || x.kind === "thrown" ? 3 : x.kind === "backfoot" ? 2 : 1;
    const top = list.reduce((best, x) => {
      if (rank(x.reaction) !== rank(best.reaction)) return rank(x.reaction) > rank(best.reaction) ? x : best;
      const tx = "ticks" in x.reaction ? x.reaction.ticks : 0;
      const tb = "ticks" in best.reaction ? best.reaction.ticks : 0;
      return tx > tb ? x : best;
    });
    const reaction = top.reaction;
    if (wasHit) u.actions = [];
    const airborneHit = wasHit && u.posture === "airborne";
    if (reaction.kind === "knockdown" || reaction.kind === "thrown" || airborneHit) {
      u.actions = [];
      u.posture = "grounded";
      u.reaction = { kind: "down", left: r.downTicks, fresh: true };
      u.idleDown = 0;
      emit({ type: "knockdown", detail: airborneHit && reaction.kind === "stagger" ? "hit out of the air" : reaction.kind });
      return;
    }
    const extra = top.wasHit ? r.zoneStagger[top.zone] : 0;
    const ticks = Math.max(r.minStagger, reaction.ticks + extra - r.comboDecay * u.combo);
    if (reaction.kind === "backfoot" && u.posture !== "grounded") u.posture = "backfoot";
    u.reaction = { kind: top.wasHit ? "stagger" : "blockstun", left: ticks, fresh: true };
  }
  function push(s, data, fromX, att, target, amount) {
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
  function separate(s, data, startX) {
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
          if (mid - bw / 2 < min) {
            L.x = min;
            R.x = min + bw;
          } else if (mid + bw / 2 > max) {
            R.x = max;
            L.x = max - bw;
          } else {
            L.x = mid - bw / 2;
            R.x = mid + bw / 2;
          }
        }
      }
      for (const u of bodies) u.x = Math.min(max, Math.max(min, u.x));
    }
  }

  // src/sim/query.ts
  function threatsAgainst(s, unitId, data) {
    const me = unitById(s, unitId);
    if (!me || !isBody(me)) return [];
    const r = data.rules;
    const out = [];
    const bodies = s.units.filter(isBody);
    const firstAhead = (x, dir, skip) => bodies.filter((v) => v.id !== skip && (v.x - x) * dir > 0).sort((a, b) => (a.x - x) * dir - (b.x - x) * dir)[0];
    const push2 = (src, action, name, kind, impact, until, inReach, power) => out.push({
      source: src.id,
      sourceName: src.name,
      action,
      name,
      kind,
      zone: impact.zone,
      weight: impact.weight,
      ticksUntilActive: until,
      inReach,
      damage: Math.round(impact.damage * power * r.zoneDamage[impact.zone]),
      blockedDamage: Math.round(impact.damage * power * (1 - r.blockReduction[impact.weight])),
      onHit: impact.onHit,
      answers: answersFor(kind, impact.zone, impact.weight)
    });
    for (const e of bodies) {
      if (e.team === me.team) continue;
      const dir = facingOf(s, e);
      const ch = charOf(e, data);
      for (const inst of e.actions) {
        const def = data.actions[inst.id];
        const until = ticksUntilActive(inst);
        if (until === null) continue;
        if ((def.kind === "strike" || def.kind === "grab") && def.hit && !inst.hasHit) {
          const mine = bodies.filter((v) => v.team === me.team && (v.x - e.x) * dir >= 0).sort((a, b) => Math.abs(a.x - e.x) - Math.abs(b.x - e.x))[0];
          if (!mine || mine.id !== me.id) continue;
          const total = Math.round((def.move ?? 0) * ch.moveMul);
          const span = inst.windup + inst.active;
          const hitIdx = Math.max(inst.t, inst.windup);
          const movedAtHit = span > 0 ? Math.round(total * (Math.min(hitIdx, span - 1) + 1) / span) : 0;
          const projected = Math.max(r.bodyWidth, Math.abs(me.x - e.x) - (movedAtHit - inst.movedSoFar));
          const inReach = projected >= def.hit.reach[0] - 5 && projected <= def.hit.reach[1] + 5;
          push2(e, def.id, def.name, def.kind, def.hit, until, inReach, ch.power);
        }
        if (def.projectile && inst.t <= inst.windup && phaseOf(inst) !== "cancel") {
          const p = def.projectile;
          const releaseX = e.x + dir * p.offset;
          const first = firstAhead(releaseX - dir * p.radius, dir, e.id);
          if (!first || first.id !== me.id) continue;
          const gap = Math.max(0, Math.abs(me.x - releaseX) - r.bodyWidth / 2 - p.radius);
          const travel = Math.max(1, Math.ceil(gap / p.speed));
          push2(e, def.id, `${p.name} (${def.name})`, "projectile", p.impact, until + travel, true, 1);
        }
      }
    }
    for (const o of s.units) {
      if (o.kind !== "object") continue;
      const p = data.actions[o.char].projectile;
      const dir = o.dir ?? 1;
      const first = firstAhead(o.x - dir * p.radius, dir, o.owner);
      if (!first || first.id !== me.id) continue;
      const gap = Math.max(0, Math.abs(me.x - o.x) - r.bodyWidth / 2 - p.radius);
      const arrive = Math.max(1, Math.ceil(gap / p.speed));
      push2(o, o.char, p.name, "projectile", p.impact, arrive - 1, true, 1);
    }
    return out.sort((a, b) => a.ticksUntilActive - b.ticksUntilActive);
  }
  function answersFor(kind, zone, weight) {
    if (kind === "grab") return ["strike first", "jump"];
    const out = [];
    if (zone === "head") out.push("duck", "block");
    if (zone === "body") out.push("block");
    if (zone === "legs") out.push("jump", "duck and block");
    if (kind === "strike" && weight !== "heavy" && zone !== "legs") out.push("intercept");
    if (kind === "strike") out.push("step back");
    if (kind === "projectile" && weight === "heavy") out.push("get out of its path");
    return out;
  }
  function ticksUntilFree(s, unitId, data) {
    const u = unitById(s, unitId);
    if (!u) return 0;
    if (u.reaction) return u.reaction.left;
    let worst = 0;
    for (const inst of u.actions) {
      const kind = data.actions[inst.id].kind;
      if (kind === "move" || kind === "posture") continue;
      if (phaseOf(inst) === "recovery") worst = Math.max(worst, inst.windup + inst.active + inst.recovery - inst.t);
    }
    return worst;
  }

  // src/sim/match.ts
  function runMatch(opts) {
    const { chars, controllers, data } = opts;
    let state = createMatch(chars[0], chars[1], data);
    const frames = opts.record ? [{ state, commits: {}, events: [] }] : void 0;
    const events = [];
    const freeTicks = [0, 0];
    let decisionTicks = 0;
    const limit = data.rules.maxTicks + 5;
    while (!state.over && state.tick < limit) {
      const commits = {};
      let anyFree = false;
      for (const team of [0, 1]) {
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
    const leaders = [0, 1].map((t) => state.units.find((u) => u.team === t && u.leader));
    return {
      chars,
      winner: state.winner ?? "draw",
      endReason: state.endReason ?? "timeout",
      ticks: state.tick,
      hp: [leaders[0].hp, leaders[1].hp],
      events,
      freeTicks,
      decisionTicks,
      frames
    };
  }

  // src/ai/rng.ts
  function makeRng(seed) {
    let a = seed >>> 0;
    return () => {
      a = a + 1831565813 >>> 0;
      let t = a;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function weighted(rng, options) {
    const live = options.filter(([, w]) => w > 0);
    const total = live.reduce((sum, [, w]) => sum + w, 0);
    if (total <= 0) return null;
    let roll = rng() * total;
    for (const [value, w] of live) {
      roll -= w;
      if (roll < 0) return value;
    }
    return live[live.length - 1][0];
  }

  // src/ai/controllers.ts
  var AI_KINDS = ["reader", "random", "idle"];
  function makeController(kind, seed) {
    const rng = makeRng(seed);
    const unit = (s, id, d) => {
      const u = unitById(s, id);
      if (!u || !canAct(s, u)) return [];
      if (kind === "idle") return [];
      if (kind === "random") return randomDecide(s, u, d, rng);
      return readerDecide(s, u, d, rng);
    };
    return {
      name: kind,
      decideUnit: unit,
      decide(s, team, d) {
        const out = {};
        for (const u of teamUnits(s, team)) {
          const c = unit(s, u.id, d);
          if (c.length) out[u.id] = c;
        }
        return out;
      }
    };
  }
  var CommitBuilder = class {
    constructor(s, u, data) {
      this.s = s;
      this.u = u;
      this.data = data;
      this.busy = busyChannels(u, data);
      this.ap = apAvailable(u, data, s);
    }
    s;
    u;
    data;
    commit = [];
    busy;
    ap;
    add(id) {
      if (!id || id === "wait") return false;
      if (whyNot(this.s, this.u.id, id, this.data, { busy: this.busy, apLeft: this.ap }) !== null) return false;
      const def = this.data.actions[id];
      this.commit.push({ type: "start", action: id });
      for (const c of def.channels) this.busy.add(c);
      this.ap -= def.ap;
      return true;
    }
  };
  function randomDecide(s, u, data, rng) {
    if (rng() < 0.4) return [];
    const b = new CommitBuilder(s, u, data);
    const legal = legalStarts(s, u.id, data);
    if (!legal.length) return [];
    b.add(legal[Math.floor(rng() * legal.length)]);
    if (rng() < 0.25) b.add(legal[Math.floor(rng() * legal.length)]);
    return b.commit;
  }
  var NEUTRAL = {
    jab: 4,
    cross: 3,
    hook: 3,
    lowkick: 3,
    sweep: 1.5,
    roundhouse: 1,
    jumpkick: 0.7,
    grab: 3,
    bite: 4,
    claw: 3,
    pounce: 1.5,
    block: 2,
    parry: 0.5,
    crouch: 0.6
  };
  function readerDecide(s, me, data, rng) {
    const opp = nearestEnemy(s, me);
    if (!opp) return [];
    const b = new CommitBuilder(s, me, data);
    const ok = (id) => whyNot(s, me.id, id, data) === null;
    const w = (id) => durations(data.actions[id], charOf(me, data)).windup;
    const asStanding = opp.posture === "grounded" ? { ...opp, posture: "standing" } : opp;
    const reaches = (id) => opp.posture === "grounded" ? connects(me, asStanding, data.actions[id], data) : !!pickTarget(s, me, data.actions[id], data);
    const leaderBonus = (id) => pickTarget(s, me, data.actions[id], data)?.leader ? 1.6 : 1;
    const moves = charOf(me, data).moves;
    const strikes = moves.filter((id) => data.actions[id].kind === "strike" || data.actions[id].kind === "grab");
    const choose = (opts2) => weighted(rng, opts2.filter(([id]) => id === "wait" || moves.includes(id) && ok(id)));
    const d = Math.abs(opp.x - me.x);
    if (me.posture === "grounded") {
      if (me.actions.length) return [];
      b.add(choose([["getup_quick", 5], ["getup_slow", 2], ["getup_roll", 3]]));
      return b.commit;
    }
    const threat = threatsAgainst(s, me.id, data).find((t) => t.inReach);
    if (threat) {
      const time = threat.ticksUntilActive;
      const heavy = threat.weight === "heavy";
      const melee = threat.kind !== "projectile";
      const inTime = (id) => moves.includes(id) && ok(id) && w(id) <= time;
      const opts2 = [];
      if (melee) {
        for (const id of strikes) if (ok(id) && reaches(id) && w(id) < time) opts2.push([id, data.actions[id].hit.damage / 3]);
      }
      if (threat.zone === "head") {
        if (me.posture === "standing" && inTime("crouch")) opts2.push(["crouch", heavy ? 8 : 4]);
        if (inTime("block")) opts2.push(["block", heavy ? 1.5 : 3]);
        if (melee && !heavy && inTime("parry")) opts2.push(["parry", 2]);
      } else if (threat.zone === "body") {
        if (inTime("block")) opts2.push(["block", heavy ? 1.5 : 4]);
        if (melee && !heavy && inTime("parry")) opts2.push(["parry", 2]);
        if (!melee && inTime("jump")) opts2.push(["jump", 1]);
      } else {
        if (inTime("jump")) opts2.push(["jump", 3]);
        if (me.posture === "crouching" && inTime("block")) opts2.push(["block", 4]);
      }
      if (melee && inTime("step_back")) opts2.push(["step_back", heavy ? 4 : 2]);
      if (melee) {
        for (const id of strikes) {
          const h = data.actions[id].hit;
          if (h && ok(id) && reaches(id) && w(id) === time && h.zone !== threat.zone && h.damage * data.rules.zoneDamage[h.zone] > threat.damage) opts2.push([id, 1.5]);
        }
      }
      const pick2 = weighted(rng, opts2);
      if (pick2) {
        b.add(pick2);
        if (pick2 === "crouch" && rng() < 0.3) b.add("block");
        return b.commit;
      }
    }
    if (opp.posture === "grounded") {
      const getup = opp.actions.find((i) => data.actions[i.id].sets === "standing");
      const standsIn = getup ? ticksUntilActive(getup) : null;
      if (standsIn !== null) {
        const meaty = strikes.filter((id) => ok(id) && reaches(id) && w(id) === standsIn);
        const pick2 = weighted(rng, meaty.map((id) => [id, data.actions[id].hit.damage]));
        if (pick2 && rng() < 0.7) {
          b.add(pick2);
          return b.commit;
        }
      }
      if (d > 120) b.add(choose([["step_fwd", 3], ["wait", 2]]));
      return b.commit;
    }
    const stuck = ticksUntilFree(s, opp.id, data);
    if (stuck > 0) {
      const fits = strikes.filter((id) => ok(id) && reaches(id) && w(id) <= stuck && data.actions[id].kind !== "grab");
      if (fits.length) {
        const pick2 = weighted(rng, fits.map((id) => {
          const h = data.actions[id].hit;
          return [id, h.damage + (h.onHit.kind === "knockdown" ? 6 : 0)];
        }));
        if (pick2) {
          b.add(pick2);
          return b.commit;
        }
      }
      if (d > 110 && ok("dash") && w("dash") + 2 <= stuck) {
        b.add("dash");
        return b.commit;
      }
    }
    if (me.posture === "backfoot") {
      b.add(choose([["recover", 5], ["block", 2], ["jab", reaches("jab") ? 1 : 0], ["step_back", 1.5], ["wait", 1]]));
      return b.commit;
    }
    if (me.posture === "crouching") {
      b.add(choose([["stand", 4], ["hook", reaches("hook") ? 2 : 0], ["sweep", reaches("sweep") ? 2 : 0], ["bite", reaches("bite") ? 2 : 0], ["jab", reaches("jab") ? 1 : 0], ["block", 1], ["wait", 1]]));
      return b.commit;
    }
    const specials = [];
    for (const id of moves) {
      const def = data.actions[id];
      if (def.kind === "summon") specials.push([id, d > 120 ? 4 : 0.5]);
      if (def.kind === "throw" && def.projectile) specials.push([id, def.projectile.speed >= 150 ? d > 90 ? 3 : 1 : d > 160 ? 3 : 0.3]);
    }
    if (specials.length && rng() < 0.45) {
      const pick2 = choose(specials);
      if (pick2) {
        b.add(pick2);
        return b.commit;
      }
    }
    if (me.ap < 4 && rng() < 0.35) return [];
    if (d > 135) {
      b.add(choose([["step_fwd", 5], ["dash", 3], ["jump_fwd", 0.6], ["wait", 2]]));
      return b.commit;
    }
    const opts = [];
    for (const id of moves) {
      const def = data.actions[id];
      if (def.kind === "strike" || def.kind === "grab") opts.push([id, reaches(id) ? (NEUTRAL[id] ?? 2.5) * leaderBonus(id) : 0]);
      else if (NEUTRAL[id] !== void 0) opts.push([id, NEUTRAL[id]]);
    }
    opts.push(["step_back", d < 60 ? 2.5 : 1], ["step_fwd", d > 100 ? 2 : 0.3], ["wait", 2]);
    const pick = choose(opts);
    if (pick && pick !== "wait") {
      b.add(pick);
      if (pick === "lowkick" && reaches("jab") && rng() < 0.3) b.add("jab");
      if (pick === "block" && rng() < 0.25) b.add("crouch");
    }
    return b.commit;
  }
  return __toCommonJS(browser_exports);
})();
