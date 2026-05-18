// Run mechanics.
// Mirrors: src/clj/game/core/runs.clj

import type { GameState, RunState, Encounter } from "./state";
import type { Card } from "./card";
import type { EID } from "./eid";
import type { Ability } from "./types";
import {
  breachServer,
} from "./access_2";
import {
  cardToServer,
  getZones,
  serverToZone,
} from "./board";
import { getZone, rezzed } from "./card";
import { cardDef } from "./card_defs";
import {
  jackOutCost,
  runCost,
  runAdditionalCostBonus,
} from "./cost_fns";
import { anyEffects, getEffects } from "./effects";
import {
  completeWithResult,
  effectCompleted,
  makeEID,
  makeEIDFrom,
} from "./eid";
import {
  pay,
  resolveAbility,
} from "./engine_1";
import {
  registerPendingEvent,
  triggerEvent,
} from "./engine_2";
import { queueEvent, triggerEventSimult } from "./engine_3";
import { getCard } from "./finding";
import { checkpoint } from "./checkpoint";
import {
  canRun,
  clearRunRegister,
} from "./flags";
import { gainCredits } from "./gaining";
import {
  allSubsBroken,
  getCurrentIce,
  getRunIces,
  isActiveIce,
  resetAllIce,
  resetAllSubs,
  setCurrentIce,
  updateIceStrength,
} from "./ice_1";
import { isMark } from "./mark";
import {
  buildCostString,
  buildSpendMsg,
  canPay,
  mergeCosts,
  toC,
  type CostData,
} from "./payment";
import {
  resolveEncounterPrevention,
  resolveEndRunPrevention,
  resolveJackOutPrevention,
} from "./prevention_2";
import {
  clearRunPrompts,
  clearWaitPrompt,
  showRunPrompts,
  showWaitPrompt,
} from "./prompts";
import { playSfx, systemMsg, nLastLogs } from "./say";
import {
  isRemote,
  targetServer,
  unknownToKw,
  zoneToName,
} from "./servers";
import { updateAllSubtypes } from "./subtypes";
import { cardStr } from "./to_string";
import { update } from "./update";
import { wait_for } from "../macros";
import { sameCard } from "../utils";
import { countBadPub } from "../../jinteki/utils";

// ---------------------------------------------------------------------------
// Forward declarations (mirrors `declare` in Clojure)
// ---------------------------------------------------------------------------
// handle-end-run, jack-out, forced-encounter-cleanup, run-cleanup,
// gain-run-credits, pass-ice, successful-run

// ---------------------------------------------------------------------------
// total-run-cost
// Mirrors: total-run-cost in runs.clj
// ---------------------------------------------------------------------------
export function totalRunCost(
  state: GameState,
  side: string,
  card: Card | null,
  args?: { clickRun?: boolean; ignoreCosts?: boolean; server?: string } | null,
): CostData[] | null {
  const ignoreCosts = !!args?.ignoreCosts;
  const clickRun = !!args?.clickRun;
  const baseCost = card ? runCost(state, side, card, {}, []) : 0;
  const cost =
    typeof baseCost === "number" && baseCost > 0 && !ignoreCosts
      ? toC("credit", baseCost)
      : null;
  const additionalCosts = card ? runAdditionalCostBonus(state, side, card, []) : [];
  const clickRunCost = clickRun ? toC("click", 1) : null;
  if (ignoreCosts) return null;
  return mergeCosts(
    [clickRunCost, cost, ...(Array.isArray(additionalCosts) ? additionalCosts : [])]
      .filter(Boolean) as CostData[],
  );
}

// ---------------------------------------------------------------------------
// make-phase-eid (private)
// Mirrors: make-phase-eid in runs.clj
// ---------------------------------------------------------------------------
function makePhaseEID(state: GameState, eid: EID | null): EID {
  if (eid) return eid;
  return makeEIDFrom(state, state.run?.eid ?? null);
}

// ---------------------------------------------------------------------------
// get-runnable-zones
// Mirrors: get-runnable-zones in runs.clj
// ---------------------------------------------------------------------------
export function getRunnableZones(
  state: GameState,
  side: string = "runner",
  eid?: EID | null,
  card?: Card | null,
  args?: { zones?: string[]; ignoreCosts?: boolean } | null,
): string[] {
  const effEid = eid ?? makeEID(state);
  const effCard = card ?? null;
  const ignoreCosts = !!args?.ignoreCosts;
  const restrictedRaw = getEffects(state, side, "cannot-run-on-server", null, []) as unknown[];
  const restrictedZones = new Set<string>(
    (restrictedRaw.flat(Infinity) as unknown[]).filter(
      (z): z is string => typeof z === "string",
    ),
  );
  const candidate = args?.zones ?? getZones(state);
  const permitted = candidate.filter((z) => !restrictedZones.has(z));
  if (ignoreCosts) return permitted;
  return permitted.filter((z) => {
    const cost = totalRunCost(state, side, effCard, { server: unknownToKw(z) });
    return canPay(state, "runner", effEid, effCard, null, cost ?? []) !== null;
  });
}

export function canRunServer(state: GameState, server: unknown): boolean {
  const kw = unknownToKw(server);
  return getRunnableZones(state).some((z) => z === kw);
}

// ---------------------------------------------------------------------------
// Encounter helpers
// ---------------------------------------------------------------------------

export function getCurrentEncounter(state: GameState): Encounter | undefined {
  const encs = state.encounters ?? [];
  return encs.length > 0 ? encs[encs.length - 1] : undefined;
}

/**
 * Encounter is active when there is a current encounter and there is an active ice.
 * Mirrors: active-encounter?
 */
export function activeEncounter(state: GameState): boolean {
  return !!getCurrentEncounter(state) && isActiveIce(state);
}

export function updateCurrentEncounter(
  state: GameState,
  key: keyof Encounter,
  value: unknown,
): void {
  const enc = getCurrentEncounter(state);
  if (!enc) return;
  (enc as Record<string, unknown>)[key as string] = value;
}

export function clearEncounter(state: GameState): void {
  const enc = getCurrentEncounter(state);
  if (!enc) return;
  state.encounters.pop();
  (state as any).perEncounter = null;
  if (enc.eid) effectCompleted(state, null as any, enc.eid);
}

// ---------------------------------------------------------------------------
// Phase setters
// Mirrors: set-phase, set-next-phase
// ---------------------------------------------------------------------------

export function setPhase(state: GameState, phase: string): string {
  if (!state.run) state.run = {} as RunState;
  state.run.phase = phase;
  delete state.run.nextPhase;
  state.run.noAction = false;
  return phase;
}

