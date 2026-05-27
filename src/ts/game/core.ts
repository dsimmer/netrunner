/**
 * Barrel re-export module
 * Ported from Clojure core.clj - re-exports all game.core.* namespaces
 * Only exports from TypeScript files that currently have implementations.
 */

// ---- game.core.access (from core/access.ts) ----
export {
  accessBonus,
  accessBonusCount,
  accessCard,
  accessContinue,
  accessHelperArchives,
  accessHelperHq,
  accessHelperRd,
  accessNonAgenda,
  accessPay,
  accessAgenda,
  accessAbility,
  accessCost,
  accessCostBonus,
  accessNCards,
  archivesInactive,
  breachServer,
  chooseAccess,
  cleanAccessArgs,
  faceupAccessible,
  facedownCards,
  getAllContent,
  getAllHosted,
  getOnlyCardToAccess,
  getServerType,
  installedAccessTrigger,
  interactions,
  joinCostStrs,
  maxAccess,
  msgHandleAccess,
  mustContinue,
  noTrashOrSteal,
  numCardsToAccess,
  registerChooseAccess,
  registerMustContinue,
  registerNumCardsToAccess,
  refusedAccessCost,
  revealAccess,
  rootContent,
  setOnlyCardToAccess,
  steal,
  stealAgenda,
  stealCostBonus,
  turnArchivesFaceup,
  accessEnd,
  accessCardsFromHq,
  accessCardsFromRd,
  accessTriggerEvents,
  accessAb,
  accessAbLabel,
  accessHelperRemote,
} from "./core/access";

// ---- game.core.board (from core/board.ts) ----
export {
  allActive,
  allActiveInstalled,
  allInstalled,
  allInstalledRunnerType,
  cardToServer,
  clearEmptyRemotes,
  getAllInstalled,
  getRemotes,
  getServerZone,
  getZones,
  inPlay,
  installedByName,
  serverToZone,
  allInstalledAndScored,
  allInstalledCorp,
  allInstalledRunner,
  corpServerCards,
  runnerRigCards,
} from "./core/board";

// ---- game.core.card (from core/card.ts) ----
export {
  type Card,
  type Counter,
  type Zone,
  SIDE_CORP,
  SIDE_RUNNER,
  TYPE_AGENDA,
  TYPE_ASSET,
  TYPE_BASIC_ACT,
  TYPE_COUNTER,
  TYPE_EVENT,
  TYPE_FAKE_ID,
  TYPE_HARDWARE,
  TYPE_ICE,
  TYPE_IDENTITY,
  TYPE_OPERATION,
  TYPE_PROGRAM,
  TYPE_RESOURCE,
  TYPE_UPGRADE,
  getCounter,
  getNestedHost,
  getRootZoneIndex,
  getSide,
  getTitle,
  getType,
  getZone,
  hasSubtype,
  inDiscard,
  inHand,
  inRFG,
  inRig,
  inScored,
  inServers,
  inZone,
  isAgenda,
  isAsset,
  isBasicAction,
  isCorp,
  isCorpInstallable,
  isDisabled,
  isEvent,
  isFacedown,
  isHosted,
  isHardware,
  isICE,
  isIdentity,
  isInstalled,
  isOperation,
  isPlayable,
  isProgram,
  isResource,
  isRezzed,
  isRunner,
  isUnique,
  isInstallable,
  isUpgrade,
  printedTitle,
  sameCard,
} from "./core/card";

// ---- game.core.effects (from core/effects.ts) ----
export {
  allDisabledCards,
  anyEffects,
  getEffectMaps,
  getEffects,
  sumEffects,
  registerLingeringEffect,
  registerStaticAbilities,
  updateDisabledCards,
  unregisterEffectByUUID,
  unregisterEffectsForCard,
  unregisterLingeringEffects,
  unregisterStaticAbilities,
  updateLingeringEffectDurations,
} from "./core/effects";

// ---- game.core.eid (from core/eid.ts) ----
export {
  type EID,
  completeWithResult,
  effectCompleted,
  getAbilityTargets,
  isBasicAdvanceAction,
  makeEID,
  makeEIDFrom,
  makeResult,
  registerEIDCallback,
  clearEIDWaitPrompt,
} from "./core/eid";

