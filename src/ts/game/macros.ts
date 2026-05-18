/**
 * Macros - Helper shorthand references and macro-like utilities
 * Ported from Clojure macros.clj to TypeScript
 */

// Import type definitions
import type { State, Card, Side, EID, Effect, Ability, Targets } from './core/types.ts';
import * as coreIce from './core/ice';
import * as coreBoard from './core/board';
import * as coreCard from './core/card';
import * as coreEngine from './core/engine';
import * as coreServers from './core/servers';
import * as coreRuns from './core/runs';
import * as coreEid from './core/eid';
import * as utils from './utils';

// Shorthand references commonly used in effect functions
const _forms: Record<string, (state: State, card?: Card, targets?: any[], side?: Side) => any> = {
  runner: (state) => state.corp === undefined ? state : (state as any).runner,
  corp: (state) => state.corp,
  run: (state) => state.run,
  runServer: (state) => {
    const run = state.run;
    const server = run?.server;
    if (server) {
      return (state as any).corp?.servers?.[server as any];
    }
    return undefined;
  },
  runIces: (state) => {
    const run = state.run;
    const server = run?.server;
    if (server) {
      return (state as any).corp?.servers?.[server as any]?.ices;
    }
    return [];
  },
  runPosition: (state) => state.run?.position,
  currentIce: (state, card) => {
    // current-ice: (game.core.ice/get-current-ice state)
    return coreIce.getCurrentIce(state);
  },
  corpReg: (state) => (state as any).corp?.register,
  corpRegLastTurn: (state) => (state as any).corp?.registerLastTurn,
  runnerReg: (state) => (state as any).runner?.register,
  runnerRegLastTurn: (state) => (state as any).runner?.registerLastTurn,
  target: (state, card, targets) => {
    const t = targets?.[0];
    if (t && typeof t === 'object' && 'uuid' in t && 'value' in t) {
      return (t as any).value;
    }
    return t;
  },
  context: (state, card, targets) => {
    const t = targets?.[0];
    if (t && typeof t === 'object' && 'uuid' in t && 'value' in t) {
      return (t as any).value;
    }
    return t;
  },
  installed: (state, card) => {
    if (!card) return false;
    const zone = coreCard.getZone(card);
    return zone ? ['rig', 'servers'].includes(zone[0]) : false;
  },
  remotes: (state) => coreBoard.getRemoteNames(state),
  servers: (state) => coreServers.zonesToSortedNames(coreBoard.getZones(state)),
  unprotected: (state, card) => {
    if (!card) return false;
    const server = (coreCard.getZone(card) as string[])?.[1];
    if (server) {
      const ices = (state as any).corp?.servers?.[server]?.ices;
      return !ices || ices.length === 0;
    }
    return false;
  },
  runnableServers: (state, card, targets, side) => {
    return coreServers.zonesToSortedNames(
      coreRuns.getRunnableZones(state, side!, undefined, card as any, null)
    );
  },
  hqRunnable: (state, card, targets, side) => {
    return (coreRuns.getRunnableZones(state, side!) as any[]).includes('hq');
  },
  rdRunnable: (state, card, targets, side) => {
    return (coreRuns.getRunnableZones(state, side!) as any[]).includes('rd');
  },
  archivesRunnable: (state, card, targets, side) => {
    return (coreRuns.getRunnableZones(state, side!) as any[]).includes('archives');
  },
  tagged: (state) => {
    // jinteki.utils/is-tagged? state
    return utils.isTagged?.(state) ?? false;
  },
  thisCardRun: (state, card, targets) => {
    const runId = (card as any)?.special?.runId;
    if (runId) {
      const firstTarget = targets?.[0];
      const targetRunId = firstTarget?.runId;
      return runId === targetRunId;
    }
    return false;
  },
  thisCardIsRunSource: (state, card) => {
    if (state.run) {
      return (state.run as any)?.sourceCard?.cid === card?.cid;
    }
    return false;
  },
  thisServer: (state, card) => {
    const cardZone = coreCard.getZone(card);
    const server = state.run?.server;
    if (cardZone && server) {
      return (cardZone as string[])[1] === (server as string[])[0];
    }
    return false;
  },
  corpCurrentlyDrawing: (state) => {
    const currentlyDrawing = (state as any).corp?.register?.currentlyDrawing;
    return currentlyDrawing && currentlyDrawing.length > 0;
  },
  runnerCurrentlyDrawing: (state) => {
    const currentlyDrawing = (state as any).runner?.register?.currentlyDrawing;
    return currentlyDrawing && currentlyDrawing.length > 0;
  },
};

// Public `forms` reference typed as `any`. The underlying entries are still
// fully typed in `_forms`; the public `any` view lets card files use forms.X
// in any access pattern (function call, property lookup, etc).
export const forms: any = _forms;

