export * from './access_1';
export * from './access_2';

// Run-related helpers that some card files import via `coreAccess.*` because
// the CLJ namespaces folded them under `game.core`. Re-export from runs.ts so
// existing call sites resolve without changing the imports.
export { preventAccess, successfulRunReplaceBreach } from './runs';