export function setNextPhase(state: GameState, phase: string): string {
  if (!state.run) state.run = {} as RunState;
  state.run.nextPhase = phase;
  return phase;
}

// ---------------------------------------------------------------------------
// start-next-phase / continue dispatch (mirrors defmulti)
// ---------------------------------------------------------------------------

export function startNextPhase(state: GameState, side: string, eid: EID | null): void {
  const phase = state.run?.nextPhase;
  switch (phase) {
    case "approach-ice":
      return startNextPhaseApproachIce(state, side, eid);
    case "encounter-ice":
      return startNextPhaseEncounterIce(state, side, eid);
    case "movement":
      return startNextPhaseMovement(state, side, eid);
    case "success":
      return startNextPhaseSuccess(state, side, eid);
    default:
      return startNextPhaseDefault(state, side, eid);
  }
}

// Dispatch for `continue` (renamed to runContinue to avoid TS reserved word issues
// in some toolchains; safe here, but kept distinct from the `continue` statement).
export function runContinue(state: GameState, side: string, eid: EID | null): void {
  const phase = getCurrentEncounter(state) ? "encounter-ice" : state.run?.phase;
  switch (phase) {
    case "initiation":
      return continueInitiation(state, side, eid);
    case "approach-ice":
      return continueApproachIce(state, side, eid);
    case "encounter-ice":
      return continueEncounterIce(state, side, eid);
    case "movement":
      return continueMovement(state, side, eid);
    default:
      return continueDefault(state, side, eid);
  }
}

// ---------------------------------------------------------------------------
// make-run
// Mirrors: make-run in runs.clj
// ---------------------------------------------------------------------------
export function makeRun(state: GameState, side: string, eid: EID, server: unknown, card?: Card | null, args?: { clickRun?: boolean; ignoreCosts?: boolean } | null): void;
export function makeRun(...rawArgs: any[]): void;
export function makeRun(...rawArgs: any[]): void {
  let state: GameState, side: string, eid: EID, server: unknown;
  let card: Card | null = null;
  let args: { clickRun?: boolean; ignoreCosts?: boolean } | null = null;
  if (rawArgs.length >= 4 && typeof rawArgs[2] === "object" && rawArgs[2] !== null && "id" in rawArgs[2]) {
    state = rawArgs[0]; side = rawArgs[1]; eid = rawArgs[2]; server = rawArgs[3];
    card = rawArgs[4] ?? null;
    args = rawArgs[5] ?? null;
  } else if (typeof rawArgs[0] === "object" && rawArgs[0] !== null && "id" in rawArgs[0]) {
    // (eid, server, card) — legacy short form
    eid = rawArgs[0]; server = rawArgs[1]; card = rawArgs[2] ?? null;
    state = (rawArgs[3] as GameState) ?? ({} as GameState);
    side = "runner";
  } else {
    state = rawArgs[0]; side = rawArgs[1]; eid = rawArgs[2]; server = rawArgs[3];
    card = rawArgs[4] ?? null;
    args = rawArgs[5] ?? null;
  }
  const costArgs = { ...(args ?? {}), server: unknownToKw(server) };
  const costs = totalRunCost(state, side, card ?? null, costArgs);
  const runCard = card ? getCard(state, card) ?? card : null;
  (eid as any).sourceType = "make-run";

  const canDo =
    canRun(state, "runner") &&
    canRunServer(state, server) &&
    canPay(state, "runner", eid, runCard, "a run", costs ?? []) !== null;

  if (!canDo) {
    effectCompleted(state, side, eid);
    return;
  }

  if ((state as any).endRun) delete (state as any).endRun.ended;
  if (args?.clickRun) {
    if (!state.runner.register) state.runner.register = {};
    (state.runner.register as Record<string, unknown>)["made-click-run"] = true;
    playSfx(state, side, "click-run");
  }

  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, binds: any) {
        const paymentStr = binds.asyncResult?.msg as string | undefined;
        if (!paymentStr) {
          effectCompleted(s, side, eid);
          return;
        }
        const serverZone =
          typeof server === "string" && server.startsWith(":")
            ? server.slice(1)
            : typeof server === "string"
              ? server
              : (() => {
                  const z = serverToZone(s, String(server));
                  return Array.isArray(z) ? z[z.length - 1] : String(server);
                })();
        const zoneKey = unknownToKw(serverZone);
        const serverList = s.corp.servers as any;
        const serverNode = serverList[zoneKey] ?? serverList.remote?.[zoneKey];
        const ices = (serverNode?.ices ?? []) as Card[];
        const n = ices.length;

        if (paymentStr.length > 0) {
          systemMsg(
            s,
            "runner",
            buildSpendMsg(paymentStr, "make a run on", "makes a run on") +
              zoneToName(unknownToKw(server)) +
              (args?.ignoreCosts ? ", ignoring all costs" : ""),
          );
        }

        const runId = makeEID(s);
        s.perRun = {};
        s.run = {
          runId,
          eid,
          server: [zoneKey],
          position: n,
          corpAutoNoAction: false,
          phase: "initiation",
          // Mirrors: :current-ice nil, :events nil — we only carry the few fields TS uses
        } as RunState;
        if (runCard) {
          const sourceCard = {
            code: runCard.code,
            cid: runCard.cid,
            zone: runCard.zone,
            title: runCard.title,
            side: runCard.side,
            type: runCard.type,
            art: runCard.art,
            implementation: runCard.implementation,
          };
          (state.run as any).sourceCard = sourceCard;
          const updated: Card = {
            ...runCard,
            special: { ...(runCard.special ?? {}), "run-id": runId },
          } as Card;
          update(s, side, updated);
        }

        showRunPrompts(s, `running on ${zoneToName(unknownToKw(server))}`, runCard);

        wait_for(
          s,
          [
            { asyncResult: "result" },
            function (s2: GameState, _e2: EID, _b: any) {
              (s2.run as any).badPublicityAvailable = countBadPub(s2 as any);
              (s2.runner as any).nextRunCredit = 0;
              if (!s2.runner.register) s2.runner.register = {};
              const made = ((s2.runner.register as any)["made-run"] as unknown[]) ?? [];
              made.push(s2.run!.server[0]);
              (s2.runner.register as any)["made-run"] = made;
              const stats = (s2.stats as any)[side]?.runs ?? {};
              stats.started = (stats.started ?? 0) + 1;
              (s2.stats as any)[side] = { ...((s2.stats as any)[side] ?? {}), runs: stats };
              queueEvent(s2, "run", {
                server: s2.run!.server,
                position: n,
                "cost-args": costArgs,
              });
              endOfPhaseCheckpoint(s2, null, makeEIDFrom(s2, eid), "end-of-initiation");
            },
          ],
          [
            gainRunCredits,
            s,
            side,
            makeEIDFrom(s, eid),
            (s.runner as any).nextRunCredit ?? 0,
          ],
        );
      },
    ],
    [pay, state, "runner", makeEIDFrom(state, eid), null, costs ?? []],
  );
}