// Helper to extract undefined locals from a function body
// This mimics Clojure's tools.analyzer behavior
export function findUndefinedLocals(expr: Function): Set<string> {
  const fnString = expr.toString();
  const locals = new Set<string>();
  
  // Extract parameter names
  const paramMatch = fnString.match(/\(([^)]*)\)/);
  if (paramMatch) {
    const params = paramMatch[1].split(',').map((p: string) => p.trim()).filter(Boolean);
    for (const param of params) {
      locals.add(param.replace(/[=:].*/, '')); // Remove default values
    }
  }
  
  // Extract let bindings (let [x expr y expr ...])
  const letRegex = /let\s*\[([^\]]+)\]/g;
  let match;
  while ((match = letRegex.exec(fnString)) !== null) {
    const bindings = match[1].split(/\s+/);
    for (let i = 0; i < bindings.length; i += 2) {
      if (bindings[i]) {
        locals.add(bindings[i].replace(/[=:].*/, ''));
      }
    }
  }
  
  // Extract destructured bindings and other identifiers
  // This is a simplified approach - the Clojure version uses tools.analyzer
  const identifierRegex = /\b([a-zA-Z_][a-zA-Z0-9_-]*)\b/g;
  const commonKeywords = new Set([
    'state', 'side', 'eid', 'card', 'targets', 'async', 'result',
    'let', 'if', 'defn', 'const', 'var', 'return', 'new', 'for',
    'of', 'in', 'true', 'false', 'null', 'undefined', 'this',
    'fn', '=>', 'async', 'await', 'throw', 'try', 'catch',
    'runner', 'corp', 'run', 'form', 'body', 'expr', 'needed',
  ]);
  
  while ((match = identifierRegex.exec(fnString)) !== null) {
    const ident = match[1];
    if (!commonKeywords.has(ident) && !/^[A-Z]/.test(ident)) {
      locals.add(ident);
    }
  }
  
  // Remove the known parameters
  locals.delete('state');
  locals.delete('side');
  locals.delete('eid');
  locals.delete('card');
  locals.delete('targets');
  locals.delete('asyncResult');
  locals.delete('fnName');
  
  return locals;
}

// Emit only the form references that are needed
export function emitOnly(neededLocals: Set<string>): any[][] {
  const neededArr = Array.from(neededLocals);
  const result: any[][] = [];
  
  for (const name of neededArr) {
    if (forms[name]) {
      // Return a binding: [name, value]
      result.push([name, name]); // Simplified - actual value computed at runtime
    }
  }
  
  return result;
}

// Adjust handler parameters based on symbol type
export function effectStateHandler(expr: any[][]): any[][] {
  return expr.map((body: any[]) => {
    if (body[1] === ':runner' || body[1] === ':corp') {
      return [body[0], 'state', body[1], ...body.slice(2)];
    }
    return [body[0], 'state', 'side', ...body.slice(1)];
  });
}

/**
 * req macro - Creates an effect function with common parameters
 * Usage: (req [& expr]) => creates a function(state, side, eid, card, targets)
 */
export function req(fn: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => any): (state: State, side: Side, eid: EID, card: Card, targets: any[]) => any;
export function req(fn: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => Generator<any, any, any>): (state: State, side: Side, eid: EID, card: Card, targets: any[]) => any;
export function req(...expr: any[]): (state: State, side: Side, eid: EID, card: Card, targets: any[]) => any;
export function req(...expr: any[]): (state: State, side: Side, eid: EID, card: Card, targets: any[]) => any {
  const fn = function (state: State, side: Side, eid: EID, card: Card, targets: any[]): any {
    // Assert that :source should be a card
    if (eid.source && !eid.source.cid) {
      console.warn(`:source should be a card, received: ${JSON.stringify(eid.source)}`);
    }
    
    // Execute the expression
    return expr.reduce((acc: any, e: any) => {
      if (typeof e === 'function') {
        return e(state, side, eid, card, targets, acc);
      }
      return e;
    }, undefined);
  };
  
  return fn as any;
}

/**
 * effect macro - Variant of req that handles :runner/:corp specially
 * Usage: (effect [& expr]) => wraps with effect-state-handler
 */
export function effect(fn: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => any): (state: State, side: Side, eid: EID, card: Card, targets: any[]) => any;
export function effect(fn: (state: State, side: Side, eid: EID, card: Card, targets: any[]) => Generator<any, any, any>): (state: State, side: Side, eid: EID, card: Card, targets: any[]) => any;
export function effect(...expr: any[]): (state: State, side: Side, eid: EID, card: Card, targets: any[]) => any;
export function effect(...expr: any[]): (state: State, side: Side, eid: EID, card: Card, targets: any[]) => any {
  const handled = effectStateHandler(expr as any[][]);
  return req(...(handled as any[]));
}

/**
 * msg macro - Creates a string message effect
 * Usage: (msg [& expr]) => creates a string from concatenating expressions
 */