// ---- game.core.checkpoint (from core/checkpoint.ts) ----
export { checkpoint, fakeCheckpoint } from "./core/checkpoint";

// ---- game.core.moving (from core/moving.ts) ----
export { move, moveStar, moveZone } from "./core/moving";

// ---- game.core.drawing (from core/drawing.ts) ----
export { draw, drawUpTo, maxDraw, remainingDraws, drawBonus } from "./core/drawing";

// ---- game.core.damage (from core/damage.ts) ----
export { damage, damageName } from "./core/damage";

// ---- game.core.purging (from core/purging.ts) ----
export { purge } from "./core/purging";

// ---- game.core.def-helpers (from core/def_helpers.ts) ----
export {
  takeCredits,
  takeNCreditsAbility,
  takeAllCreditsAbility,
  spendCredits,
} from "./core/def_helpers";

// ---- game.core.finding (from core/finding.ts) ----
export {
  findCard,
  findCID,
  findLatest,
  getCard,
  getAllCards,
  getScoringOwner,
} from "./core/finding";

// ---- game.core.gaining (from core/gaining.ts) ----
export {
  gain,
  lose,
  gainCredits,
  loseCredits,
  gainClicks,
  loseClicks,
  getCredits,
  getClicks,
} from "./core/gaining";

// ---- game.core.hand-size (from core/hand_size.ts) ----
export {
  corpHandSizePlus,
  handSizeEffective,
  handSizePlus,
  handSizeTotal,
  runnerHandSizePlus,
  updateHandSize,
} from "./core/hand_size";

// ---- game.core.link (from core/link.ts) ----
export { getLink, linkPlus, updateLink } from "./core/link";

// ---- game.core.tags (from core/tags.ts) ----
export { gainTags, loseTags } from "./core/tags";

// ---- game.core.trace (from core/trace.ts) ----
export { initTrace, initTraceSimple, initTraceWithTrace } from "./core/trace";

// ---- game.core.initializing (from core/initializing.ts) ----
export { makeCard, resetCard } from "./core/initializing";

// ---- game.core.say (from core/say.ts) ----
export {
  enforceMsg,
  hRef,
  indicateAction,
  implementationMsg,
  makeMessage,
  makeSystemMessage,
  multiMsg,
  nLastLogs,
  playSfx,
  say,
  systemMsg,
  systemMsgHR,
  systemSay,
  unsafeSay,
} from "./core/say";

// ---- game.core.state (from core/state.ts) ----
export {
  type BadPublicity,
  type Corp,
  type DamageState,
  type Effect,
  type Encounter,
  type FlagEntry,
  type FlagStack,
  type GameEvent,
  type GameState,
  type GameStats,
  type HandSize,
  type Log,
  type LogEntry,
  type Memory,
  type PhaseState,
  type PSIState,
  type Prompt,
  type RegisteredEvent,
  type Rig,
  type Runner,
  type RunState,
  type Servers,
  type ServerZone,
  type Tags,
  CORP_SIDE,
  RUNNER_SIDE,
  getPlayer,
  getSidePrompt,
  makeRID,
  newCorp,
  newGameState,
  newRunner,
  setSidePrompt,
} from "./core/state";

// ---- game.core.toasts (from core/toasts.ts) ----
export {
  type ToastEntry,
  ackToast,
  showErrorToast,
  toast,
} from "./core/toasts";

// ---- game.core.commands (from core/commands.ts) ----
export {
  commandAdvCounter,
  commandBugReport,
  commandChooseHqAccesses,
  commandClosePrompt,
  commandCounter,
  commandDerez,
  commandEnableApiAccess,
  commandFacedown,
  commandHost,
  commandInstall,
  commandInstallFree,
  commandInstallIce,
  commandPeek,
  commandReloadId,
  commandReplaceId,
  commandRezAll,
  commandRoll,
  commandSaveReplay,
  commandScore,
  commandSetMark,
  commandSummon,
  commandSwapSides,
  commandTrash,
  commandUndoClick,
  commandUndoPaidAbility,
  commandUndoTurn,
  commandUnique,
  constrainValue,
  lobbyCommand,
  parseCommand,
  executeCommand,
} from "./core/commands";