// ---------------------------------------------------------------------------
// continue :initiation
// ---------------------------------------------------------------------------
function continueInitiation(state: GameState, side: string, _eid: EID | null): void {
  if (!state.run?.noAction) {
    if (state.run) state.run.noAction = side as any;
    if (side === "corp") {
      systemMsg(state, side, "has no further action");
    }
  } else {
    if ((state.run?.position ?? 0) > 0) {
      setNextPhase(state, "approach-ice");
      startNextPhase(state, side, null);
    } else {
      setNextPhase(state, "movement");
      startNextPhase(state, side, null);
    }
  }
}

// ---------------------------------------------------------------------------
// toggle-auto-no-action
// ---------------------------------------------------------------------------
export function toggleAutoNoAction(
  state: GameState,
  _side: string,
  _eid: EID | null,
): void {
  if (!state.run) return;
  state.run.corpAutoNoAction = !state.run.corpAutoNoAction;
  if (
    rezzed(getCurrentIce(state)) &&
    (state.run.phase === "approach-ice" || state.run.phase === "encounter-ice")
  ) {
    runContinue(state, "corp", null);
  }
}

/**
 * If corp-auto-no-action is enabled, presses continue for the corp as long as the only
 * rezzed ice is approached or encountered. Mirrors: check-auto-no-action.
 */
export function checkAutoNoAction(state: GameState): void {
  if (
    state.run &&
    state.run.phase !== "success" &&
    !(state.run.phase === "movement" && state.run.position === 0) &&
    (state.encounters?.length ?? 0) <= 1 &&
    state.run.corpAutoNoAction &&
    (rezzed(getCurrentIce(state)) || state.run.phase === "movement")
  ) {
    runContinue(state, "corp", null);
  }
}

// ---------------------------------------------------------------------------
// check-for-empty-server
// ---------------------------------------------------------------------------
export function checkForEmptyServer(state: GameState): boolean {
  const run = state.run;
  if (!run) return false;
  const serverKey = run.server?.[0];
  if (!serverKey) return false;
  if (!isRemote(serverKey)) return false;
  const remote = (state.corp.servers.remote as Record<string, any>)?.[serverKey as string];
  if (!remote) return true;
  return (remote.content?.length ?? 0) === 0 && (remote.ices?.length ?? 0) === 0;
}

// ---------------------------------------------------------------------------
// encounter-ends
// ---------------------------------------------------------------------------
export function encounterEnds(state: GameState, side: string, eid: EID): void {
  const encounter = getCurrentEncounter(state);
  const ice = getCurrentIce(state);
  updateCurrentEncounter(state, "ending", true);
  if (encounter?.bypass && ice) {
    queueEvent(state, "bypassed-ice", { ice });
    systemMsg(state, "runner", `bypasses ${ice.title}`);
  }
  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _b: any) {
        updateAllSubtypes(s);
        const run = s.run;
        const phase = run?.phase;
        if (checkForEmptyServer(s)) {
          clearEncounter(s);
          handleEndRun(s, side, eid);
          return;
        }
        if (
          (s as any).endRun?.ended ||
          (s.encounters?.length ?? 0) > 1 ||
          !run ||
          run.successful
        ) {
          const refreshed = ice ? getCard(s, ice) : null;
          if (refreshed) {
            resetAllSubs(refreshed);
            updateIceStrength(s, "corp", refreshed);
          }
          clearEncounter(s);
          effectCompleted(s, side, eid);
          return;
        }
        if (s.run?.nextPhase) {
          clearEncounter(s);
          startNextPhase(s, side, eid);
          return;
        }
        if (phase === "encounter-ice") {
          clearEncounter(s);
          setNextPhase(s, "movement");
          startNextPhase(s, side, eid);
          return;
        }
        // default
        const refreshed = ice ? getCard(s, ice) : null;
        if (refreshed) {
          resetAllSubs(refreshed);
          updateIceStrength(s, "corp", refreshed);
        }
        clearEncounter(s);
        effectCompleted(s, side, eid);
      },
    ],
    [
      endOfPhaseCheckpoint,
      state,
      null,
      makeEIDFrom(state, eid),
      "end-of-encounter",
      { ice },
    ],
  );
}

// ---------------------------------------------------------------------------
// start-next-phase :approach-ice
// ---------------------------------------------------------------------------
function startNextPhaseApproachIce(state: GameState, side: string, eid: EID | null): void {
  setPhase(state, "approach-ice");
  setCurrentIce(state);
  resetAllIce(state, side);
  if (state.run) state.run.approachedIce = true;
  checkAutoNoAction(state);
  const phaseEid = makePhaseEID(state, eid);
  const ice = getCurrentIce(state);
  const onApproach = ice ? (cardDef(ice) as any)?.["on-approach"] : null;
  if (ice) {
    systemMsg(state, "runner", `approaches ${cardStr(state, ice)}`);
  }
  if (onApproach && ice) {
    registerPendingEvent(state, "approach-ice", ice, onApproach);
  }
  queueEvent(state, "approach-ice", { ice });
  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _b: any) {
        if (checkForEmptyServer(s) || (s as any).endRun?.ended) {
          handleEndRun(s, side, phaseEid);
        } else {
          effectCompleted(s, side, phaseEid);
        }
      },
    ],
    [
      checkpoint,
      state,
      null,
      makeEIDFrom(state, phaseEid),
      {
        cancelFn: (s: GameState) =>
          !!(s as any).endRun?.ended || checkForEmptyServer(s),
      },
    ],
  );
}

// ---------------------------------------------------------------------------
// continue :approach-ice
// ---------------------------------------------------------------------------
function continueApproachIce(state: GameState, side: string, _eid: EID | null): void {
  if (!state.run?.noAction) {
    if (state.run) state.run.noAction = side as any;
    if (side === "corp") {
      systemMsg(state, side, "has no further action");
    }
    return;
  }
  const phaseEid = makePhaseEID(state, null);
  const approachedIce = getCard(state, getCurrentIce(state));
  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _b: any) {
        if (checkForEmptyServer(s) || (s as any).endRun?.ended) {
          handleEndRun(s, side, phaseEid);
        } else if (rezzed(approachedIce)) {
          setNextPhase(s, "encounter-ice");
          startNextPhase(s, "runner", null);
        } else {
          setNextPhase(s, "movement");
          startNextPhase(s, "runner", null);
        }
      },
    ],
    [
      endOfPhaseCheckpoint,
      state,
      null,
      makeEIDFrom(state, phaseEid),
      "end-of-approach-ice",
    ],
  );
}