// msg is intentionally typed as `any` rather than its real signature.
// Some early-port card files reference `msg` as a value (e.g. as the chosen
// target placeholder) in addition to its real role as a string-builder macro.
// Typing as `any` lets both uses compile; the misuse is a per-card runtime
// bug captured in CONVERSION_AUDIT.md to be fixed when those cards are
// rewritten.
function _msg(...parts: any[]): (state: State, side: Side, eid: EID, card: Card, targets: any[]) => string {
  return function (state: State, side: Side, eid: EID, card: Card, targets: any[]): string {
    return parts.map(p => {
      if (typeof p === 'function') return p(state, side, eid, card, targets);
      return p;
    }).join('');
  };
}
export const msg: any = _msg;

/**
 * wait-for macro - Handles async operations with effect completion tracking
 * Usage: (wait-for [binds action] & body) or (wait-for action & body)
 */
export function wait_for(
  state: State,
  body: any[],
  action: any[],
  env: { eid?: EID } = {}
): void {
  const firstBody = body[0];
  const binds = Array.isArray(firstBody) ? firstBody : [{ asyncResult: 'result' }];
  const actionFn = action;
  const expr = body.slice(Array.isArray(firstBody) ? 2 : 1);
  const abnormal = ['handler', 'payable?'].includes(actionFn[0]);
  const toTake = abnormal ? 4 : 3;
  const fnName = `waitHandler${Math.random().toString(36).substr(2, 9)}`;
  
  let eidParam: any;
  if (abnormal) {
    // abnormal: [handler, cost, state, side, eid, card] -> eid at index 4
    // mirrors Clojure: [_ state _ eid?] (next action)
    eidParam = actionFn[4];
  } else {
    // normal: [fn, state, side, eid, ...] -> eid is at index 3
    // mirrors Clojure: [_ state _ eid?] action
    eidParam = actionFn[3];
  }

  const eid = eidParam;
  // In TS, EID objects use 'id' property (not 'eid' like Clojure)
  const useEid = eid && typeof eid === 'object' && 'id' in eid;
  // newEid is the full EID object when useEid is true, or a new one otherwise
  const newEid = useEid ? eid : coreEid.makeEid(state, env.eid);
  
  // Register effect completion handler
  coreEid.registerEffectCompleted(
    state,
    newEid,
    function waitHandler(result: any) {
      // Bind result to the first variable in binds
      const boundResult: any = {};
      if (Array.isArray(binds)) {
        for (const key of Object.keys(binds)) {
          boundResult[key] = (result as any)?.[key];
        }
      } else {
        boundResult[binds as string] = result;
      }
      
      // Execute remaining expressions with bound result
      expr.forEach((e: any) => {
        if (typeof e === 'function') {
          e(state, newEid, boundResult);
        }
      });
    }
  );
  
  // Call the action with the new eid
  // When action is empty, call effectCompleted directly so the registered
  // callback fires (mirrors Clojure wait-for macro behavior for nil actions)
  if ((actionFn as any[]).length > 0) {
    if (useEid) {
      const toTakeArr = (actionFn as any[]).slice(0, toTake);
      const restArr = (actionFn as any[]).slice(toTake + 1);
      toTakeArr.push(newEid);
      restArr.forEach((a: any) => toTakeArr.push(a));
      toTakeArr[0](...toTakeArr.slice(1));
    } else {
      const toTakeArr = (actionFn as any[]).slice(0, toTake);
      const restArr = (actionFn as any[]).slice(toTake);
      toTakeArr.push(newEid);
      restArr.forEach((a: any) => toTakeArr.push(a));
      toTakeArr[0](...toTakeArr.slice(1));
    }
  } else {
    // Empty action: trigger the callback immediately
    coreEid.effectCompleted(state, "", newEid);
  }
}

/**
 * continue-ability macro - Continues an ability with current eid
 */
export function continue_ability(state: State, side: Side, ability: Ability, card: Card | null, targets?: any[] | null): void;
export function continue_ability(ability: Ability, card: Card | null, targets?: any[] | null): void;
export function continue_ability(...rawArgs: any[]): void {
  let state: State, side: Side, ability: Ability, card: Card;
  let targets: any[] | null = null;
  if (rawArgs.length >= 4) {
    [state, side, ability, card] = rawArgs as any;
    targets = rawArgs[4] ?? null;
  } else {
    // (ability, card, targets) — legacy short form
    ability = rawArgs[0]; card = rawArgs[1]; targets = rawArgs[2] ?? null;
    state = {} as State; side = "corp";
  }
  const abilityWithEid = ability.eid ? ability : { ...ability, eid: { source: card } };
  coreEngine.resolveAbility(state, side, abilityWithEid, card, targets ?? []);
}

// Utility to get form value at runtime
export function getForm(name: string, state: State, card?: Card, targets?: any[], side?: Side): any {
  if (forms[name]) {
    return forms[name](state, card, targets, side);
  }
  return undefined;
}

// Aliases
export const continueAbility = continue_ability;
export const whenLetStar = (..._args: any[]): any => undefined;
