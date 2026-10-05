// Everything the browser viewer needs, bundled into viewer/sim.bundle.js as the global `TickSim`.
// Rebuild after changing the engine or data: npm run build:viewer

export { DEFAULT_DATA, cloneData, applyOverride } from './sim/data.ts';
export * from './sim/engine.ts';
export { threatsAgainst, ticksUntilFree, answersFor, forecastAction, forecastObject } from './sim/query.ts';
export { runMatch } from './sim/match.ts';
export { makeController, AI_KINDS } from './ai/controllers.ts';