// ---------------------------------------------------------------------------
// bypass-ice / can-bypass-ice
// ---------------------------------------------------------------------------
export function bypassIce(state: GameState): void {
  updateCurrentEncounter(state, "bypass", true);
}

export function canBypassIce(state: GameState, side: string, ice: Card | null): boolean {
  if (anyEffects(state, side, "bypass-ice", (v: unknown) => v === false, ice, [])) {
    return false;
  }
  return !!getCurrentEncounter(state)?.bypass;
}

/**
 * Immediately end encounter if:
 *   * run ends
 *   * ice is bypassed
 *   * ice has been moved
 *   * ice is installed but not rezzed
 *   * phase of run changes
 *   * server becomes empty
 */
function shouldEndEncounter(state: GameState, side: string, ice: Card): boolean {
  return (
    !!(state as any).endRun?.ended ||
    canBypassIce(state, side, getCard(state, ice)) ||
    !getCard(state, ice) ||
    !isActiveIce(state, getCard(state, ice)) ||
    !!state.run?.nextPhase ||
    checkForEmptyServer(state)
  );
}

// ---------------------------------------------------------------------------
// preventable-encounter-abi (private helper)
// ---------------------------------------------------------------------------
function preventableEncounterAbi(abi: Ability, ice: Card): Ability {
  return {
    async: true,
    interactive: () => true,
    "ability-name": `${(abi as any)["ability-name"] ?? ice.title} encounter`,
    effect: (state: GameState, side: string, eid: EID, _card: Card | null) => {
      wait_for(
        state,
        [
          { asyncResult: "result" },
          function (s: GameState, _e: EID, binds: any) {
            const remaining = (binds.asyncResult as any)?.remaining ?? 0;
            if (remaining > 0) {
              registerPendingEvent(s, "resolve-ice-encounter-abi", ice, abi);
              queueEvent(s, "resolve-ice-encounter-abi", { ice });
              checkpoint(s, side, eid);
            } else {
              effectCompleted(s, side, eid);
            }
          },
        ],
        [
          resolveEncounterPrevention,
          state,
          side,
          {
            title: `${(abi as any)["ability-name"] ?? ice.title} encounter`,
            card: ice,
          },
        ],
      );
    },
  } as Ability;
}

// ---------------------------------------------------------------------------
// encounter-ice
// ---------------------------------------------------------------------------
export function encounterIce(
  state: GameState,
  side: string,
  eid: EID,
  ice: Card,
): void {
  state.encounters.push({ eid, ice } as Encounter);
  checkAutoNoAction(state);
  const onEncounter = (cardDef(ice) as any)?.["on-encounter"];
  const appliedEncounters = getEffects(state, null as any, "gain-encounter-ability", ice, []) as Ability[];
  const all = [...(appliedEncounters ?? []), onEncounter].filter(Boolean) as Ability[];
  const allEncounters = all.map((abi) => preventableEncounterAbi(abi, ice));
  systemMsg(
    state,
    "runner",
    `encounters ${cardStr(state, ice, { visible: isActiveIce(state, ice) })}`,
  );
  for (const abi of allEncounters) {
    registerPendingEvent(state, "encounter-ice", ice, abi);
  }
  queueEvent(state, "encounter-ice", { ice });
  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _b: any) {
        if (shouldEndEncounter(s, side, ice)) {
          encounterEnds(s, side, eid);
          return;
        }
        const cIce = getCurrentIce(s);
        if (cIce && sameCard(cIce, ice) && (cIce.subroutines?.length ?? 0) === 0) {
          const breaker = s.runner.basicActionCard as Card | null;
          wait_for(
            s,
            [
              { asyncResult: "result" },
              function (s2: GameState, _e2: EID, _b2: any) {
                if (shouldEndEncounter(s2, side, ice)) {
                  encounterEnds(s2, side, eid);
                }
              },
            ],
            [
              triggerEventSimult,
              s,
              side,
              null,
              "subroutines-broken",
              {
                ice: cIce,
                "broken-subroutines": [],
                "breaker-card": breaker,
              },
            ],
          );
        }
      },
    ],
    [
      checkpoint,
      state,
      side,
      makeEID(state),
      { cancelFn: (s: GameState) => shouldEndEncounter(s, side, ice) },
    ],
  );
}

// ---------------------------------------------------------------------------
// start-next-phase :encounter-ice
// ---------------------------------------------------------------------------
function startNextPhaseEncounterIce(state: GameState, side: string, _eid: EID | null): void {
  setPhase(state, "encounter-ice");
  const phaseEid = makePhaseEID(state, null);
  const ice = getCurrentIce(state);
  if (ice) encounterIce(state, side, phaseEid, ice);
}

// ---------------------------------------------------------------------------
// force-ice-encounter
// ---------------------------------------------------------------------------
export function forceIceEncounter(
  state: GameState,
  side: string,
  eid: EID,
  ice: Card | null,
  newState?: string | null,
): void {
  if (!ice) return;
  // clears the broken subs out of the prompt
  const fresh = getCard(state, ice);
  if (fresh) resetAllSubs(fresh);
  showRunPrompts(state, `encountering ${ice.title}`, ice);
  const oldPhase = state.run?.phase;
  if (newState) setPhase(state, newState);
  (state as any).forcedEncounter = ((state as any).forcedEncounter ?? 0) + 1;
  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _b: any) {
        const fe = (s as any).forcedEncounter as number | undefined;
        if (fe && fe > 1) {
          (s as any).forcedEncounter = fe - 1;
        } else {
          delete (s as any).forcedEncounter;
        }
        clearRunPrompts(s);
        if (!s.run && (s.encounters?.length ?? 0) === 0) {
          forcedEncounterCleanup(s, "runner", eid);
        } else {
          if (newState && newState === s.run?.phase && oldPhase) {
            setPhase(s, oldPhase);
          }
          setCurrentIce(s);
          effectCompleted(s, side, eid);
        }
      },
    ],
    [encounterIce, state, side, makeEIDFrom(state, eid), ice],
  );
}