// ---- game.core.process-actions (from core/process_actions.ts) ----
export {
  commandParser,
  processAction,
  setProperty,
} from "./core/process_actions";

// ---- game.core.rezzing (from core/rezzing.ts) ----
export {
  rez,
  derez,
  getRezCost,
  canPayToRez,
} from "./core/rezzing";

// ---- game.macros (from macros.ts) ----
export {
  continueAbility,
  effect,
  getForm,
  msg,
  req,
  wait_for,
  whenLetStar,
  forms,
  findUndefinedLocals,
  emitOnly,
  effectStateHandler,
} from "./macros";

// ---- game.core.runs (from core/runs.ts) ----
export {
  totalRunCost,
  getRunnableZones,
  canRunServer,
  getCurrentEncounter,
  activeEncounter,
  updateCurrentEncounter,
  clearEncounter,
  setPhase,
  setNextPhase,
  startNextPhase,
  runContinue,
  makeRun,
  toggleAutoNoAction,
  checkAutoNoAction,
  checkForEmptyServer,
  bypassIce,
  canBypassIce,
  encounterIce,
  forceIceEncounter,
  redirectRun,
  gainRunCredits,
  gainNextRunCredits,
  addRunEffect,
  successfulRunReplaceBreach,
  preventAccess,
  completeRun,
  successfulRun,
  endRun,
  jackOut,
  runCleanup,
  forcedEncounterCleanup,
  handleEndRun,
  totalCardsAccessed,
  endOfPhaseCheckpoint,
} from "./core/runs";
export { runContinue as continue } from "./core/runs";

// ---- game.core.ice (from core/ice_1.ts) ----
export {
  getRunIces,
  getCurrentIce,
  setCurrentIce,
  isActiveIce,
  buildSub,
  breakSubroutine,
  breakSubroutineEx,
  breakAllSubroutines,
  breakAllSubroutinesEx,
  anySubsBroken,
  allSubsBroken,
  anySubsBrokenByCard,
  allSubsBrokenByCard,
  dontResolveSubroutine,
  dontResolveSubroutineEx,
  dontResolveAllSubroutines,
  dontResolveAllSubroutinesEx,
  resetAllSubs,
  resetAllSubsEx,
  resetAllIce,
  unbrokenSubroutinesChoice,
  breakableSubroutinesChoice,
  resolveSubroutineEx,
  resolveUnbrokenSubsEx,
  getStrength,
  getPumpStrength,
  iceStrengthBonus,
  sumIceStrengthEffects,
  iceStrength,
  updateIceStrength,
  reconcileSubroutines,
} from "./core/ice_1";

// ---- game.core.events (from core/events.ts) ----
export {
  turnEvents,
  lastTurn,
  notLastTurn,
  noEvent,
  eventCount,
  firstEvent,
  secondEvent,
  firstSuccessfulRunOnServer,
  firstTrash,
  getTurnDamage,
  getInstalledTrashed,
  firstInstalledTrash,
  firstInstalledTrashOwn,
  runEvents,
  noRunEvent,
  runEventCount,
  firstRunEvent,
} from "./core/events";

// ---- game.core.diffs (from core/diffs.ts) ----
export { iconSummary } from "./core/diffs";

// ---- game.core.actions (from core/actions_2.ts) ----
export { clickAdvance } from "./core/actions_2";

// ---- game.core.props (from core/props.ts) ----
export {
  addProp,
  addCounter,
  setProp,
} from "./core/props";

// ---- Re-export shared types (from core/types.ts) ----
export {
  type Ability,
  type AbilityFn,
  type CardDef,
  type ChoicesSpec,
  type Cost,
  type EventHandler,
  type MsgFn,
  type NumberFn,
  type PsiAbility,
  type ReqFn,
  type StaticAbility,
  type Subroutine,
  type TraceAbility,
  type ValueFn,
  getCardDef,
  registerCard,
} from "./core/types";