// ---------------------------------------------------------------------------
// continue :encounter-ice
// ---------------------------------------------------------------------------
function continueEncounterIce(state: GameState, side: string, _eid: EID | null): void {
  const encounter = getCurrentEncounter(state);
  const noAction = encounter?.noAction;
  if ((noAction && noAction !== side) || encounter?.bypass) {
    encounterEnds(state, side, makePhaseEID(state, null));
  } else {
    updateCurrentEncounter(state, "noAction", side);
    if (side === "runner") {
      systemMsg(state, side, "has no further action");
    }
  }
}

// ---------------------------------------------------------------------------
// start-next-phase :movement
// ---------------------------------------------------------------------------
function startNextPhaseMovement(state: GameState, side: string, eidIn: EID | null): void {
  const eid = makePhaseEID(state, eidIn);
  const previousPhase = state.run?.phase;
  const pos = state.run?.position ?? 0;
  const currentServer = state.run?.server;
  const ice = getCurrentIce(state);
  const passIce =
    !!(previousPhase === "approach-ice" || previousPhase === "encounter-ice") &&
    !!getCard(state, ice) &&
    getZone(ice)?.[1] === currentServer?.[0];
  const newPosition = passIce ? pos - 1 : pos;
  const passedAllIce = newPosition === 0 || previousPhase === "initiation";

  setPhase(state, "movement");
  if (state.run) state.run.noAction = false;
  if (passIce && ice) {
    systemMsg(state, "runner", `passes ${cardStr(state, ice)}`);
    const nice = getCard(state, ice);
    if (nice) {
      const serverIce = cardToServer(state, nice)?.ices ?? [];
      queueEvent(state, "pass-ice", {
        ice: nice,
        outermost:
          serverIce.length > 0 ? sameCard(nice, serverIce[serverIce.length - 1]) : null,
        "all-subs-broken": allSubsBroken(ice),
      });
    }
  }
  if (state.run) state.run.position = newPosition;
  if (passedAllIce) {
    queueEvent(state, "pass-all-ice", { ice: getCard(state, ice) });
  }
  checkAutoNoAction(state);
  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _b: any) {
        resetAllIce(s, side);
        if (checkForEmptyServer(s) || (s as any).endRun?.ended) {
          handleEndRun(s, side, eid);
        } else if (s.run?.nextPhase) {
          startNextPhase(s, side, eid);
        } else {
          effectCompleted(s, side, eid);
        }
      },
    ],
    [
      checkpoint,
      state,
      side,
      makeEID(state),
      {
        cancelFn: (s: GameState) =>
          !!(s as any).endRun?.ended ||
          currentServer !== s.run?.server ||
          !!s.run?.nextPhase ||
          checkForEmptyServer(s),
      },
    ],
  );
}

// ---------------------------------------------------------------------------
// approach-server
// ---------------------------------------------------------------------------
function approachServer(state: GameState, side: string, eid: EID): void {
  setCurrentIce(state, null);
  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _b: any) {
        systemMsg(s, "runner", `approaches ${zoneToName(s.run!.server[0])}`);
        queueEvent(s, "approach-server", null);
        wait_for(
          s,
          [
            { asyncResult: "result" },
            function (s2: GameState, _e2: EID, _b2: any) {
              if (checkForEmptyServer(s2) || (s2 as any).endRun?.ended) {
                handleEndRun(s2, side, eid);
              } else if (s2.run?.nextPhase) {
                startNextPhase(s2, side, eid);
              } else {
                setNextPhase(s2, "success");
                startNextPhase(s2, side, eid);
              }
            },
          ],
          [
            checkpoint,
            s,
            side,
            makeEID(s),
            {
              cancelFn: (s2: GameState) =>
                checkForEmptyServer(s2) ||
                !!(s2 as any).endRun?.ended ||
                !!s2.run?.nextPhase,
            },
          ],
        );
      },
    ],
    [
      triggerEventSimult,
      state,
      side,
      null,
      "pre-approach-server",
      { server: state.run?.server?.[0] },
    ],
  );
}

// ---------------------------------------------------------------------------
// continue :movement
// ---------------------------------------------------------------------------
function continueMovement(state: GameState, side: string, _eid: EID | null): void {
  if (!state.run?.noAction) {
    if (state.run) state.run.noAction = side as any;
    if (side === "runner") {
      systemMsg(state, side, "will continue the run");
    }
  } else {
    const eid = makePhaseEID(state, null);
    if (checkForEmptyServer(state) || (state as any).endRun?.ended) {
      handleEndRun(state, side, eid);
    } else if ((state.run?.position ?? 0) > 0) {
      setNextPhase(state, "approach-ice");
      startNextPhase(state, side, eid);
    } else {
      approachServer(state, side, eid);
    }
  }
}

// ---------------------------------------------------------------------------
// start-next-phase :success
// ---------------------------------------------------------------------------
function startNextPhaseSuccess(state: GameState, side: string, _eid: EID | null): void {
  setPhase(state, "success");
  if (checkForEmptyServer(state)) {
    handleEndRun(state, side, makePhaseEID(state, null));
  } else {
    successfulRun(state, "runner");
  }
}

// ---------------------------------------------------------------------------
// start-next-phase :default
// ---------------------------------------------------------------------------
function startNextPhaseDefault(state: GameState, _side: string, _eid: EID | null): void {
  if (state.run?.phase !== "success") {
    console.error(
      `start-next-phase :default:\n${nLastLogs(state, 5)}\n`,
      new Error("no phase found and not accessing cards"),
    );
  }
}

function continueDefault(state: GameState, _side: string, _eid: EID | null): void {
  console.error(
    `continue :default:\n${nLastLogs(state, 5)}\n`,
    new Error(`Continue clicked at the wrong time, run phase: ${state.run?.phase}`),
  );
}

// ---------------------------------------------------------------------------
// redirect-run
// ---------------------------------------------------------------------------
export function redirectRun(
  state: GameState,
  side: string,
  server: string,
  phase?: string | null,
): void {
  if (!state.run || state.run.phase === "success") return;
  const zone = serverToZone(state, server);
  const dest = Array.isArray(zone) ? zone[zone.length - 1] : server;
  const numIce =
    ((state.corp.servers as any)[dest]?.ices?.length ??
      (state.corp.servers.remote as any)?.[dest]?.ices?.length ??
      0) as number;
  let effectivePhase = phase ?? null;
  if (effectivePhase === "approach-ice") {
    effectivePhase = numIce > 0 ? "approach-ice" : "movement";
  }
  triggerEvent(state, side, "pre-redirect-server", {
    server: state.run.server?.[0],
    "new-server": dest,
  });
  playSfx(state, side, "redirect");
  state.run.position = numIce;
  state.run.server = [dest];
  if (effectivePhase) setNextPhase(state, effectivePhase);
  setCurrentIce(state);
}

// ---------------------------------------------------------------------------
// gain-run-credits / gain-next-run-credits
// ---------------------------------------------------------------------------
export function gainRunCredits(
  state: GameState,
  _side: string,
  eid: EID,
  n: number,
): void {
  state.runner.runCredit = (state.runner.runCredit ?? 0) + n;
  gainCredits(state, "runner", eid, n, null);
}

export function gainNextRunCredits(n: number): (state: GameState, side: string) => void;
export function gainNextRunCredits(state: GameState, side: string, n: number): void;
export function gainNextRunCredits(...args: any[]): any {
  if (args.length === 1) {
    const n = args[0] as number;
    return (s: GameState, _sd: string) => {
      (s.runner as any).nextRunCredit = ((s.runner as any).nextRunCredit ?? 0) + n;
    };
  }
  const state = args[0] as GameState;
  const n = args[2] as number;
  (state.runner as any).nextRunCredit = ((state.runner as any).nextRunCredit ?? 0) + n;
}

// ---------------------------------------------------------------------------
// Ending runs
// ---------------------------------------------------------------------------

export function addRunEffect(
  state: GameState,
  card: Card,
  ability: Ability,
  props: { mandatory?: boolean },
): void {
  const entry = { card, mandatory: props.mandatory, ability };
  if (!state.run) return;
  if (!state.run.runEffects) state.run.runEffects = [];
  state.run.runEffects.push(entry);
}

export function successfulRunReplaceBreach(props: {
  ability: Ability;
  "target-server"?: string;
  "this-card-run"?: boolean;
  duration?: string;
}): Ability {
  const ability = props.ability;
  const attackedServer = props["target-server"];
  const useThisCardRun = props["this-card-run"];
  const duration = props.duration;
  return {
    event: "successful-run",
    duration,
    req: ((state: GameState, _side: string, _eid: EID, _card: Card | null, targets: unknown[]) => {
      const ctx = targets?.[0] as Record<string, unknown> | undefined;
      const thisCardRun = !!(ctx as any)?.["this-card-run"];
      if (useThisCardRun && !thisCardRun) return false;
      switch (attackedServer) {
        case "archives":
        case "rd":
        case "hq":
          return attackedServer === targetServer({ server: ctx?.server as any });
        case "remote":
          return isRemote(targetServer({ server: ctx?.server as any }));
        default:
          return true;
      }
    }) as any,
    silent: () => true,
    effect: (state: GameState, _side: string, _eid: EID, card: Card | null) => {
      if (card) addRunEffect(state, card, ability, { mandatory: (props as any).mandatory });
    },
  } as Ability;
}

// ---------------------------------------------------------------------------
// choose-replacement-ability
// ---------------------------------------------------------------------------
function chooseReplacementAbility(
  state: GameState,
  handlers: Array<{ card: Card; ability: Ability; mandatory?: boolean }>,
): void {
  const mandatory = handlers.some((h) => h.mandatory);
  const titles = handlers.map((h) => h.card?.title ?? "").filter(Boolean);
  const eid = makePhaseEID(state, null);

  if (state.run?.preventAccess) {
    handleEndRun(state, "runner", eid);
    return;
  }
  if (titles.length === 0) {
    wait_for(
      state,
      [
        { asyncResult: "result" },
        function (s: GameState, _e: EID, _b: any) {
          handleEndRun(s, "runner", eid);
        },
      ],
      [breachServer, state, "runner", makeEID(state), state.run!.server],
    );
    return;
  }
  if (mandatory && titles.length === 1) {
    const chosen = handlers[0];
    systemMsg(state, "runner", `uses the replacement effect from ${chosen.card.title}`);
    wait_for(
      state,
      [
        { asyncResult: "result" },
        function (s: GameState, _e: EID, _b: any) {
          handleEndRun(s, "runner", eid);
        },
      ],
      [
        resolveAbility,
        state,
        "runner",
        chosen.ability,
        chosen.card,
        [{ server: state.run?.server, "run-id": state.run?.runId }],
      ],
    );
    return;
  }
  if (titles.length > 0) {
    const choices = mandatory
      ? titles
      : [...titles, `Breach ${zoneToName(state.run!.server[0])}`];
    resolveAbility(
      state,
      "runner",
      {
        prompt: "Choose a breach replacement ability",
        choices,
        async: true,
        effect: ((s: GameState, _side: string, _eid: EID, _card: Card | null, targets: unknown[]) => {
          const target = targets?.[0] as Card | string;
          const chosen = handlers.find((h) =>
            typeof target === "string"
              ? h.card.title === target
              : sameCard(target as Card, h.card),
          );
          if (chosen) {
            systemMsg(s, "runner", `uses the replacement effect from ${chosen.card.title}`);
            wait_for(
              s,
              [
                { asyncResult: "result" },
                function (s2: GameState, _e2: EID, _b: any) {
                  handleEndRun(s2, "runner", eid);
                },
              ],
              [
                resolveAbility,
                s,
                "runner",
                chosen.ability,
                chosen.card,
                [{ server: s.run?.server, "run-id": s.run?.runId }],
              ],
            );
          } else {
            systemMsg(
              s,
              "runner",
              `chooses to breach ${zoneToName(s.run!.server[0])} instead of use a replacement effect`,
            );
            wait_for(
              s,
              [
                { asyncResult: "result" },
                function (s2: GameState, _e2: EID, _b: any) {
                  handleEndRun(s2, "runner", eid);
                },
              ],
              [breachServer, s, "runner", makeEIDFrom(s, eid), s.run!.server],
            );
          }
        }) as any,
      } as Ability,
      null,
      [],
    );
    return;
  }
  // Just in case
  runCleanup(state, "runner", eid);
}

// ---------------------------------------------------------------------------
// prevent-access
// ---------------------------------------------------------------------------
export function preventAccess(state: GameState, _side?: string): void {
  if (state.run) state.run.preventAccess = true;
}

// ---------------------------------------------------------------------------
// complete-run
// ---------------------------------------------------------------------------
export function completeRun(state: GameState, side: string): void {
  const eid = makePhaseEID(state, null);
  if ((state as any).endRun?.ended) {
    runCleanup(state, "runner", eid);
    return;
  }
  const theRun = state.run!;
  const server = theRun.server;
  const replacementEffects = (theRun.runEffects ?? []) as Array<{
    card: Card;
    ability: Ability;
    mandatory?: boolean;
  }>;

  if (theRun.preventAccess) {
    resolveAbility(
      state,
      "runner",
      {
        prompt: `You are prevented from breaching ${zoneToName(server[0])} this run.`,
        choices: ["OK"],
        async: true,
        effect: ((s: GameState, _side: string, _eid: EID, _card: Card | null) => {
          systemMsg(
            s,
            "runner",
            `is prevented from breaching ${zoneToName(server[0])} this run.`,
          );
          handleEndRun(s, side, eid);
        }) as any,
      } as Ability,
      null,
      [],
    );
  } else if (replacementEffects.length > 0) {
    chooseReplacementAbility(state, replacementEffects);
  } else {
    wait_for(
      state,
      [
        { asyncResult: "result" },
        function (s: GameState, _e: EID, _b: any) {
          handleEndRun(s, side, eid);
        },
      ],
      [breachServer, state, side, makeEIDFrom(state, eid), server],
    );
  }
}

// ---------------------------------------------------------------------------
// register-successful-run / successful-run
// ---------------------------------------------------------------------------
function registerSuccessfulRun(
  state: GameState,
  side: string,
  eid: EID,
  server: string[],
): void {
  // TODO: :pre-successful-run exists merely for Omar Keung and Sneakdoor Beta
  queueEvent(state, "pre-successful-run", {
    server: state.run?.server,
    "run-id": state.run?.runId,
  });
  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _b: any) {
        if (anyEffects(s, side, "block-successful-run", (v) => !!v, null, [])) {
          effectCompleted(s, side, eid);
          return;
        }
        if (!s.runner.register) s.runner.register = {};
        const successful = ((s.runner.register as any)["successful-run"] as unknown[]) ?? [];
        successful.push(s.run?.server?.[0]);
        (s.runner.register as any)["successful-run"] = successful;
        if (s.run) s.run.successful = true;
        const marked = isMark(s, s.run?.server?.[0] ?? "")
          ? { "marked-server": true }
          : {};
        const keys = {
          server: s.run?.server,
          "run-id": s.run?.runId,
          "subroutines-fired": (s.run as any)?.subroutinesFired,
          ...marked,
        };
        queueEvent(s, "successful-run", keys);
        checkpoint(s, null, eid);
      },
    ],
    [checkpoint, state, null, makeEIDFrom(state, eid)],
  );
}

export function successfulRun(state: GameState, side: string): void {
  if (anyEffects(state, side, "block-successful-run", (v) => !!v, null, [])) {
    completeRun(state, side);
  } else {
    wait_for(
      state,
      [
        { asyncResult: "result" },
        function (s: GameState, _e: EID, _b: any) {
          completeRun(s, side);
        },
      ],
      [
        registerSuccessfulRun,
        state,
        side,
        makePhaseEID(state, null),
        state.run?.server ?? [],
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// register-unsuccessful-run / resolve-end-run
// ---------------------------------------------------------------------------
function registerUnsuccessfulRun(state: GameState, side: string, eid: EID): void {
  const run = state.run!;
  if (!state.runner.register) state.runner.register = {};
  const unsuccessful = ((state.runner.register as any)["unsuccessful-run"] as unknown[]) ?? [];
  unsuccessful.push(run.server?.[0]);
  (state.runner.register as any)["unsuccessful-run"] = unsuccessful;
  run.unsuccessful = true;
  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _b: any) {
        queueEvent(s, "unsuccessful-run", run as any);
        checkpoint(s, null, eid);
      },
    ],
    [handleEndRun, state, side, makeEIDFrom(state, eid)],
  );
}

function resolveEndRun(state: GameState, side: string, eid: EID): void {
  if (!state.run || state.run.successful) {
    handleEndRun(state, side, eid);
  } else {
    registerUnsuccessfulRun(state, side, eid);
  }
}

// ---------------------------------------------------------------------------
// end-run
// ---------------------------------------------------------------------------
export function endRun(eid: EID, card: Card | null): void;
export function endRun(state: GameState, side: string, eid: EID, card: Card | null, args?: { unpreventable?: boolean } | null): void;
export function endRun(...args: any[]): void {
  if (args.length === 2) {
    // shorthand (eid, card) — used in legacy card shims; no state available, no-op.
    return;
  }
  const state = args[0] as GameState;
  const side = args[1] as string;
  const eid = args[2] as EID;
  const card = args[3] as Card | null;
  const argsObj = args[4] as { unpreventable?: boolean } | null | undefined;
  if (state.run || getCurrentEncounter(state)) {
    wait_for(
      state,
      [
        { asyncResult: "result" },
        function (s: GameState, _e: EID, binds: any) {
          const remaining = (binds.asyncResult as any)?.remaining ?? 0;
          if (remaining > 0) {
            resolveEndRun(s, side, eid);
          } else {
            effectCompleted(s, side, eid);
          }
        },
      ],
      [resolveEndRunPrevention, state, side, { ...(argsObj ?? {}), card }],
    );
  } else {
    effectCompleted(state, side, eid);
  }
}

// ---------------------------------------------------------------------------
// resolve-jack-out / jack-out
// ---------------------------------------------------------------------------
function resolveJackOut(state: GameState, side: string, eid: EID): void {
  queueEvent(state, "jack-out", null);
  systemMsg(state, side, "jacks out");
  endRun(state, side, eid, null, { unpreventable: true });
}

export function jackOut(state: GameState, side: string, eid: EID): void {
  if (anyEffects(state, side, "cannot-jack-out", (v: unknown) => v === true, null, [])) {
    systemMsg(state, "runner", "cannot jack out this run");
    completeWithResult(state, side, eid, false);
    return;
  }
  const cost = jackOutCost(state, side);
  if (canPay(state, side, eid, null, "jack out", cost) !== null) {
    wait_for(
      state,
      [
        { asyncResult: "result" },
        function (s: GameState, _e: EID, binds: any) {
          const paymentStr = (binds.asyncResult as any)?.msg as string | undefined;
          if (paymentStr) {
            if (paymentStr.trim().length > 0) {
              systemMsg(s, "runner", `${paymentStr} to jack out`);
            }
            wait_for(
              s,
              [
                { asyncResult: "result" },
                function (s2: GameState, _e2: EID, b2: any) {
                  const remaining = (b2.asyncResult as any)?.remaining ?? 0;
                  if (remaining > 0) {
                    resolveJackOut(s2, side, eid);
                  } else {
                    completeWithResult(s2, side, eid, false);
                  }
                },
              ],
              [resolveJackOutPrevention, s, side, null],
            );
          } else {
            completeWithResult(s, side, eid, false);
          }
        },
      ],
      [pay, state, "runner", null, null, cost],
    );
  } else {
    systemMsg(
      state,
      "runner",
      `attempts to jack out but can't pay (${buildCostString(cost)})`,
    );
    completeWithResult(state, side, eid, false);
  }
}

// ---------------------------------------------------------------------------
// run-end-fx
// ---------------------------------------------------------------------------
function runEndFx(
  state: GameState,
  side: string,
  run: { eid?: EID; successful?: boolean; unsuccessful?: boolean },
): void {
  if (run.successful) {
    playSfx(state, side, "run-successful");
    if (run.eid) completeWithResult(state, side, run.eid, { successful: true });
  } else if (run.unsuccessful) {
    playSfx(state, side, "run-unsuccessful");
    if (run.eid) completeWithResult(state, side, run.eid, { unsuccessful: true });
  } else {
    if (run.eid) completeWithResult(state, side, run.eid, null);
  }
}

// ---------------------------------------------------------------------------
// run-cleanup
// ---------------------------------------------------------------------------
export function runCleanup(state: GameState, side: string, eid: EID): void {
  if (!(state as any).endRun) (state as any).endRun = {};
  (state as any).endRun.ended = true;
  if (getCurrentEncounter(state)) {
    queueEvent(state, "end-of-encounter", { ice: getCurrentIce(state) });
  }
  const marked = isMark(state, state.run?.server?.[0] ?? "");
  const run = marked
    ? { ...(state.run as any), "marked-server": true }
    : (state.run as any);
  const runEid: EID | undefined = run?.eid;
  if (!state.runner.register) state.runner.register = {};
  (state.runner.register as any)["last-run"] = run;
  state.runner.credit -= state.runner.runCredit ?? 0;
  state.runner.runCredit = 0;
  state.run = null;
  if ((state as any).endRun?.ended) delete (state as any).endRun.ended;
  queueEvent(state, "run-ends", run);
  clearEncounter(state);
  clearRunPrompts(state);
  resetAllIce(state, side);
  clearRunRegister(state);
  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _b: any) {
        runEndFx(s, side, run);
        effectCompleted(s, side, eid);
        if (runEid) effectCompleted(s, side, runEid);
      },
    ],
    [
      checkpoint,
      state,
      null,
      makeEIDFrom(state, eid),
      { durations: ["end-of-encounter", "end-of-run", "end-of-next-run"] },
    ],
  );
}

// ---------------------------------------------------------------------------
// forced-encounter-cleanup
// ---------------------------------------------------------------------------
export function forcedEncounterCleanup(
  state: GameState,
  side: string,
  eid: EID,
): void {
  if ((state as any).endRun?.ended) delete (state as any).endRun.ended;
  wait_for(
    state,
    [
      { asyncResult: "result" },
      function (s: GameState, _e: EID, _b: any) {
        resetAllIce(s, side);
        (s as any).perEncounter = null;
        clearRunRegister(s);
        effectCompleted(s, side, eid);
      },
    ],
    [
      checkpoint,
      state,
      null,
      makeEIDFrom(state, eid),
      { durations: ["end-of-encounter", "end-of-run"] },
    ],
  );
}

// ---------------------------------------------------------------------------
// handle-end-run
// Initiate run resolution. Mirrors: handle-end-run in runs.clj
// ---------------------------------------------------------------------------
export function handleEndRun(
  state: GameState,
  side: string,
  eid: EID | null,
): void {
  const effEid = eid ?? makeEID(state);
  const runnerPrompt = state.runner.promptState ?? (state.runnerPrompt?.[0] as any);
  const corpPrompt = state.corp.promptState ?? (state.corpPrompt?.[0] as any);

  if (
    state.run &&
    !getCurrentEncounter(state) &&
    (!runnerPrompt || (runnerPrompt as any).promptType === "run") &&
    (!corpPrompt || (corpPrompt as any).promptType === "run")
  ) {
    runCleanup(state, side, effEid);
    return;
  }

  if (
    !(state as any).endRun?.ended &&
    (state.run || getCurrentEncounter(state))
  ) {
    if (!(state as any).endRun) (state as any).endRun = {};
    (state as any).endRun.ended = true;
    if (state.run) preventAccess(state, side);
    const enc = getCurrentEncounter(state);
    if (enc && !enc.ending) {
      encounterEnds(state, side, effEid);
    } else {
      effectCompleted(state, side, effEid);
    }
    return;
  }

  effectCompleted(state, side, effEid);
}

// ---------------------------------------------------------------------------
// total-cards-accessed
// ---------------------------------------------------------------------------
export function totalCardsAccessed(
  run: { cardsAccessed?: Record<string, number> },
  server?: string,
): number {
  if (server !== undefined) {
    return run.cardsAccessed?.[server] ?? 0;
  }
  const accessed = run.cardsAccessed ?? {};
  return Object.values(accessed).reduce((a, b) => a + b, 0);
}

// ---------------------------------------------------------------------------
// end-of-phase-checkpoint
// Mirrors: end-of-phase-checkpoint in engine.clj
// (Defined here because the only callers live in this file.)
// ---------------------------------------------------------------------------
export function endOfPhaseCheckpoint(
  state: GameState,
  _side: string | null,
  eid: EID,
  event: string,
  context?: Record<string, unknown> | null,
): void {
  if (event) queueEvent(state, event, context ?? null);
  checkpoint(state, null, eid, { duration: event });
}

export { targetServer } from "./servers";
export { offerJackOut } from "./def_helpers_2";

// Access helpers re-exported here because some card files import them via
// `coreRuns.*` (matching how the CLJ namespaces were folded together).
export { accessCard, accessBonus, maxAccess, breachServer } from "./access";
export { setCurrentIce } from "./ice";
export { clearWaitPrompt, cancellable } from "./prompts";

/**
 * Alias of getCurrentEncounter, mirroring the shorter name used by some card
 * files (matches the CLJ `get-current-encounter` ↔ `get-encounter` aliasing).
 */
export function getEncounter(state: GameState): Encounter | undefined {
  return getCurrentEncounter(state);
}

/**
 * Alias of makeRun. Some card files call `coreRuns.startRun(...)`.
 */
export const startRun = makeRun;

/**
 * Mirrors the `this-server` binding from game.macros: returns true when the
 * card is installed in the same server the current run is attacking.
 */
export function thisServer(state: GameState, card: Card | null): boolean {
  if (!card || !state.run) return false;
  const zone = getZone(card);
  const runServer = state.run.server;
  if (!zone || !runServer) return false;
  return (zone as any)[1] === (runServer as any)[0];
}
